import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logActivity, updateFlashcardStats } from "@/lib/tracking";
import { 
  Sparkles, 
  ChevronLeft, 
  ChevronRight, 
  RotateCcw,
  Trash2,
  Loader2,
  BookOpen
} from "lucide-react";

interface Flashcard {
  id: string;
  front: string;
  back: string;
  difficulty: string;
}

interface FlashcardViewerProps {
  documentId: string;
  documentTitle: string;
}

export function FlashcardViewer({ documentId, documentTitle }: FlashcardViewerProps) {
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [cardCount, setCardCount] = useState(10);
  const { toast } = useToast();
  const viewedCards = useRef(new Set<number>());

  useEffect(() => {
    fetchFlashcards();
    viewedCards.current = new Set();
  }, [documentId]);

  // Log initial view once per document session
  useEffect(() => {
    if (flashcards.length > 0) {
      updateFlashcardStats(documentId, 'view');
      logActivity('flashcard_viewed', documentId);
      viewedCards.current.add(0);
    }
  }, [flashcards.length, documentId]);

  const fetchFlashcards = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("flashcards")
        .select("*")
        .eq("document_id", documentId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setFlashcards(data || []);
      setCurrentIndex(0);
      setIsFlipped(false);
    } catch (error) {
      console.error("Error fetching flashcards:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateFlashcards = async () => {
    setIsGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Please sign in", variant: "destructive" });
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-flashcards`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ documentId, count: cardCount }),
        }
      );

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to generate flashcards");
      }

      toast({
        title: "Flashcards Generated!",
        description: `Created ${data.count} new flashcards from your document.`,
      });
      
      await fetchFlashcards();
      logActivity('flashcard_generated', documentId, { count: data.count });
    } catch (error: any) {
      console.error("Error generating flashcards:", error);
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const deleteFlashcard = async (id: string) => {
    try {
      const { error } = await supabase
        .from("flashcards")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setFlashcards(prev => prev.filter(f => f.id !== id));
      if (currentIndex >= flashcards.length - 1) {
        setCurrentIndex(Math.max(0, currentIndex - 1));
      }
      toast({ title: "Flashcard deleted" });
    } catch (error) {
      console.error("Error deleting flashcard:", error);
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const nextCard = () => {
    setIsFlipped(false);
    const nextIdx = (currentIndex + 1) % flashcards.length;
    setCurrentIndex(nextIdx);
    // Only track if this card hasn't been viewed in this session
    if (!viewedCards.current.has(nextIdx)) {
      viewedCards.current.add(nextIdx);
    }
    // Check if user completed all cards
    if (viewedCards.current.size === flashcards.length) {
      updateFlashcardStats(documentId, 'complete');
      logActivity('flashcard_completed', documentId);
    }
  };

  const prevCard = () => {
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev - 1 + flashcards.length) % flashcards.length);
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'hard': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Flashcards
          </h3>
          <p className="text-sm text-muted-foreground">
            {documentTitle}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <select 
            value={cardCount}
            onChange={(e) => setCardCount(Number(e.target.value))}
            className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
          >
            <option value={5}>5 cards</option>
            <option value={10}>10 cards</option>
            <option value={15}>15 cards</option>
            <option value={20}>20 cards</option>
          </select>
          <Button 
            onClick={generateFlashcards} 
            disabled={isGenerating}
            className="gap-2"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {isGenerating ? "Generating..." : "Generate"}
          </Button>
        </div>
      </div>

      {flashcards.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BookOpen className="w-12 h-12 text-muted-foreground mb-4" />
            <h4 className="text-lg font-medium text-foreground mb-2">No Flashcards Yet</h4>
            <p className="text-muted-foreground text-center mb-4">
              Generate flashcards from your document to start studying
            </p>
            <Button onClick={generateFlashcards} disabled={isGenerating} className="gap-2">
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Generate Flashcards
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Flashcard Display */}
          <div className="relative">
            <div 
              className="perspective-1000 cursor-pointer"
              onClick={() => setIsFlipped(!isFlipped)}
            >
              <div 
                className={`relative w-full min-h-[280px] transition-transform duration-500 transform-style-preserve-3d ${
                  isFlipped ? 'rotate-y-180' : ''
                }`}
                style={{
                  transformStyle: 'preserve-3d',
                  transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                }}
              >
                {/* Front of card */}
                <Card 
                  className="absolute inset-0 backface-hidden bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20"
                  style={{ backfaceVisibility: 'hidden' }}
                >
                  <CardContent className="flex flex-col items-center justify-center h-full p-8 text-center">
                    <Badge className={`mb-4 ${getDifficultyColor(flashcards[currentIndex]?.difficulty)}`}>
                      {flashcards[currentIndex]?.difficulty}
                    </Badge>
                    <p className="text-xl font-medium text-foreground">
                      {flashcards[currentIndex]?.front}
                    </p>
                    <p className="text-sm text-muted-foreground mt-4">
                      Click to reveal answer
                    </p>
                  </CardContent>
                </Card>

                {/* Back of card */}
                <Card 
                  className="absolute inset-0 backface-hidden bg-gradient-to-br from-accent/20 to-accent/10 border-accent/30"
                  style={{ 
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)'
                  }}
                >
                  <CardContent className="flex flex-col items-center justify-center h-full p-8 text-center">
                    <Badge className="mb-4 bg-accent/20 text-accent-foreground border-accent/30">
                      Answer
                    </Badge>
                    <p className="text-lg text-foreground">
                      {flashcards[currentIndex]?.back}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Delete button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                deleteFlashcard(flashcards[currentIndex]?.id);
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center justify-center gap-4">
            <Button 
              variant="outline" 
              size="icon"
              onClick={prevCard}
              disabled={flashcards.length <= 1}
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            
            <div className="flex items-center gap-2">
              <span className="text-lg font-medium text-foreground">
                {currentIndex + 1}
              </span>
              <span className="text-muted-foreground">/</span>
              <span className="text-muted-foreground">
                {flashcards.length}
              </span>
            </div>

            <Button 
              variant="outline" 
              size="icon"
              onClick={() => setIsFlipped(false)}
            >
              <RotateCcw className="w-5 h-5" />
            </Button>

            <Button 
              variant="outline" 
              size="icon"
              onClick={nextCard}
              disabled={flashcards.length <= 1}
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          {/* Progress indicator */}
          <div className="flex justify-center gap-1">
            {flashcards.map((_, index) => (
              <button
                key={index}
                onClick={() => {
                  setCurrentIndex(index);
                  setIsFlipped(false);
                }}
                className={`w-2 h-2 rounded-full transition-colors ${
                  index === currentIndex ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
