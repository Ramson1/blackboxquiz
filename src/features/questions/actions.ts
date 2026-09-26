"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/features/auth/session";
import { questionFormSchema, type QuestionDraft } from "@/lib/validation/questions";
import {
  bulkImportQuestions,
  createQuestion,
  deleteQuestion,
  duplicateQuestion,
  updateQuestion,
  type BulkImportResult,
} from "@/services/questions/question-service";

export type QuestionActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

function revalidate(competitionId: string) {
  revalidatePath(`/competitions/${competitionId}/questions`);
  revalidatePath(`/competitions/${competitionId}`);
}

export async function saveQuestionAction(input: {
  competitionId: string;
  questionId?: string;
  draft: QuestionDraft;
}): Promise<QuestionActionResult> {
  await requireUser();
  const parsed = questionFormSchema.safeParse(input.draft);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  try {
    if (input.questionId) {
      await updateQuestion(input.questionId, parsed.data as QuestionDraft);
      revalidate(input.competitionId);
      return { ok: true, id: input.questionId };
    }
    const id = await createQuestion(input.competitionId, parsed.data as QuestionDraft);
    revalidate(input.competitionId);
    return { ok: true, id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not save question.",
    };
  }
}

export async function deleteQuestionAction(input: {
  competitionId: string;
  questionId: string;
}): Promise<QuestionActionResult> {
  await requireUser();
  const { competitionId, questionId } = z
    .object({ competitionId: z.uuid(), questionId: z.uuid() })
    .parse(input);
  try {
    await deleteQuestion(questionId);
    revalidate(competitionId);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not delete question.",
    };
  }
}

export async function duplicateQuestionAction(input: {
  competitionId: string;
  questionId: string;
}): Promise<QuestionActionResult> {
  await requireUser();
  const { competitionId, questionId } = z
    .object({ competitionId: z.uuid(), questionId: z.uuid() })
    .parse(input);
  try {
    const id = await duplicateQuestion(questionId);
    revalidate(competitionId);
    return { ok: true, id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not duplicate question.",
    };
  }
}

const bulkSchema = z.object({
  competitionId: z.uuid(),
  drafts: z.array(z.unknown()).min(1, "Nothing to import").max(2000),
});

export async function bulkImportQuestionsAction(input: {
  competitionId: string;
  drafts: QuestionDraft[];
}): Promise<
  { ok: true; result: BulkImportResult } | { ok: false; error: string }
> {
  await requireUser();
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  try {
    const result = await bulkImportQuestions(
      input.competitionId,
      input.drafts
    );
    revalidate(input.competitionId);
    return { ok: true, result };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Bulk import failed.",
    };
  }
}
