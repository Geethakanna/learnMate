import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, CheckCircle, XCircle, Edit3, Eye, Save } from 'lucide-react';

export interface HandwrittenResult {
  raw_text: string;
  clean_text: string;
  confidence_score: number;
  quality: 'clear' | 'moderate' | 'poor';
  uncertain_segments: string[];
  topics: string[];
  key_concepts: string[];
  structured_content: string;
}

interface HandwrittenReviewProps {
  result: HandwrittenResult;
  imageUrl: string;
  fileName: string;
  onApprove: (editedText: string) => void;
  onReject: () => void;
  approving?: boolean;
}

export default function HandwrittenReview({
  result,
  imageUrl,
  fileName,
  onApprove,
  onReject,
  approving = false,
}: HandwrittenReviewProps) {
  const [editedText, setEditedText] = useState(result.clean_text);
  const [showRaw, setShowRaw] = useState(false);

  const qualityConfig = {
    clear: { color: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle, label: 'Clear' },
    moderate: { color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: AlertTriangle, label: 'Moderate' },
    poor: { color: 'bg-red-100 text-red-800 border-red-200', icon: XCircle, label: 'Poor' },
  };

  const qc = qualityConfig[result.quality] || qualityConfig.moderate;
  const QualityIcon = qc.icon;
  const isPoor = result.quality === 'poor';

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Header with quality info */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-display text-lg">Review Extracted Notes</CardTitle>
              <CardDescription>{fileName}</CardDescription>
            </div>
            <Badge className={`${qc.color} gap-1`}>
              <QualityIcon className="w-3 h-3" />
              {qc.label} Quality
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Confidence</span>
            <Progress value={result.confidence_score} className="flex-1 h-2" />
            <span className="text-sm font-medium">{result.confidence_score}%</span>
          </div>

          {result.uncertain_segments.length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">Uncertain segments (please verify):</p>
              <div className="flex flex-wrap gap-1">
                {result.uncertain_segments.map((seg, i) => (
                  <Badge key={i} variant="outline" className="text-xs bg-yellow-50 border-yellow-200">
                    {seg}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {result.topics.length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">Detected topics:</p>
              <div className="flex flex-wrap gap-1">
                {result.topics.map((topic, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{topic}</Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {isPoor && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-destructive mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Low Quality Detected</p>
                <p className="text-sm text-muted-foreground mt-1">
                  The handwriting quality is too low for reliable processing. You can still review and edit
                  the text below, but consider re-uploading a clearer image for better results.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Side-by-side: image + editable text */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Original Image
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] rounded-md border">
              <img
                src={imageUrl}
                alt="Handwritten notes"
                className="w-full object-contain"
              />
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Edit3 className="w-4 h-4" />
                Extracted Text (Editable)
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRaw(!showRaw)}
                className="text-xs"
              >
                {showRaw ? 'Show Clean' : 'Show Raw'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {showRaw ? (
              <ScrollArea className="h-[400px] rounded-md border p-3">
                <pre className="text-sm whitespace-pre-wrap text-muted-foreground">
                  {result.raw_text}
                </pre>
              </ScrollArea>
            ) : (
              <Textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="h-[400px] resize-none font-mono text-sm"
                placeholder="Extracted text will appear here..."
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onReject} disabled={approving}>
          Re-upload
        </Button>
        <Button
          onClick={() => onApprove(editedText)}
          disabled={!editedText.trim() || approving}
          className="gap-2"
        >
          {approving ? (
            <>Processing...</>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Approve & Process
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
