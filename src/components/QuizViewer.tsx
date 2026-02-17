import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, ArrowRight, RotateCcw, Trophy, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correct_answer: number;
  explanation: string;
}

interface Quiz {
  id: string;
  title: string;
  document_id: string;
  created_at: string;
}

interface QuizViewerProps {
  documentId: string | null;
  userId: string;
}

export function QuizViewer({ documentId, userId }: QuizViewerProps) {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [answers, setAnswers] = useState<number[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [score, setScore] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (documentId) {
      fetchQuizzes();
    }
  }, [documentId]);

  const fetchQuizzes = async () => {
    if (!documentId) return;
    
    setIsLoading(true);
    const { data, error } = await supabase
      .from('quizzes')
      .select('*')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching quizzes:', error);
    } else {
      setQuizzes(data || []);
    }
    setIsLoading(false);
  };

  const generateQuiz = async () => {
    if (!documentId) return;
    
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-quiz', {
        body: { documentId, questionCount: 10 }
      });

      if (error) throw error;

      toast({
        title: "Quiz Generated!",
        description: `Created ${data.question_count} questions`,
      });

      await fetchQuizzes();
    } catch (error: any) {
      console.error('Error generating quiz:', error);
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const startQuiz = async (quiz: Quiz) => {
    setSelectedQuiz(quiz);
    setIsLoading(true);
    
    const { data, error } = await supabase
      .from('quiz_questions')
      .select('*')
      .eq('quiz_id', quiz.id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching questions:', error);
      toast({ title: "Error loading quiz", variant: "destructive" });
    } else {
      const mappedQuestions: QuizQuestion[] = (data || []).map(q => ({
        id: q.id,
        question: q.question,
        options: Array.isArray(q.options) ? q.options as string[] : [],
        correct_answer: q.correct_answer,
        explanation: q.explanation || '',
      }));
      setQuestions(mappedQuestions);
      setCurrentQuestionIndex(0);
      setAnswers([]);
      setIsComplete(false);
      setScore(0);
    }
    setIsLoading(false);
  };

  const handleAnswerSelect = (value: string) => {
    setSelectedAnswer(value);
  };

  const handleSubmitAnswer = () => {
    if (selectedAnswer === null) return;
    
    const answerIndex = parseInt(selectedAnswer);
    const newAnswers = [...answers, answerIndex];
    setAnswers(newAnswers);
    setShowResult(true);
  };

  const handleNextQuestion = async () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedAnswer(null);
      setShowResult(false);
    } else {
      // Quiz complete
      const correctCount = answers.reduce((acc, answer, idx) => {
        return acc + (answer === questions[idx].correct_answer ? 1 : 0);
      }, 0) + (parseInt(selectedAnswer || "0") === questions[currentQuestionIndex].correct_answer ? 1 : 0);
      
      setScore(correctCount);
      setIsComplete(true);

      // Save attempt
      await supabase.from('quiz_attempts').insert({
        user_id: userId,
        quiz_id: selectedQuiz!.id,
        score: correctCount,
        total_questions: questions.length,
        answers: [...answers, parseInt(selectedAnswer || "0")],
      });
    }
  };

  const resetQuiz = () => {
    setSelectedQuiz(null);
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setShowResult(false);
    setAnswers([]);
    setIsComplete(false);
    setScore(0);
  };

  const currentQuestion = questions[currentQuestionIndex];
  const isCorrect = selectedAnswer !== null && parseInt(selectedAnswer) === currentQuestion?.correct_answer;
  const progress = questions.length > 0 ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0;

  if (!documentId) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardContent className="p-8 text-center text-muted-foreground">
          Select a document to generate or take a quiz
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardContent className="p-8 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (isComplete) {
    const percentage = Math.round((score / questions.length) * 100);
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <Trophy className={`h-16 w-16 ${percentage >= 70 ? 'text-yellow-500' : 'text-muted-foreground'}`} />
          </div>
          <CardTitle className="text-2xl">Quiz Complete!</CardTitle>
          <CardDescription>Here's how you did</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center">
            <p className="text-5xl font-bold text-primary">{percentage}%</p>
            <p className="text-muted-foreground mt-2">
              {score} out of {questions.length} correct
            </p>
          </div>
          
          <Progress value={percentage} className="h-3" />
          
          <div className="flex justify-center gap-4">
            <Button onClick={resetQuiz} variant="outline">
              <RotateCcw className="mr-2 h-4 w-4" />
              Back to Quizzes
            </Button>
            <Button onClick={() => startQuiz(selectedQuiz!)}>
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (selectedQuiz && currentQuestion) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <div className="flex items-center justify-between mb-2">
            <Badge variant="secondary">
              Question {currentQuestionIndex + 1} of {questions.length}
            </Badge>
            <Button variant="ghost" size="sm" onClick={resetQuiz}>
              Exit Quiz
            </Button>
          </div>
          <Progress value={progress} className="h-2" />
        </CardHeader>
        <CardContent className="space-y-6">
          <h3 className="text-lg font-semibold">{currentQuestion.question}</h3>
          
          <RadioGroup
            value={selectedAnswer || ""}
            onValueChange={handleAnswerSelect}
            disabled={showResult}
            className="space-y-3"
          >
            {currentQuestion.options.map((option, index) => {
              const isThisCorrect = index === currentQuestion.correct_answer;
              const isSelected = selectedAnswer === String(index);
              
              let optionClass = "border-2 rounded-lg p-4 transition-colors";
              if (showResult) {
                if (isThisCorrect) {
                  optionClass += " border-green-500 bg-green-50 dark:bg-green-950";
                } else if (isSelected && !isThisCorrect) {
                  optionClass += " border-red-500 bg-red-50 dark:bg-red-950";
                }
              } else if (isSelected) {
                optionClass += " border-primary";
              }
              
              return (
                <div key={index} className={optionClass}>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value={String(index)} id={`option-${index}`} />
                    <Label 
                      htmlFor={`option-${index}`} 
                      className="flex-1 cursor-pointer font-normal"
                    >
                      {option}
                    </Label>
                    {showResult && isThisCorrect && (
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    )}
                    {showResult && isSelected && !isThisCorrect && (
                      <XCircle className="h-5 w-5 text-destructive" />
                    )}
                  </div>
                </div>
              );
            })}
          </RadioGroup>

          {showResult && currentQuestion.explanation && (
          <div className={`p-4 rounded-lg ${isCorrect ? 'bg-accent/20' : 'bg-destructive/10'}`}>
              <p className="text-sm">
                <span className="font-semibold">Explanation: </span>
                {currentQuestion.explanation}
              </p>
            </div>
          )}

          <div className="flex justify-end">
            {!showResult ? (
              <Button onClick={handleSubmitAnswer} disabled={selectedAnswer === null}>
                Submit Answer
              </Button>
            ) : (
              <Button onClick={handleNextQuestion}>
                {currentQuestionIndex < questions.length - 1 ? (
                  <>
                    Next Question
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                ) : (
                  'See Results'
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Quiz Generator</CardTitle>
          <CardDescription>Test your knowledge with AI-generated quizzes</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={generateQuiz} disabled={isGenerating} className="w-full">
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Quiz...
              </>
            ) : (
              'Generate New Quiz'
            )}
          </Button>
        </CardContent>
      </Card>

      {quizzes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Available Quizzes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {quizzes.map((quiz) => (
              <Button
                key={quiz.id}
                variant="outline"
                className="w-full justify-start"
                onClick={() => startQuiz(quiz)}
              >
                {quiz.title}
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(quiz.created_at).toLocaleDateString()}
                </span>
              </Button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
