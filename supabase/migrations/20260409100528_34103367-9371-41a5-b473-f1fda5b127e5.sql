
-- Add unique constraint on mcq_stats(user_id, document_id)
ALTER TABLE public.mcq_stats
ADD CONSTRAINT mcq_stats_user_document_unique UNIQUE (user_id, document_id);

-- Add unique constraint on flashcard_stats(user_id, document_id)
ALTER TABLE public.flashcard_stats
ADD CONSTRAINT flashcard_stats_user_document_unique UNIQUE (user_id, document_id);
