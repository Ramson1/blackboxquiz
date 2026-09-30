import { createClient } from "@/lib/supabase/server";
import type { Question, QuestionOption } from "@/types/database";
import type { QuestionDraft } from "@/lib/validation/questions";

/** Question data access (spec §45–§48). Components never call Supabase directly. */

export interface QuestionWithOptions extends Question {
  options: QuestionOption[];
}

export async function listQuestions(
  competitionId: string
): Promise<QuestionWithOptions[]> {
  const supabase = await createClient();
  // The `!question_id` hint pins the embed to the options→questions FK. Without
  // it PostgREST sees two paths between the tables (questions.correct_option_id
  // points back at options) and refuses the join with "more than one relationship".
  const { data, error } = await supabase
    .from("blackboxquiz_questions")
    .select("*, options: blackboxquiz_question_options!question_id(*)")
    .eq("competition_id", competitionId)
    .order("question_number", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as QuestionWithOptions[]).map((q) => ({
    ...q,
    options: [...(q.options ?? [])].sort(
      (a, b) => a.display_order - b.display_order
    ),
  }));
}

export async function getQuestionWithAnswers(
  id: string
): Promise<QuestionWithOptions | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("blackboxquiz_questions")
    .select("*, options: blackboxquiz_question_options!question_id(*)")
    .eq("id", id)
    .maybeSingle<QuestionWithOptions>();
  if (!data) return null;
  return {
    ...data,
    options: [...(data.options ?? [])].sort(
      (a, b) => a.display_order - b.display_order
    ),
  };
}

/** Map a validated draft to the RPC's jsonb options array. */
function optionsPayload(draft: QuestionDraft) {
  return draft.options
    .filter((o) => o.text.trim().length > 0)
    .map((o, i) => ({
      key: o.key,
      text: o.text.trim(),
      display_order: i,
    }));
}

export async function createQuestion(
  competitionId: string,
  draft: QuestionDraft
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("blackboxquiz_create_question", {
    p_competition_id: competitionId,
    p_question_text: draft.question_text,
    p_options: optionsPayload(draft),
    p_correct_key: draft.correct_key,
    p_points: draft.points,
    p_category: draft.category || null,
    p_difficulty: draft.difficulty || null,
    p_point_color: draft.point_color || null,
    p_time_limit: draft.time_limit,
    p_explanation: draft.explanation || null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function updateQuestion(
  questionId: string,
  draft: QuestionDraft
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("blackboxquiz_update_question", {
    p_question_id: questionId,
    p_question_text: draft.question_text,
    p_options: optionsPayload(draft),
    p_correct_key: draft.correct_key,
    p_points: draft.points,
    p_category: draft.category || null,
    p_difficulty: draft.difficulty || null,
    p_point_color: draft.point_color || null,
    p_time_limit: draft.time_limit,
    p_explanation: draft.explanation || null,
  });
  if (error) throw new Error(error.message);
}

export async function deleteQuestion(questionId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("blackboxquiz_delete_question", {
    p_question_id: questionId,
  });
  if (error) throw new Error(error.message);
}

export async function duplicateQuestion(questionId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("blackboxquiz_duplicate_question", {
    p_question_id: questionId,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export interface BulkImportResult {
  imported: number;
  rejected: number;
  errors: { row: number; reason: string }[];
}

/** Server re-validates each row; only valid rows are imported (spec §46/§47). */
export async function bulkImportQuestions(
  competitionId: string,
  drafts: QuestionDraft[]
): Promise<BulkImportResult> {
  const supabase = await createClient();
  const rows = drafts.map((d) => ({
    question_text: d.question_text,
    category: d.category,
    difficulty: d.difficulty,
    points: d.points,
    point_color: d.point_color,
    time_limit: d.time_limit,
    explanation: d.explanation,
    correct_key: d.correct_key,
    options: optionsPayload(d),
  }));
  const { data, error } = await supabase.rpc(
    "blackboxquiz_bulk_import_questions",
    { p_competition_id: competitionId, p_rows: rows }
  );
  if (error) throw new Error(error.message);
  return data as unknown as BulkImportResult;
}
