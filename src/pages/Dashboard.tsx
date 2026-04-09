import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { 
  Sparkles, 
  Upload, 
  FileText, 
  MessageSquare, 
  LogOut,
  Plus,
  BookOpen,
  Brain,
  Layers,
  HelpCircle,
  BarChart3,
  Menu
} from 'lucide-react';
import DocumentUpload from '@/components/DocumentUpload';
import DocumentList from '@/components/DocumentList';
import QAInterface from '@/components/QAInterface';
import { FlashcardViewer } from '@/components/FlashcardViewer';
import { QuizViewer } from '@/components/QuizViewer';
import { ProgressReport } from '@/components/ProgressReport';
import { logActivity, startSessionTimer, endSessionTimer } from '@/lib/tracking';

interface Document {
  id: string;
  title: string;
  file_type: string;
  chunk_count: number;
  created_at: string;
}

type ViewType = 'documents' | 'qa' | 'flashcards' | 'quiz' | 'progress';

const NAV_ITEMS: { view: ViewType; label: string; icon: React.ElementType }[] = [
  { view: 'documents', label: 'Documents', icon: FileText },
  { view: 'qa', label: 'Ask AI', icon: MessageSquare },
  { view: 'flashcards', label: 'Flashcards', icon: Layers },
  { view: 'quiz', label: 'Quizzes', icon: HelpCircle },
  { view: 'progress', label: 'Progress', icon: BarChart3 },
];

export default function Dashboard() {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [view, setView] = useState<ViewType>('documents');
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchDocuments();
      logActivity('login');
    }
  }, [user]);

  // Session duration tracking
  useEffect(() => {
    startSessionTimer(view);
    // Flush on tab close / hide
    const handleVisChange = () => {
      if (document.visibilityState === 'hidden') endSessionTimer();
      if (document.visibilityState === 'visible') startSessionTimer(view);
    };
    const handleBeforeUnload = () => endSessionTimer();
    window.addEventListener('visibilitychange', handleVisChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      endSessionTimer();
      window.removeEventListener('visibilitychange', handleVisChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [view]);

  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
      toast.error('Failed to load documents');
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleSignOut = async () => {
    await endSessionTimer();
    await signOut();
    navigate('/');
  };

  const handleDocumentUploaded = () => {
    setShowUpload(false);
    fetchDocuments();
    toast.success('Document processed and ready for Q&A!');
  };

  const handleSelectDocument = (doc: Document) => {
    setSelectedDoc(doc);
    setView('qa');
  };

  const switchView = (v: ViewType) => {
    setView(v);
    setMobileNavOpen(false);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/20" />
          <div className="h-4 w-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  const NavButtons = ({ onClick }: { onClick?: () => void }) => (
    <>
      {NAV_ITEMS.map(({ view: v, label, icon: Icon }) => (
        <button
          key={v}
          onClick={() => { switchView(v); onClick?.(); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors w-full text-left ${
            view === v
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Icon className="w-4 h-4" />
          {label}
        </button>
      ))}
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-4">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-primary-foreground" />
                  </div>
                  <span className="text-lg font-bold">Learn Mate</span>
                </div>
                <nav className="flex flex-col gap-1">
                  <NavButtons />
                </nav>
              </SheetContent>
            </Sheet>

            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-display font-bold">Learn Mate</span>
          </div>

          <div className="flex items-center gap-4">
            <nav className="hidden md:flex items-center gap-1 bg-muted rounded-lg p-1">
              <NavButtons />
            </nav>

            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {view === 'documents' && (
          <div className="animate-fade-in">
            {documents.length === 0 && !showUpload && (
              <div className="text-center py-16">
                <div className="w-20 h-20 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-6">
                  <BookOpen className="w-10 h-10 text-accent" />
                </div>
                <h2 className="text-3xl font-display font-bold mb-3">
                  Start Your Learning Journey
                </h2>
                <p className="text-lg text-muted-foreground mb-8 max-w-md mx-auto">
                  Upload your first document and let AI help you master the content
                </p>
                <Button 
                  size="lg" 
                  onClick={() => setShowUpload(true)}
                  className="gap-2"
                >
                  <Upload className="w-5 h-5" />
                  Upload Document
                </Button>
              </div>
            )}

            {showUpload && (
              <div className="mb-8">
                <DocumentUpload 
                  onSuccess={handleDocumentUploaded}
                  onCancel={() => setShowUpload(false)}
                />
              </div>
            )}

            {documents.length > 0 && !showUpload && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-display font-bold">Your Documents</h2>
                    <p className="text-muted-foreground">
                      {documents.length} document{documents.length !== 1 ? 's' : ''} uploaded
                    </p>
                  </div>
                  <Button onClick={() => setShowUpload(true)} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Add Document
                  </Button>
                </div>

                <DocumentList 
                  documents={documents}
                  onSelect={handleSelectDocument}
                  onDelete={fetchDocuments}
                />
              </div>
            )}
          </div>
        )}

        {view === 'qa' && (
          <div className="animate-fade-in">
            {documents.length === 0 ? (
              <Card className="max-w-lg mx-auto text-center py-12">
                <CardContent>
                  <Brain className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-display font-semibold mb-2">No Documents Yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Upload a document first to start asking questions
                  </p>
                  <Button onClick={() => { setView('documents'); setShowUpload(true); }}>
                    Upload Document
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <QAInterface 
                documents={documents}
                selectedDocument={selectedDoc}
                onSelectDocument={setSelectedDoc}
              />
          )}
          </div>
        )}

        {view === 'flashcards' && (
          <div className="animate-fade-in">
            {documents.length === 0 ? (
              <Card className="max-w-lg mx-auto text-center py-12">
                <CardContent>
                  <Layers className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-display font-semibold mb-2">No Documents Yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Upload a document first to generate flashcards
                  </p>
                  <Button onClick={() => { setView('documents'); setShowUpload(true); }}>
                    Upload Document
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Layers className="w-5 h-5 text-primary" />
                      Study with Flashcards
                    </CardTitle>
                    <CardDescription>
                      Select a document and generate AI-powered flashcards
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <select
                      value={selectedDoc?.id || ''}
                      onChange={(e) => {
                        const doc = documents.find(d => d.id === e.target.value);
                        setSelectedDoc(doc || null);
                      }}
                      className="w-full bg-secondary border border-border rounded-lg px-4 py-3 text-foreground"
                    >
                      <option value="">Select a document...</option>
                      {documents.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.title}
                        </option>
                      ))}
                    </select>
                  </CardContent>
                </Card>

                {selectedDoc && (
                  <Card>
                    <CardContent className="pt-6">
                      <FlashcardViewer 
                        documentId={selectedDoc.id}
                        documentTitle={selectedDoc.title}
                      />
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}

        {view === 'quiz' && (
          <div className="animate-fade-in">
            {documents.length === 0 ? (
              <Card className="max-w-lg mx-auto text-center py-12">
                <CardContent>
                  <HelpCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-display font-semibold mb-2">No Documents Yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Upload a document first to generate quizzes
                  </p>
                  <Button onClick={() => { setView('documents'); setShowUpload(true); }}>
                    Upload Document
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <HelpCircle className="w-5 h-5 text-primary" />
                      Test Your Knowledge
                    </CardTitle>
                    <CardDescription>
                      Select a document and take AI-generated quizzes with scoring
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <select
                      value={selectedDoc?.id || ''}
                      onChange={(e) => {
                        const doc = documents.find(d => d.id === e.target.value);
                        setSelectedDoc(doc || null);
                      }}
                      className="w-full bg-secondary border border-border rounded-lg px-4 py-3 text-foreground"
                    >
                      <option value="">Select a document...</option>
                      {documents.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.title}
                        </option>
                      ))}
                    </select>
                  </CardContent>
                </Card>

                <QuizViewer 
                  documentId={selectedDoc?.id || null}
                  userId={user.id}
                />
              </div>
            )}
          </div>
        )}

        {view === 'progress' && (
          <div className="animate-fade-in">
            <ProgressReport />
          </div>
        )}
      </main>
    </div>
  );
}
