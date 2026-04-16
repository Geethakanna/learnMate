import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Upload, Link, FileText, X, Loader2, PenTool } from 'lucide-react';
import LevelSelectionDialog, { type LearningLevel } from '@/components/LevelSelectionDialog';
import HandwrittenReview, { type HandwrittenResult } from '@/components/HandwrittenReview';

interface DocumentUploadProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export default function DocumentUpload({ onSuccess, onCancel }: DocumentUploadProps) {
  const { user, session } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [pendingDocId, setPendingDocId] = useState<string | null>(null);
  const [showLevelDialog, setShowLevelDialog] = useState(false);

  // Handwritten notes pipeline state
  const [handwrittenResult, setHandwrittenResult] = useState<HandwrittenResult | null>(null);
  const [handwrittenImageUrl, setHandwrittenImageUrl] = useState<string>('');
  const [handwrittenFilePath, setHandwrittenFilePath] = useState<string>('');
  const [handwrittenApproving, setHandwrittenApproving] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === 'application/pdf') {
        setFile(droppedFile);
      } else {
        toast.error('Please upload a PDF file');
      }
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type === 'application/pdf') {
        setFile(selectedFile);
      } else {
        toast.error('Please upload a PDF file');
      }
    }
  };

  const handleNotesFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      const validTypes = [
        'image/png', 'image/jpeg', 'image/webp', 'image/gif',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];
      if (validTypes.includes(selectedFile.type)) {
        setImageFile(selectedFile);
      } else {
        toast.error('Please upload an image, PDF, or Word document');
      }
    }
  };

  const processDocument = async (content: string, title: string, fileType: string, filePath?: string) => {
    if (!user || !session) return;

    try {
      const { data: doc, error: docError } = await supabase
        .from('documents')
        .insert({
          user_id: user.id,
          title,
          file_type: fileType,
          file_path: filePath,
          content: content.substring(0, 50000),
        })
        .select()
        .single();

      if (docError) throw docError;

      const chunks = chunkContent(content);
      const chunkRecords = chunks.map((chunk, index) => ({
        document_id: doc.id,
        user_id: user.id,
        chunk_index: index,
        content: chunk.text,
        page_number: chunk.page,
        metadata: { wordCount: chunk.text.split(' ').length }
      }));

      const { error: chunkError } = await supabase
        .from('document_chunks')
        .insert(chunkRecords);

      if (chunkError) throw chunkError;

      await supabase
        .from('documents')
        .update({ chunk_count: chunks.length })
        .eq('id', doc.id);

      setPendingDocId(doc.id);
      setShowLevelDialog(true);
    } catch (error) {
      console.error('Error processing document:', error);
      throw error;
    }
  };

  const handleLevelSelected = async (level: LearningLevel) => {
    if (!user || !pendingDocId) return;
    try {
      await supabase.from('document_user_levels').insert({
        user_id: user.id,
        document_id: pendingDocId,
        initial_level: level,
        actual_level: level,
      });
    } catch (e) {
      console.error('Error saving level:', e);
    }
    setShowLevelDialog(false);
    setPendingDocId(null);
    onSuccess();
  };

  const chunkContent = (content: string): { text: string; page: number }[] => {
    const chunks: { text: string; page: number }[] = [];
    const paragraphs = content.split(/\n\n+/);
    let currentChunk = '';
    let chunkCount = 0;

    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;

      if (currentChunk.length + trimmed.length > 1500) {
        if (currentChunk) {
          chunks.push({ text: currentChunk.trim(), page: Math.floor(chunkCount / 3) + 1 });
          chunkCount++;
        }
        currentChunk = trimmed;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + trimmed;
      }
    }

    if (currentChunk) {
      chunks.push({ text: currentChunk.trim(), page: Math.floor(chunkCount / 3) + 1 });
    }

    return chunks;
  };

  const handlePdfUpload = async () => {
    if (!file || !user || !session) return;
    setUploading(true);

    try {
      const filePath = `${user.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data, error } = await supabase.functions.invoke('extract-pdf', {
        body: { filePath, fileName: file.name }
      });

      if (error) {
        const message = error.context && typeof error.context.json === 'function'
          ? await error.context.json().then((body: any) => body?.error || error.message).catch(() => error.message)
          : error.message;
        throw new Error(message || 'Failed to process handwritten notes');
      }

      const extractedText = data?.text || '';
      if (!extractedText) {
        throw new Error('Could not extract text from PDF');
      }

      await processDocument(
        extractedText,
        file.name.replace('.pdf', ''),
        'pdf',
        filePath
      );
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const handleUrlSubmit = async () => {
    if (!url || !user || !session) return;
    setUploading(true);

    try {
      const { data, error } = await supabase.functions.invoke('extract-url', {
        body: { url }
      });

      if (error) throw error;

      const extractedText = data?.text || '';
      const title = data?.title || new URL(url).hostname;

      if (!extractedText) {
        throw new Error('Could not extract content from URL');
      }

      await processDocument(extractedText, title, 'url');
    } catch (error: any) {
      console.error('URL extraction error:', error);
      toast.error(error.message || 'Failed to extract content from URL');
    } finally {
      setUploading(false);
    }
  };

  // ---- Handwritten Notes Pipeline ----

  const handleHandwrittenUpload = async () => {
    if (!imageFile || !user || !session) return;
    setUploading(true);

    try {
      // Upload image to storage
      const filePath = `${user.id}/${Date.now()}_${imageFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, imageFile);

      if (uploadError) throw uploadError;

      // Get a signed URL for the review UI
      const { data: urlData } = await supabase.storage
        .from('documents')
        .createSignedUrl(filePath, 3600);

      // Call the processing edge function
      const { data, error } = await supabase.functions.invoke('process-handwritten', {
        body: { filePath, fileName: imageFile.name }
      });

      if (error) {
        const message = error.context && typeof error.context.json === 'function'
          ? await error.context.json().then((body: any) => body?.error || error.message).catch(() => error.message)
          : error.message;
        throw new Error(message || 'Failed to process handwritten notes');
      }

      if (!data || !data.clean_text) {
        throw new Error('Failed to extract text from handwritten notes');
      }

      // Store results and show review UI
      setHandwrittenResult(data as HandwrittenResult);
      setHandwrittenImageUrl(urlData?.signedUrl || '');
      setHandwrittenFilePath(filePath);
    } catch (error: any) {
      console.error('Handwritten upload error:', error);
      toast.error(error.message || 'Failed to process handwritten notes');
    } finally {
      setUploading(false);
    }
  };

  const handleHandwrittenApprove = async (editedText: string) => {
    if (!user || !session || !editedText.trim()) return;
    setHandwrittenApproving(true);

    try {
      const title = imageFile?.name?.replace(/\.[^.]+$/, '') || 'Notes';
      const ext = imageFile?.name?.toLowerCase().split('.').pop() || '';
      const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext);
      const fileTypeLabel = isImage ? 'handwritten' : ext === 'pdf' ? 'pdf-notes' : 'doc-notes';
      await processDocument(editedText, title, fileTypeLabel, handwrittenFilePath);
      toast.success('Handwritten notes processed successfully');
      resetHandwrittenState();
    } catch (error: any) {
      console.error('Approve error:', error);
      toast.error(error.message || 'Failed to save notes');
    } finally {
      setHandwrittenApproving(false);
    }
  };

  const handleHandwrittenReject = () => {
    resetHandwrittenState();
    toast.info('Upload cancelled. Please try again with a clearer image.');
  };

  const resetHandwrittenState = () => {
    setHandwrittenResult(null);
    setHandwrittenImageUrl('');
    setHandwrittenFilePath('');
    setImageFile(null);
  };

  // If handwritten review is active, show that instead
  if (handwrittenResult) {
    return (
      <>
        <LevelSelectionDialog open={showLevelDialog} onSelect={handleLevelSelected} />
        <HandwrittenReview
          result={handwrittenResult}
          imageUrl={handwrittenImageUrl}
          fileName={imageFile?.name || 'notes'}
          onApprove={handleHandwrittenApprove}
          onReject={handleHandwrittenReject}
          approving={handwrittenApproving}
        />
      </>
    );
  }

  return (
    <>
    <LevelSelectionDialog open={showLevelDialog} onSelect={handleLevelSelected} />
    <Card className="max-w-2xl mx-auto shadow-card">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="font-display">Upload Document</CardTitle>
          <CardDescription>Add learning materials to study from</CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <X className="w-5 h-5" />
        </Button>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="pdf" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pdf" className="gap-2">
              <FileText className="w-4 h-4" />
              PDF
            </TabsTrigger>
            <TabsTrigger value="handwritten" className="gap-2">
              <PenTool className="w-4 h-4" />
              Notes
            </TabsTrigger>
            <TabsTrigger value="url" className="gap-2">
              <Link className="w-4 h-4" />
              URL
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pdf" className="mt-6">
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                dragActive 
                  ? 'border-accent bg-accent/5' 
                  : file 
                    ? 'border-success bg-success/5' 
                    : 'border-border hover:border-muted-foreground/50'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <FileText className="w-8 h-8 text-success" />
                  <div className="text-left">
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setFile(null)}
                    className="ml-4"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <Upload className="w-10 h-10 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium mb-1">Drop your PDF here</p>
                  <p className="text-sm text-muted-foreground mb-4">or click to browse</p>
                  <Input
                    type="file"
                    accept=".pdf"
                    onChange={handleFileChange}
                    className="hidden"
                    id="pdf-upload"
                  />
                  <Label htmlFor="pdf-upload">
                    <Button variant="outline" asChild>
                      <span>Choose File</span>
                    </Button>
                  </Label>
                </>
              )}
            </div>

            <Button
              className="w-full mt-4"
              onClick={handlePdfUpload}
              disabled={!file || uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload & Process
                </>
              )}
            </Button>
          </TabsContent>

          {/* Handwritten Notes Tab */}
          <TabsContent value="handwritten" className="mt-6">
            <div className="border-2 border-dashed rounded-xl p-8 text-center border-border hover:border-muted-foreground/50 transition-colors">
              {imageFile ? (
                <div className="flex items-center justify-center gap-3">
                  <PenTool className="w-8 h-8 text-primary" />
                  <div className="text-left">
                    <p className="font-medium">{imageFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(imageFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setImageFile(null)}
                    className="ml-4"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <PenTool className="w-10 h-10 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium mb-1">Upload Notes (Image, PDF, or Document)</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    We support handwritten and typed notes in multiple formats
                  </p>
                  <Input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,.pdf,.doc,.docx"
                    onChange={handleNotesFileChange}
                    className="hidden"
                    id="image-upload"
                  />
                  <Label htmlFor="image-upload">
                    <Button variant="outline" asChild>
                      <span>Choose File</span>
                    </Button>
                  </Label>
                </>
              )}
            </div>

            <Button
              className="w-full mt-4"
              onClick={handleHandwrittenUpload}
              disabled={!imageFile || uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing Notes...
                </>
              ) : (
                <>
                  <PenTool className="w-4 h-4 mr-2" />
                  Extract & Review
                </>
              )}
            </Button>
          </TabsContent>

          <TabsContent value="url" className="mt-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="url">Web URL or Google Docs Link</Label>
                <Input
                  id="url"
                  type="url"
                  placeholder="https://example.com/article or Google Docs link"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="mt-2"
                />
              </div>

              <Button
                className="w-full"
                onClick={handleUrlSubmit}
                disabled={!url || uploading}
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <Link className="w-4 h-4 mr-2" />
                    Extract Content
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
    </>
  );
}
