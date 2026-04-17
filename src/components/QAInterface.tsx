import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDocumentLevel } from '@/hooks/useDocumentLevel';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Send, Bot, User, FileText, Loader2, Sparkles, Quote } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Document {
  id: string;
  title: string;
  file_type: string;
  chunk_count: number;
  created_at: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: { page: number; text: string }[];
}

interface QAInterfaceProps {
  documents: Document[];
  selectedDocument: Document | null;
  onSelectDocument: (doc: Document | null) => void;
}

export default function QAInterface({ documents, selectedDocument, onSelectDocument }: QAInterfaceProps) {
  const { user, session } = useAuth();
  const { effectiveLevel } = useDocumentLevel(selectedDocument?.id || null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !selectedDocument || !user || !session) return;

    const question = input.trim();
    setInput('');
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: question,
    };
    
    setMessages(prev => [...prev, userMessage]);
    setLoading(true);

    try {
      // Call the RAG edge function
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rag-query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          question,
          documentId: selectedDocument.id,
          userLevel: effectiveLevel,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please try again in a moment.');
        }
        if (response.status === 402) {
          throw new Error('Usage limit reached. Please check your account.');
        }
        throw new Error(errorData.error || 'Failed to get answer');
      }

      const data = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.answer,
        citations: data.citations,
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Save to qa_sessions
      await supabase.from('qa_sessions').insert({
        user_id: user.id,
        document_id: selectedDocument.id,
        question,
        answer: data.answer,
        citations: data.citations,
      });
    } catch (error: any) {
      console.error('QA error:', error);
      toast.error(error.message || 'Failed to get answer');
      
      // Remove the user message if we couldn't get an answer
      setMessages(prev => prev.filter(m => m.id !== userMessage.id));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Document Selector */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <FileText className="w-5 h-5 text-muted-foreground" />
            <div className="flex-1">
              <Select
                value={selectedDocument?.id || ''}
                onValueChange={(id) => {
                  const doc = documents.find(d => d.id === id);
                  onSelectDocument(doc || null);
                  setMessages([]);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a document to ask questions about" />
                </SelectTrigger>
                <SelectContent>
                  {documents.map((doc) => (
                    <SelectItem key={doc.id} value={doc.id}>
                      {doc.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chat Area */}
      <Card className="shadow-card">
        <ScrollArea className="h-[500px] p-6" ref={scrollRef}>
          {messages.length === 0 && selectedDocument && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
                <Sparkles className="w-8 h-8 text-accent" />
              </div>
              <h3 className="text-xl font-display font-semibold mb-2">
                Ask Anything About Your Document
              </h3>
              <p className="text-muted-foreground max-w-md">
                I'll search through "{selectedDocument.title}" and provide answers with citations.
              </p>
            </div>
          )}

          {!selectedDocument && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <FileText className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Select a document above to start asking questions
              </p>
            </div>
          )}

          <div className="space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : ''}`}
              >
                {message.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
                
                <div
                  className={`max-w-[80%] ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-3'
                      : 'space-y-3'
                  }`}
                >
                  <div className={message.role === 'assistant' ? 'bg-muted rounded-2xl rounded-tl-sm px-4 py-3' : ''}>
                    {message.role === 'assistant' ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-display prose-headings:font-semibold prose-h1:text-lg prose-h2:text-base prose-h2:mt-3 prose-h2:mb-2 prose-h3:text-sm prose-p:my-2 prose-p:leading-relaxed prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-strong:text-foreground prose-code:text-accent prose-code:bg-secondary/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    )}
                  </div>

                  {message.citations && message.citations.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <Quote className="w-3 h-3" />
                        Sources
                      </p>
                      {message.citations.map((citation, i) => (
                        <div
                          key={i}
                          className="text-sm bg-secondary/50 rounded-lg p-3 border-l-2 border-accent"
                        >
                          <p className="text-xs text-muted-foreground mb-1">
                            Page {citation.page}
                          </p>
                          <p className="text-foreground/80 line-clamp-2">
                            {citation.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {message.role === 'user' && (
                  <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-secondary-foreground" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-primary-foreground" />
                </div>
                <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t p-4">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                selectedDocument
                  ? "Ask a question about your document..."
                  : "Select a document first"
              }
              disabled={!selectedDocument || loading}
              className="flex-1"
            />
            <Button 
              type="submit" 
              disabled={!input.trim() || !selectedDocument || loading}
              className="px-4"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
