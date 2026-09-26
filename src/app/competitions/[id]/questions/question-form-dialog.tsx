"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { saveQuestionAction } from "@/features/questions/actions";
import type { QuestionWithOptions } from "@/services/questions/question-service";
import {
  emptyDraft,
  pointColorFor,
  type QuestionDraft,
} from "@/lib/validation/questions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const keyForIndex = (i: number) => String.fromCharCode(65 + i);

function draftFromQuestion(q: QuestionWithOptions): QuestionDraft {
  const correct = q.options.find((o) => o.id === q.correct_option_id);
  return {
    question_text: q.question_text,
    category: q.category ?? "",
    difficulty: q.difficulty ?? "",
    points: q.points,
    point_color: q.point_color,
    time_limit: q.time_limit,
    explanation: q.explanation ?? "",
    correct_key: correct?.option_key ?? "A",
    options: q.options.map((o) => ({ key: o.option_key, text: o.option_text })),
  };
}

export function QuestionFormDialog({
  competitionId,
  defaultTimer,
  open,
  onOpenChange,
  question,
}: {
  competitionId: string;
  defaultTimer: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  question: QuestionWithOptions | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{question ? "Edit question" : "Add question"}</DialogTitle>
          <DialogDescription>
            Options default to A–D. Choose which option is the correct answer.
          </DialogDescription>
        </DialogHeader>
        {/* Keyed so the form fully re-initializes on each open / target change. */}
        {open && (
          <QuestionForm
            key={question?.id ?? "new"}
            competitionId={competitionId}
            defaultTimer={defaultTimer}
            question={question}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function QuestionForm({
  competitionId,
  defaultTimer,
  question,
  onDone,
}: {
  competitionId: string;
  defaultTimer: number;
  question: QuestionWithOptions | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<QuestionDraft>(() =>
    question ? draftFromQuestion(question) : emptyDraft(defaultTimer)
  );

  function patch(next: Partial<QuestionDraft>) {
    setDraft((d) => ({ ...d, ...next }));
  }

  function setOption(index: number, text: string) {
    setDraft((d) => ({
      ...d,
      options: d.options.map((o, i) => (i === index ? { ...o, text } : o)),
    }));
  }

  function addOption() {
    setDraft((d) => {
      if (d.options.length >= 8) return d;
      const index = d.options.length;
      return { ...d, options: [...d.options, { key: keyForIndex(index), text: "" }] };
    });
  }

  function removeOption(index: number) {
    setDraft((d) => {
      if (d.options.length <= 2) return d;
      const removedKey = d.options[index].key;
      const options = d.options
        .filter((_, i) => i !== index)
        .map((o, i) => ({ ...o, key: keyForIndex(i) }));
      const correctKey =
        options.find((o) => o.key === d.correct_key && d.correct_key !== removedKey)
          ?.key ?? options[0].key;
      return { ...d, options, correct_key: correctKey };
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    start(async () => {
      const res = await saveQuestionAction({
        competitionId,
        questionId: question?.id,
        draft,
      });
      if (res.ok) {
        toast.success(question ? "Question updated" : "Question added");
        onDone();
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="q-text">Question</Label>
        <Textarea
          id="q-text"
          rows={3}
          value={draft.question_text}
          onChange={(e) => patch({ question_text: e.target.value })}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="q-cat">Category</Label>
          <Input
            id="q-cat"
            value={draft.category}
            onChange={(e) => patch({ category: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="q-diff">Difficulty</Label>
          <Input
            id="q-diff"
            value={draft.difficulty}
            onChange={(e) => patch({ difficulty: e.target.value })}
            placeholder="Easy"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="q-points">Points</Label>
          <Input
            id="q-points"
            type="number"
            min={1}
            value={draft.points ?? ""}
            onChange={(e) => {
              const pts = e.target.value === "" ? null : Number(e.target.value);
              patch({
                points: pts,
                point_color: pts ? pointColorFor(pts) : draft.point_color,
              });
            }}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="q-timer">Timer (s)</Label>
          <Input
            id="q-timer"
            type="number"
            min={1}
            value={draft.time_limit ?? ""}
            onChange={(e) =>
              patch({
                time_limit: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Options</Label>
          <span className="text-xs text-muted-foreground">
            Select the correct answer
          </span>
        </div>
        {draft.options.map((opt, i) => (
          <div key={opt.key} className="flex items-center gap-2">
            <button
              type="button"
              aria-label={`Mark ${opt.key} correct`}
              onClick={() => patch({ correct_key: opt.key })}
              className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                draft.correct_key === opt.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input text-muted-foreground"
              }`}
            >
              {opt.key}
            </button>
            <Input
              value={opt.text}
              onChange={(e) => setOption(i, e.target.value)}
              placeholder={`Option ${opt.key}`}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => removeOption(i)}
              disabled={draft.options.length <= 2}
              aria-label="Remove option"
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={addOption}
          disabled={draft.options.length >= 8}
        >
          <Plus />
          Add option
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="q-explanation">Explanation (optional)</Label>
        <Textarea
          id="q-explanation"
          rows={2}
          value={draft.explanation}
          onChange={(e) => patch({ explanation: e.target.value })}
        />
      </div>

      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {question ? "Save changes" : "Add question"}
        </Button>
      </DialogFooter>
    </form>
  );
}
