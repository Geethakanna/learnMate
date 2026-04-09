import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface AttemptRow {
  id: string;
  score: number;
  total_questions: number;
  completed_at: string;
  quiz_title: string;
  document_title: string;
}

export function QuizHistory() {
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // Fetch quiz attempts with quiz and document names
    const { data: raw } = await supabase
      .from('quiz_attempts')
      .select('id, score, total_questions, completed_at, quiz_id')
      .eq('user_id', user.id)
      .order('completed_at', { ascending: false })
      .limit(50);

    if (!raw || raw.length === 0) { setLoading(false); return; }

    const quizIds = [...new Set(raw.map(r => r.quiz_id))];
    const { data: quizzes } = await supabase
      .from('quizzes')
      .select('id, title, document_id')
      .in('id', quizIds);

    const docIds = [...new Set((quizzes || []).map(q => q.document_id).filter(Boolean))] as string[];
    const { data: docs } = await supabase
      .from('documents')
      .select('id, title')
      .in('id', docIds);

    const quizMap: Record<string, { title: string; document_id: string | null }> = {};
    (quizzes || []).forEach(q => { quizMap[q.id] = { title: q.title, document_id: q.document_id }; });
    const docMap: Record<string, string> = {};
    (docs || []).forEach(d => { docMap[d.id] = d.title; });

    setAttempts(raw.map(r => ({
      id: r.id,
      score: r.score,
      total_questions: r.total_questions,
      completed_at: r.completed_at,
      quiz_title: quizMap[r.quiz_id]?.title || 'Unknown Quiz',
      document_title: quizMap[r.quiz_id]?.document_id
        ? (docMap[quizMap[r.quiz_id].document_id!] || 'Unknown Document')
        : 'Unknown Document',
    })));
    setLoading(false);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (attempts.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          No quiz attempts yet. Take a quiz to see your history!
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <History className="w-4 h-4" />
          Quiz History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {attempts.map(a => {
            const pct = a.total_questions > 0 ? Math.round((a.score / a.total_questions) * 100) : 0;
            return (
              <div key={a.id} className="flex items-center justify-between p-2 rounded bg-muted/50">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{a.quiz_title}</span>
                  <span className="text-xs text-muted-foreground">{a.document_title}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={pct >= 70 ? "default" : "destructive"}>
                    {pct}%
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {a.score}/{a.total_questions} · {new Date(a.completed_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
