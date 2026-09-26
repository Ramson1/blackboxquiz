import { z } from "zod";

/**
 * Question validation shared by the manual create/edit form and the bulk
 * import pipeline. Mirrors the server rules in
 * supabase/migrations/0006_question_management.sql (spec §47): reject empty
 * questions, missing options, invalid correct answer, invalid/negative points,
 * and invalid timers. Row-level reasons are surfaced in the UI preview.
 */

export const DEFAULT_OPTION_KEYS = ["A", "B", "C", "D"] as const;

/** A question as authored in the form / parsed from a file. */
export interface QuestionDraft {
  question_text: string;
  category: string;
  difficulty: string;
  points: number | null;
  point_color: string;
  time_limit: number | null;
  explanation: string;
  correct_key: string;
  options: { key: string; text: string }[];
}

/** Accessible point → color palette (spec §15: never color alone). */
export function pointColorFor(points: number): string {
  if (points <= 100) return "#16A34A"; // green
  if (points <= 200) return "#2563EB"; // blue
  if (points <= 300) return "#EAB308"; // yellow
  if (points <= 500) return "#F97316"; // orange
  return "#DC2626"; // red
}

const optionSchema = z.object({
  key: z.string().min(1, "Option key is required"),
  text: z.string().min(1, "Option text is required"),
});

/** Manual create/edit form schema (spec §45). */
export const questionFormSchema = z
  .object({
    question_text: z.string().min(1, "Question text is required"),
    category: z.string().optional(),
    difficulty: z.string().optional(),
    points: z.coerce.number().int().positive("Points must be a positive number"),
    point_color: z.string().optional(),
    time_limit: z.coerce
      .number()
      .int()
      .positive("Time limit must be a positive number"),
    explanation: z.string().optional(),
    correct_key: z.string().min(1, "Select the correct answer"),
    options: z
      .array(optionSchema)
      .min(2, "At least two options are required")
      .max(8, "Too many options"),
  })
  .superRefine((val, ctx) => {
    if (!val.options.some((o) => o.key === val.correct_key)) {
      ctx.addIssue({
        code: "custom",
        path: ["correct_key"],
        message: "Correct answer must match one of the options",
      });
    }
    const emptyOption = val.options.findIndex((o) => o.text.trim().length === 0);
    if (emptyOption >= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["options", emptyOption, "text"],
        message: "This option is empty",
      });
    }
  });

export type QuestionFormValues = z.input<typeof questionFormSchema>;

/**
 * Row-level validation for an already-normalized draft (used by the import
 * preview). Returns the first problem found, or null when the row is valid.
 */
export function validateQuestionDraft(draft: QuestionDraft): string | null {
  if (!draft.question_text.trim()) return "Question text is empty";
  const usableOptions = draft.options.filter((o) => o.text.trim().length > 0);
  if (usableOptions.length < 2) return "At least two answer options are required";
  if (draft.points == null || Number.isNaN(draft.points) || draft.points <= 0)
    return "Points must be a positive number";
  if (
    draft.time_limit == null ||
    Number.isNaN(draft.time_limit) ||
    draft.time_limit <= 0
  )
    return "Time limit must be a positive number of seconds";
  if (!draft.correct_key) return "Correct answer is missing";
  if (!usableOptions.some((o) => o.key === draft.correct_key))
    return "Correct answer does not match any option";
  return null;
}

/** Blank draft for the create form (spec §45 default A/B/C/D). */
export function emptyDraft(defaultTimer = 30): QuestionDraft {
  return {
    question_text: "",
    category: "",
    difficulty: "",
    points: 100,
    point_color: pointColorFor(100),
    time_limit: defaultTimer,
    explanation: "",
    correct_key: "A",
    options: DEFAULT_OPTION_KEYS.map((key) => ({ key, text: "" })),
  };
}
