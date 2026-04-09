import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { GraduationCap, BookOpen, Rocket } from 'lucide-react';

export type LearningLevel = 'Beginner' | 'Intermediate' | 'Advanced';

interface LevelSelectionDialogProps {
  open: boolean;
  onSelect: (level: LearningLevel) => void;
}

const LEVELS = [
  {
    value: 'Beginner' as LearningLevel,
    label: 'Beginner',
    description: 'I\'m new to this topic. Give me detailed explanations with examples.',
    icon: BookOpen,
  },
  {
    value: 'Intermediate' as LearningLevel,
    label: 'Intermediate',
    description: 'I have some understanding. Focus on concepts and logic.',
    icon: GraduationCap,
  },
  {
    value: 'Advanced' as LearningLevel,
    label: 'Advanced',
    description: 'I know this well. Give me depth, edge cases, and concise answers.',
    icon: Rocket,
  },
];

export default function LevelSelectionDialog({ open, onSelect }: LevelSelectionDialogProps) {
  const [selected, setSelected] = useState<LearningLevel>('Beginner');

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>What is your current understanding of this topic?</DialogTitle>
          <DialogDescription>
            This helps us tailor explanations, quizzes, and flashcards to your level.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={selected}
          onValueChange={(v) => setSelected(v as LearningLevel)}
          className="space-y-3 my-4"
        >
          {LEVELS.map(({ value, label, description, icon: Icon }) => (
            <div
              key={value}
              className={`flex items-start gap-3 border rounded-lg p-4 cursor-pointer transition-colors ${
                selected === value ? 'border-primary bg-primary/5' : 'border-border'
              }`}
              onClick={() => setSelected(value)}
            >
              <RadioGroupItem value={value} id={`level-${value}`} className="mt-1" />
              <div className="flex-1">
                <Label htmlFor={`level-${value}`} className="flex items-center gap-2 text-base font-medium cursor-pointer">
                  <Icon className="w-4 h-4 text-primary" />
                  {label}
                </Label>
                <p className="text-sm text-muted-foreground mt-1">{description}</p>
              </div>
            </div>
          ))}
        </RadioGroup>

        <Button onClick={() => onSelect(selected)} className="w-full">
          Continue
        </Button>
      </DialogContent>
    </Dialog>
  );
}
