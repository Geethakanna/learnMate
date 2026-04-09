

# QA Assessment & Feature Suggestions for Learn Mate

After reviewing the entire codebase, here are the gaps, bugs, and feature opportunities organized by priority.

---

## Bugs & Issues Found

1. **`topics_completed` counts quiz attempts, not distinct documents** -- `tracking.ts:155-158` counts `quiz_attempts` rows by `quiz_id`, not distinct `document_id`. A user taking the same quiz twice inflates their topic count and could trigger incorrect level progression.

2. **Race condition in upsert logic** -- `updateMcqStats` and `updateFlashcardStats` use select-then-insert/update instead of a proper `upsert`. Two concurrent calls can both see "no existing row" and double-insert.

3. **Flashcard `nextCard` fires tracking on every navigation** -- Every tap of the "next" button logs a `flashcard_viewed` activity and increments `viewed_count`. This over-counts views and pollutes activity logs.

4. **`total_time_spent_seconds` is never updated** -- The `time_seconds` delta path exists in `updateProgress` but nothing ever calls it. The Progress Report always shows `0s`.

5. **No mobile navigation** -- The nav tabs are `hidden md:flex`. On mobile, users cannot switch between Documents, Ask AI, Flashcards, Quizzes, or Progress.

---

## High-Value Features to Add

### 1. Session Duration Tracking
Track actual time spent per view (documents, Q&A, flashcards, quizzes). Use a simple timer that starts when a view mounts and logs elapsed seconds when the user navigates away.
- **Files**: `src/lib/tracking.ts` (add `startSession`/`endSession`), `src/pages/Dashboard.tsx` (call on view change)
- **Database**: Uses existing `total_time_spent_seconds` column -- no migration needed

### 2. Quiz History & Past Scores
Show a list of previous quiz attempts with date, score, and document name so users can track improvement over time.
- **Files**: New `src/components/QuizHistory.tsx`, integrate into Dashboard Progress tab
- **Database**: Already stored in `quiz_attempts` -- just needs a query + UI

### 3. Spaced Repetition for Flashcards
Mark flashcards as "Know" / "Don't Know" and resurface weak cards more frequently. Track mastery per card.
- **Database**: Add `mastery_level` and `next_review_at` columns to `flashcards`
- **Files**: Update `FlashcardViewer.tsx` with Know/Don't Know buttons

### 4. Per-Document Performance Breakdown
Show accuracy, attempts, and flashcard progress per document in a table or chart on the Progress page.
- **Files**: Enhance `ProgressReport.tsx` with per-document stats (data already in `mcq_stats` and `flashcard_stats`)

### 5. Mobile Navigation Drawer
Add a hamburger menu or bottom tab bar for mobile users to access all sections.
- **Files**: `src/pages/Dashboard.tsx` -- add Sheet/Drawer for mobile nav

### 6. Streak Calendar Heatmap
Visual calendar showing active study days (like GitHub contributions), derived from `user_activity_log`.
- **Files**: New component using existing activity data

### 7. Export Progress Report
Let users download their progress report as a PDF with all stats, streaks, and weak areas.

---

## Recommended Implementation Order

| Priority | Item | Effort |
|----------|------|--------|
| 1 | Fix `topics_completed` distinct count bug | Small |
| 2 | Fix upsert race conditions (use DB upsert) | Small |
| 3 | Fix flashcard over-counting on navigation | Small |
| 4 | Add session duration tracking | Medium |
| 5 | Add mobile navigation | Medium |
| 6 | Add quiz history view | Medium |
| 7 | Add per-document breakdown to Progress | Medium |
| 8 | Add spaced repetition | Large |
| 9 | Add streak calendar heatmap | Medium |
| 10 | Add export report | Medium |

---

## Technical Notes

- All bug fixes are localized to `src/lib/tracking.ts` and component files -- no schema changes needed for items 1-4
- For the upsert fix, use Supabase `.upsert()` with `onConflict: 'user_id,document_id'` (requires adding a unique constraint via migration)
- Session duration can use `beforeunload` + `visibilitychange` events to capture time even on tab close
- Quiz history only needs a new SELECT query against `quiz_attempts` joined with `quizzes` and `documents`

