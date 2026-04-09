import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type LearningLevel = 'Beginner' | 'Intermediate' | 'Advanced';

/**
 * Returns the effective learning level for a given document.
 * Effective = actual_level (system-calculated), falling back to initial_level.
 */
export function useDocumentLevel(documentId: string | null) {
  const { user } = useAuth();
  const [effectiveLevel, setEffectiveLevel] = useState<LearningLevel>('Beginner');
  const [initialLevel, setInitialLevel] = useState<LearningLevel | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchLevel = useCallback(async () => {
    if (!user || !documentId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('document_user_levels')
        .select('initial_level, actual_level')
        .eq('user_id', user.id)
        .eq('document_id', documentId)
        .maybeSingle();

      if (!error && data) {
        setInitialLevel(data.initial_level as LearningLevel);
        setEffectiveLevel((data.actual_level || data.initial_level) as LearningLevel);
      } else {
        setInitialLevel(null);
        setEffectiveLevel('Beginner');
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user, documentId]);

  useEffect(() => {
    fetchLevel();
  }, [fetchLevel]);

  const refreshLevel = useCallback(async () => {
    if (!user || !documentId) return;
    // Call the DB function to recompute actual level
    try {
      await supabase.rpc('compute_actual_level', {
        p_user_id: user.id,
        p_document_id: documentId,
      });
      await fetchLevel();
    } catch {
      // ignore
    }
  }, [user, documentId, fetchLevel]);

  return { effectiveLevel, initialLevel, loading, refreshLevel, hasLevel: initialLevel !== null };
}
