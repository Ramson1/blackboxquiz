"use client";

import { Check } from "lucide-react";
import type { QuestionWithOptions } from "@/services/questions/question-service";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function QuestionPreviewDialog({
  question,
  open,
  onOpenChange,
}: {
  question: QuestionWithOptions | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {question && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span>Question #{question.question_number}</span>
                <span
                  className="inline-flex rounded-md px-2 py-0.5 text-xs font-bold text-white"
                  style={{ backgroundColor: question.point_color }}
                >
                  {question.points.toLocaleString()} pts
                </span>
              </DialogTitle>
              <DialogDescription>
                {[question.category, question.difficulty]
                  .filter(Boolean)
                  .join(" · ") || "No category"}
                {" · "}
                {question.time_limit}s
              </DialogDescription>
            </DialogHeader>

            <p className="text-base font-medium">{question.question_text}</p>

            {question.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={question.image_url}
                alt=""
                className="max-h-64 w-full rounded-lg object-cover"
              />
            )}

            <div className="flex flex-col gap-2">
              {question.options.map((o) => {
                const correct = o.id === question.correct_option_id;
                return (
                  <div
                    key={o.id}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      correct
                        ? "border-primary bg-primary/10 font-medium"
                        : ""
                    }`}
                  >
                    <span className="flex size-6 items-center justify-center rounded-full border text-xs font-bold">
                      {o.option_key}
                    </span>
                    <span className="flex-1">{o.option_text}</span>
                    {correct && <Check className="size-4 text-primary" />}
                  </div>
                );
              })}
            </div>

            {question.explanation && (
              <div className="rounded-lg bg-muted p-3 text-sm">
                <span className="font-medium">Explanation: </span>
                {question.explanation}
              </div>
            )}

            <div className="flex justify-end">
              <Badge variant="secondary">
                {question.status.replaceAll("_", " ")}
              </Badge>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
