import { supabase } from "@/integrations/supabase/client";

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

// Update MCQ stats after a quiz attempt
export async function updateMcqStats(
  documentId: string,
  attempted: number,
  correct: number
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Upsert mcq_stats for this document
  const { data: existing } = await supabase
    .from('mcq_stats' as any)
    .select('*')
    .eq('user_id', user.id)
    .eq('document_id', documentId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('mcq_stats' as any)
      .update({
        total_attempts: (existing as any).total_attempts + attempted,
        correct_answers: (existing as any).correct_answers + correct,
        incorrect_answers: (existing as any).incorrect_answers + (attempted - correct),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('document_id', documentId);
  } else {
    await supabase.from('mcq_stats' as any).insert({
      user_id: user.id,
      document_id: documentId,
      total_attempts: attempted,
      correct_answers: correct,
      incorrect_answers: attempted - correct,
    });
  }

  // Update aggregate progress
  await updateProgress(user.id, { mcq_attempted: attempted, mcq_correct: correct });
}

// Update flashcard stats
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

  const increments: Record<string, number> = {};
  if (action === 'view') increments.viewed_count = 1;
  if (action === 'complete') increments.completed_count = 1;
  if (action === 'revisit') increments.revisit_count = 1;

  if (existing) {
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (action === 'view') updates.viewed_count = (existing as any).viewed_count + 1;
    if (action === 'complete') updates.completed_count = (existing as any).completed_count + 1;
    if (action === 'revisit') updates.revisit_count = (existing as any).revisit_count + 1;

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

  // Recalculate topics_completed (count of distinct documents with quiz attempts)
  const { count } = await supabase
    .from('quiz_attempts')
    .select('quiz_id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (count !== null) {
    await supabase
      .from('user_progress' as any)
      .update({ topics_completed: count })
      .eq('user_id', userId);
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

  // Calculate accuracy
  const accuracy = progress.total_mcq_attempted > 0
    ? Math.round((progress.total_mcq_correct / progress.total_mcq_attempted) * 100)
    : 0;

  // Find weak areas: documents where accuracy < 50%
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
