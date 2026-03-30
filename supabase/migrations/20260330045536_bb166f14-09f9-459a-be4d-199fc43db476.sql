
-- 1. User activity log: tracks every meaningful action
CREATE TABLE public.user_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action_type text NOT NULL,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert own activity" ON public.user_activity_log FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own activity" ON public.user_activity_log FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX idx_activity_user_created ON public.user_activity_log(user_id, created_at DESC);
CREATE INDEX idx_activity_action ON public.user_activity_log(user_id, action_type);

-- 2. User streak tracking
CREATE TABLE public.user_streak (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  current_streak integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  last_active_date date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_streak ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own streak" ON public.user_streak FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own streak" ON public.user_streak FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own streak" ON public.user_streak FOR UPDATE USING (auth.uid() = user_id);

-- 3. User progress (level tracking)
CREATE TABLE public.user_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  current_level text NOT NULL DEFAULT 'Beginner',
  total_mcq_attempted integer NOT NULL DEFAULT 0,
  total_mcq_correct integer NOT NULL DEFAULT 0,
  total_flashcards_viewed integer NOT NULL DEFAULT 0,
  total_flashcards_completed integer NOT NULL DEFAULT 0,
  total_time_spent_seconds integer NOT NULL DEFAULT 0,
  topics_completed integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own progress" ON public.user_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own progress" ON public.user_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own progress" ON public.user_progress FOR UPDATE USING (auth.uid() = user_id);

-- 4. MCQ stats per document
CREATE TABLE public.mcq_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  document_id uuid REFERENCES public.documents(id) ON DELETE CASCADE,
  total_attempts integer NOT NULL DEFAULT 0,
  correct_answers integer NOT NULL DEFAULT 0,
  incorrect_answers integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, document_id)
);
ALTER TABLE public.mcq_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own mcq stats" ON public.mcq_stats FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own mcq stats" ON public.mcq_stats FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own mcq stats" ON public.mcq_stats FOR UPDATE USING (auth.uid() = user_id);

-- 5. Flashcard stats per document
CREATE TABLE public.flashcard_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  document_id uuid REFERENCES public.documents(id) ON DELETE CASCADE,
  viewed_count integer NOT NULL DEFAULT 0,
  completed_count integer NOT NULL DEFAULT 0,
  revisit_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, document_id)
);
ALTER TABLE public.flashcard_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own flashcard stats" ON public.flashcard_stats FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own flashcard stats" ON public.flashcard_stats FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own flashcard stats" ON public.flashcard_stats FOR UPDATE USING (auth.uid() = user_id);

-- 6. Database functions for streak and progress updates
CREATE OR REPLACE FUNCTION public.update_user_streak(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_streak record;
  v_new_current integer;
  v_new_longest integer;
BEGIN
  SELECT * INTO v_streak FROM user_streak WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    INSERT INTO user_streak (user_id, current_streak, longest_streak, last_active_date)
    VALUES (p_user_id, 1, 1, v_today);
    RETURN jsonb_build_object('current_streak', 1, 'longest_streak', 1, 'last_active_date', v_today);
  END IF;
  
  IF v_streak.last_active_date = v_today THEN
    RETURN jsonb_build_object('current_streak', v_streak.current_streak, 'longest_streak', v_streak.longest_streak, 'last_active_date', v_today);
  ELSIF v_streak.last_active_date = v_today - 1 THEN
    v_new_current := v_streak.current_streak + 1;
    v_new_longest := GREATEST(v_streak.longest_streak, v_new_current);
  ELSE
    v_new_current := 1;
    v_new_longest := v_streak.longest_streak;
  END IF;
  
  UPDATE user_streak
  SET current_streak = v_new_current,
      longest_streak = v_new_longest,
      last_active_date = v_today,
      updated_at = now()
  WHERE user_id = p_user_id;
  
  RETURN jsonb_build_object('current_streak', v_new_current, 'longest_streak', v_new_longest, 'last_active_date', v_today);
END;
$$;

-- 7. Function to calculate and update user level
CREATE OR REPLACE FUNCTION public.update_user_level(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_progress record;
  v_accuracy numeric;
  v_new_level text;
BEGIN
  SELECT * INTO v_progress FROM user_progress WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    INSERT INTO user_progress (user_id) VALUES (p_user_id);
    RETURN 'Beginner';
  END IF;
  
  IF v_progress.total_mcq_attempted > 0 THEN
    v_accuracy := (v_progress.total_mcq_correct::numeric / v_progress.total_mcq_attempted::numeric) * 100;
  ELSE
    v_accuracy := 0;
  END IF;
  
  IF v_accuracy >= 80 AND v_progress.topics_completed >= 15 THEN
    v_new_level := 'Advanced';
  ELSIF v_accuracy >= 60 AND v_progress.topics_completed >= 5 THEN
    v_new_level := 'Intermediate';
  ELSE
    v_new_level := 'Beginner';
  END IF;
  
  UPDATE user_progress
  SET current_level = v_new_level, updated_at = now()
  WHERE user_id = p_user_id;
  
  RETURN v_new_level;
END;
$$;
