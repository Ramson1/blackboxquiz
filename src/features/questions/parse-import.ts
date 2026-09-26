"use client";

import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  DEFAULT_OPTION_KEYS,
  pointColorFor,
  type QuestionDraft,
} from "@/lib/validation/questions";

/**
 * Bulk import parsing (spec §46): UPLOAD → PARSE → VALIDATE → SHOW ERRORS →
 * PREVIEW → CONFIRM → IMPORT. This module only covers PARSE: it turns a
 * CSV/XLSX file into normalized QuestionDraft rows. Validation/preview happen
 * in the import dialog; the server re-validates on CONFIRM.
 */

const EXPECTED_COLUMNS = [
  "question",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct_answer",
  "points",
  "category",
  "difficulty",
  "time_limit",
  "explanation",
] as const;

function cell(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  return v == null ? "" : String(v).trim();
}

function toInt(value: string): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

/** Turn a generic record row (from CSV or a sheet) into a draft. */
function rowToDraft(raw: Record<string, unknown>): QuestionDraft {
  // Normalize header keys to lowercase for tolerant matching.
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) row[k.trim().toLowerCase()] = v;

  const options = DEFAULT_OPTION_KEYS.map((key) => ({
    key,
    text: cell(row, `option_${key.toLowerCase()}`),
  })).filter((o) => o.text.length > 0);

  const points = toInt(cell(row, "points"));
  return {
    question_text: cell(row, "question"),
    category: cell(row, "category"),
    difficulty: cell(row, "difficulty"),
    points,
    point_color: pointColorFor(points ?? 0),
    time_limit: toInt(cell(row, "time_limit")) ?? 30,
    explanation: cell(row, "explanation"),
    correct_key: cell(row, "correct_answer").toUpperCase().charAt(0),
    options,
  };
}

export interface ParsedImport {
  drafts: QuestionDraft[];
  missingColumns: string[];
}

/** Parse an uploaded CSV or XLSX file into drafts (spec §46). */
export async function parseQuestionFile(file: File): Promise<ParsedImport> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type === "text/csv") {
    return parseCsv(file);
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return parseXlsx(file);
  }
  throw new Error("Unsupported file type — upload a .csv or .xlsx file.");
}

function detectMissing(headers: string[]): string[] {
  const lower = headers.map((h) => h.trim().toLowerCase());
  return EXPECTED_COLUMNS.filter((c) => !lower.includes(c));
}

async function parseCsv(file: File): Promise<ParsedImport> {
  const text = await file.text();
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
  });
  const missingColumns = detectMissing(result.meta.fields ?? []);
  return { drafts: result.data.map(rowToDraft), missingColumns };
}

async function parseXlsx(file: File): Promise<ParsedImport> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { drafts: [], missingColumns: [...EXPECTED_COLUMNS] };
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
  const headers = rows.length
    ? Object.keys(rows[0])
    : (
        XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })[0] ?? []
      ).map(String);
  return { drafts: rows.map(rowToDraft), missingColumns: detectMissing(headers) };
}

/** Serialize current questions back to CSV for bulk export (spec §48). */
export function questionsToCsv(
  rows: Record<string, string | number>[]
): string {
  return Papa.unparse({
    fields: [...EXPECTED_COLUMNS],
    data: rows.map((r) => EXPECTED_COLUMNS.map((c) => String(r[c] ?? ""))),
  });
}

/** A ready-to-download template so admins know the expected shape. */
export const IMPORT_TEMPLATE_CSV = questionsToCsv([
  {
    question: "Which planet is known as the Red Planet?",
    option_a: "Venus",
    option_b: "Mars",
    option_c: "Jupiter",
    option_d: "Saturn",
    correct_answer: "B",
    points: 100,
    category: "Science",
    difficulty: "Easy",
    time_limit: 30,
    explanation: "Iron oxide gives Mars its reddish appearance.",
  },
]);
