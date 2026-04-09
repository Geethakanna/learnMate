
-- Table to store dual level system per document per user
CREATE TABLE public.document_user_levels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  initial_level TEXT NOT NULL DEFAULT 'Beginner',
  actual_level TEXT NOT NULL DEFAULT 'Beginner',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, document_id)
);

ALTER TABLE public.document_user_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own levels"
  ON public.document_user_levels FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own levels"
  ON public.document_user_levels FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own levels"
  ON public.document_user_levels FOR UPDATE
  USING (auth.uid() = user_id);

-- Function to compute actual level from performance data
CREATE OR REPLACE FUNCTION public.compute_actual_level(p_user_id UUID, p_document_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stats RECORD;
  v_initial TEXT;
  v_accuracy NUMERIC;
  v_new_level TEXT;
BEGIN
  -- Get initial level
  SELECT initial_level INTO v_initial
  FROM document_user_levels
  WHERE user_id = p_user_id AND document_id = p_document_id;

  IF NOT FOUND THEN
    RETURN 'Beginner';
  END IF;

  -- Get MCQ stats for this document
  SELECT total_attempts, correct_answers INTO v_stats
  FROM mcq_stats
  WHERE user_id = p_user_id AND document_id = p_document_id;

  IF NOT FOUND OR v_stats.total_attempts < 5 THEN
    -- Not enough data, trust initial level
    RETURN v_initial;
  END IF;

  v_accuracy := (v_stats.correct_answers::NUMERIC / v_stats.total_attempts::NUMERIC) * 100;

  -- Rule-based adjustment
  IF v_initial = 'Beginner' THEN
    IF v_accuracy >= 80 THEN
      v_new_level := 'Intermediate';
    ELSE
      v_new_level := 'Beginner';
    END IF;
  ELSIF v_initial = 'Intermediate' THEN
    IF v_accuracy >= 80 THEN
      v_new_level := 'Advanced';
    ELSIF v_accuracy < 30 THEN
      v_new_level := 'Beginner';
    ELSE
      v_new_level := 'Intermediate';
    END IF;
  ELSE -- Advanced
    IF v_accuracy < 40 THEN
      v_new_level := 'Intermediate';
    ELSE
      v_new_level := 'Advanced';
    END IF;
  END IF;

  -- Update actual_level
  UPDATE document_user_levels
  SET actual_level = v_new_level, updated_at = now()
  WHERE user_id = p_user_id AND document_id = p_document_id;

  RETURN v_new_level;
END;
$$;
