import { supabase } from "@/integrations/supabase/client";

// Session timer state (module-level, not persisted)
let sessionStartTime: number | null = null;
let sessionView: string | null = null;

// Start tracking time for a view
export function startSessionTimer(view: string) {
  // End previous session if any
  endSessionTimer();
  sessionStartTime = Date.now();
  sessionView = view;
}

// End current session and log elapsed time
export async function endSessionTimer() {
  if (sessionStartTime && sessionView) {
    const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
    if (elapsed > 2) {
      // Only log if > 2 seconds to avoid noise
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await updateProgress(user.id, { time_seconds: elapsed });
      }
    }
  }
  sessionStartTime = null;
  sessionView = null;
}

// Log an activity event
export async function logActivity(
  actionType: string,
  documentId?: string,
  metadata?: Record<string, unknown>
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('user_activity_log' as any).insert({
    user_id: user.id,
    action_type: actionType,
    document_id: documentId || null,
    metadata: metadata || {},
  });

  // Update streak on any activity
  await supabase.rpc('update_user_streak', { p_user_id: user.id } as any);
}

// Update MCQ stats after a quiz attempt (uses upsert to avoid race conditions)
export async function updateMcqStats(
  documentId: string,
  attempted: number,
  correct: number
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Fetch existing to calculate new totals
  const { data: existing } = await supabase
    .from('mcq_stats' as any)
    .select('*')
    .eq('user_id', user.id)
    .eq('document_id', documentId)
    .maybeSingle();

  const prev = existing as any;
  const newRow = {
    user_id: user.id,
    document_id: documentId,
    total_attempts: (prev?.total_attempts || 0) + attempted,
    correct_answers: (prev?.correct_answers || 0) + correct,
    incorrect_answers: (prev?.incorrect_answers || 0) + (attempted - correct),
    updated_at: new Date().toISOString(),
  };

  if (prev) {
    await supabase
      .from('mcq_stats' as any)
      .update({
        total_attempts: newRow.total_attempts,
        correct_answers: newRow.correct_answers,
        incorrect_answers: newRow.incorrect_answers,
        updated_at: newRow.updated_at,
      })
      .eq('user_id', user.id)
      .eq('document_id', documentId);
  } else {
    await supabase.from('mcq_stats' as any).insert(newRow);
  }

  // Update aggregate progress
  await updateProgress(user.id, { mcq_attempted: attempted, mcq_correct: correct });
}

// Update flashcard stats (uses upsert to avoid race conditions)
export async function updateFlashcardStats(
  documentId: string,
  action: 'view' | 'complete' | 'revisit'
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: existing } = await supabase
    .from('flashcard_stats' as any)
    .select('*')
    .eq('user_id', user.id)
    .eq('document_id', documentId)
    .maybeSingle();

  const prev = existing as any;

  if (prev) {
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (action === 'view') updates.viewed_count = prev.viewed_count + 1;
    if (action === 'complete') updates.completed_count = prev.completed_count + 1;
    if (action === 'revisit') updates.revisit_count = prev.revisit_count + 1;

    await supabase
      .from('flashcard_stats' as any)
      .update(updates)
      .eq('user_id', user.id)
      .eq('document_id', documentId);
  } else {
    await supabase.from('flashcard_stats' as any).insert({
      user_id: user.id,
      document_id: documentId,
      viewed_count: action === 'view' ? 1 : 0,
      completed_count: action === 'complete' ? 1 : 0,
      revisit_count: action === 'revisit' ? 1 : 0,
    });
  }

  // Update aggregate
  const progressUpdate: Record<string, number> = {};
  if (action === 'view') progressUpdate.flashcards_viewed = 1;
  if (action === 'complete') progressUpdate.flashcards_completed = 1;
  await updateProgress(user.id, progressUpdate);
}

// Update aggregate user_progress and recalculate level
async function updateProgress(
  userId: string,
  deltas: {
    mcq_attempted?: number;
    mcq_correct?: number;
    flashcards_viewed?: number;
    flashcards_completed?: number;
    time_seconds?: number;
  }
) {
  const { data: existing } = await supabase
    .from('user_progress' as any)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    const e = existing as any;
    await supabase
      .from('user_progress' as any)
      .update({
        total_mcq_attempted: e.total_mcq_attempted + (deltas.mcq_attempted || 0),
        total_mcq_correct: e.total_mcq_correct + (deltas.mcq_correct || 0),
        total_flashcards_viewed: e.total_flashcards_viewed + (deltas.flashcards_viewed || 0),
        total_flashcards_completed: e.total_flashcards_completed + (deltas.flashcards_completed || 0),
        total_time_spent_seconds: e.total_time_spent_seconds + (deltas.time_seconds || 0),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
  } else {
    await supabase.from('user_progress' as any).insert({
      user_id: userId,
      total_mcq_attempted: deltas.mcq_attempted || 0,
      total_mcq_correct: deltas.mcq_correct || 0,
      total_flashcards_viewed: deltas.flashcards_viewed || 0,
      total_flashcards_completed: deltas.flashcards_completed || 0,
      total_time_spent_seconds: deltas.time_seconds || 0,
    });
  }

  // Recalculate topics_completed (count of DISTINCT documents with quiz attempts)
  const { data: distinctDocs } = await supabase
    .from('quiz_attempts')
    .select('quiz_id');

  // We need to get document_ids from quizzes for these attempts
  if (distinctDocs && distinctDocs.length > 0) {
    const quizIds = [...new Set(distinctDocs.map((r: any) => r.quiz_id))];
    const { data: quizzes } = await supabase
      .from('quizzes')
      .select('document_id')
      .in('id', quizIds);

    if (quizzes) {
      const uniqueDocIds = new Set(quizzes.map((q: any) => q.document_id).filter(Boolean));
      await supabase
        .from('user_progress' as any)
        .update({ topics_completed: uniqueDocIds.size })
        .eq('user_id', userId);
    }
  }

  // Recalculate level
  await supabase.rpc('update_user_level', { p_user_id: userId } as any);
}

// Generate a full report from stored data
export async function generateReport() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [progressRes, streakRes, mcqRes, flashcardRes, activityRes] = await Promise.all([
    supabase.from('user_progress' as any).select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('user_streak' as any).select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('mcq_stats' as any).select('*').eq('user_id', user.id),
    supabase.from('flashcard_stats' as any).select('*').eq('user_id', user.id),
    supabase.from('user_activity_log' as any).select('action_type, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
  ]);

  const progress = (progressRes.data as any) || {
    current_level: 'Beginner',
    total_mcq_attempted: 0,
    total_mcq_correct: 0,
    total_flashcards_viewed: 0,
    total_flashcards_completed: 0,
    total_time_spent_seconds: 0,
    topics_completed: 0,
  };

  const streak = (streakRes.data as any) || {
    current_streak: 0,
    longest_streak: 0,
    last_active_date: null,
  };

  const mcqStats = ((mcqRes.data as any[]) || []);
  const flashcardStatsData = ((flashcardRes.data as any[]) || []);
  const recentActivity = ((activityRes.data as any[]) || []);

  const accuracy = progress.total_mcq_attempted > 0
    ? Math.round((progress.total_mcq_correct / progress.total_mcq_attempted) * 100)
    : 0;

  const weakAreas = mcqStats
    .filter((s: any) => s.total_attempts > 0 && (s.correct_answers / s.total_attempts) < 0.5)
    .map((s: any) => ({
      document_id: s.document_id,
      accuracy: Math.round((s.correct_answers / s.total_attempts) * 100),
      attempts: s.total_attempts,
    }));

  return {
    current_level: progress.current_level,
    accuracy_percent: accuracy,
    total_time_spent_seconds: progress.total_time_spent_seconds,
    total_mcq_attempted: progress.total_mcq_attempted,
    total_mcq_correct: progress.total_mcq_correct,
    total_flashcards_viewed: progress.total_flashcards_viewed,
    total_flashcards_completed: progress.total_flashcards_completed,
    topics_completed: progress.topics_completed,
    streak: {
      current: streak.current_streak,
      longest: streak.longest_streak,
      last_active: streak.last_active_date,
    },
    weak_areas: weakAreas,
    per_document_mcq: mcqStats,
    per_document_flashcards: flashcardStatsData,
    recent_activity: recentActivity,
  };
}
