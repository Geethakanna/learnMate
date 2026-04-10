import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Flame, Target, BookOpen, TrendingUp, AlertTriangle, RefreshCw } from "lucide-react";
import { generateReport } from "@/lib/tracking";
import { supabase } from "@/integrations/supabase/client";
import { QuizHistory } from "@/components/QuizHistory";

interface ReportData {
  current_level: string;
  accuracy_percent: number;
  total_time_spent_seconds: number;
  total_mcq_attempted: number;
  total_mcq_correct: number;
  total_flashcards_viewed: number;
  total_flashcards_completed: number;
  topics_completed: number;
  streak: { current: number; longest: number; last_active: string | null };
  weak_areas: { document_id: string; accuracy: number; attempts: number }[];
  per_document_mcq: any[];
  per_document_flashcards: any[];
  recent_activity: any[];
}

export function ProgressReport() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [docNames, setDocNames] = useState<Record<string, string>>({});

  const loadReport = async () => {
    setLoading(true);
    const data = await generateReport();
    setReport(data);

    // Load document names for weak areas
    if (data?.weak_areas?.length) {
      const ids = data.weak_areas.map((w: any) => w.document_id);
      const { data: docs } = await supabase
        .from('documents')
        .select('id, title')
        .in('id', ids);
      if (docs) {
        const map: Record<string, string> = {};
        docs.forEach((d: any) => { map[d.id] = d.title; });
        setDocNames(map);
      }
    }
    setLoading(false);
  };

  useEffect(() => { loadReport(); }, []);

  if (loading) {
    return (
      <Card className="max-w-3xl mx-auto">
        <CardContent className="p-8 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!report) {
    return (
      <Card className="max-w-3xl mx-auto">
        <CardContent className="p-8 text-center text-muted-foreground">
          No data available yet. Start learning to see your progress!
        </CardContent>
      </Card>
    );
  }

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const levelColor = (level: string) => {
    switch (level) {
      case 'Advanced': return 'text-green-500';
      case 'Intermediate': return 'text-yellow-500';
      default: return 'text-blue-500';
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Learning Report</h2>
          <p className="text-muted-foreground text-sm">Calculated from your actual activity data</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadReport}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Level & Streak */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-500" />
            Streak
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{report.streak.current} <span className="text-lg font-normal text-muted-foreground">days</span></p>
          <p className="text-xs text-muted-foreground mt-1">
            Longest: {report.streak.longest} days
            {report.streak.last_active && ` · Last active: ${new Date(report.streak.last_active).toLocaleDateString()}`}
          </p>
        </CardContent>
      </Card>

      {/* MCQ Stats */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="w-4 h-4" />
            Quiz Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Accuracy</span>
            <span className="font-bold text-lg">{report.accuracy_percent}%</span>
          </div>
          <Progress value={report.accuracy_percent} className="h-2" />
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{report.total_mcq_attempted}</p>
              <p className="text-xs text-muted-foreground">Attempted</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-500">{report.total_mcq_correct}</p>
              <p className="text-xs text-muted-foreground">Correct</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-destructive">{report.total_mcq_attempted - report.total_mcq_correct}</p>
              <p className="text-xs text-muted-foreground">Incorrect</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Flashcard Stats */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            Flashcard Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{report.total_flashcards_viewed}</p>
              <p className="text-xs text-muted-foreground">Viewed</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-500">{report.total_flashcards_completed}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{report.topics_completed}</p>
              <p className="text-xs text-muted-foreground">Topics</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Time Spent */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Total Time Spent
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{formatTime(report.total_time_spent_seconds)}</p>
        </CardContent>
      </Card>

      {/* Weak Areas */}
      {report.weak_areas.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              Weak Areas (Below 50% accuracy)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.weak_areas.map((area) => (
              <div key={area.document_id} className="flex items-center justify-between p-2 rounded bg-muted/50">
                <span className="text-sm">{docNames[area.document_id] || 'Unknown document'}</span>
                <div className="flex items-center gap-3">
                  <Badge variant="destructive">{area.accuracy}%</Badge>
                  <span className="text-xs text-muted-foreground">{area.attempts} attempts</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      {report.recent_activity.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {report.recent_activity.slice(0, 20).map((a: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm py-1">
                  <span className="text-muted-foreground">{a.action_type.replace(/_/g, ' ')}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quiz History */}
      <QuizHistory />
    </div>
  );
}
