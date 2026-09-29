"use client";

import { extractRawText } from "mammoth";
import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

/**
 * Bulk question upload for the public setup wizard via Word (.docx).
 *
 * PARSE step only (mirrors parse-import.ts): turns a .docx into normalized
 * question rows. Validation/preview happens in the wizard; the server
 * re-validates everything on final submit (blackboxquiz_public_complete_setup).
 *
 * Supported format (the downloadable template uses exactly this):
 *
 *   Question: Which planet is known as the Red Planet?
 *   Option A: Venus
 *   Option B: Mars
 *   Option C: Jupiter
 *   Option D: Saturn
 *   Answer: B
 *   Points: 100
 *
 * A legacy "numbered" style is also accepted (typed literally, not Word
 * auto-numbering, which strips the digits from raw text):
 *
 *   1. Which planet is known as the Red Planet?
 *   A. Venus   B. Mars   C. Jupiter   D. Saturn
 *   Answer: B
 *
 * Labeled-field lines survive Word's auto-formatting, which is why the
 * template prefers "Question:/Option A:/Answer:/Points:".
 */

export interface DocxQuestion {
  question_text: string;
  options: { key: string; text: string }[];
  correct_key: string;
  points: number;
}

export interface DocxParseResult {
  questions: DocxQuestion[];
  /** Human-readable problems for rows we could not accept. */
  issues: string[];
}

const MAX_OPTIONS = 8;

// Field-labeled lines (preferred format).
const RE_QUESTION = /^q(?:uestion)?\s*(?:\d+\s*)?[:.\-)]\s*(.*)$/i;
const RE_OPTION = /^option\s*([a-h])\s*[:.\-)]\s*(.*)$/i;
const RE_ANSWER = /^(?:correct\s*)?answer\s*[:.\-)]\s*(.*)$/i;
const RE_POINTS = /^p(?:oint|oints)?\s*[:.\-)]\s*(.+)$/i;
// Legacy literal numbering ("1." / "Q1.") and letter options ("A.").
const RE_NUMBERED = /^(?:\d{1,3}|q\d{1,3})\s*[.)\-:]\s+(.+)$/i;
const RE_LETTER_OPT = /^([a-h])\s*[.)\-:]\s+(.+)$/i;

interface Block {
  text: string;
  options: { key: string; text: string }[];
  answer: string;
  points: string;
}

function newBlock(text = ""): Block {
  return { text, options: [], answer: "", points: "" };
}

/** Resolve an "Answer:" value to an option key (letter or option text). */
function resolveAnswer(raw: string, options: { key: string; text: string }[]): string | null {
  const value = raw.trim();
  if (!value) return null;
  // "B", "b.", "Option B", "B. Mars" → letter wins when it matches an option.
  const byLetter = /^(?:option\s*)?([a-h])\b/i.exec(value);
  if (byLetter) {
    const key = byLetter[1].toUpperCase();
    if (options.some((o) => o.key === key)) return key;
  }
  // Otherwise match the full option text (case-insensitive).
  const upper = value.toUpperCase();
  const byText = options.find((o) => o.text.toUpperCase() === upper);
  if (byText) return byText.key;
  // "B. Mars" style where the letter did not match but text does.
  const stripped = /^[a-h]\s*[.)\-:]\s*(.+)$/i.exec(value);
  if (stripped) {
    const t = stripped[1].trim().toUpperCase();
    const again = options.find((o) => o.text.toUpperCase() === t);
    if (again) return again.key;
  }
  return null;
}

function parsePoints(raw: string): { points: number; error: string | null } {
  const n = Number.parseInt(raw.replace(/[^\d-]/g, ""), 10);
  if (Number.isNaN(n) || n <= 0) return { points: 100, error: "Points must be a positive number (defaulted to 100)" };
  return { points: n, error: null };
}

/** Finalize one raw block into a question or a listed issue. */
function acceptBlock(block: Block, index: number, out: DocxQuestion[], issues: string[]) {
  // Prose (titles, instruction lines, headings): a real question block always
  // carries at least one option or an Answer: line. Skip silently so the
  // template's own instructions are never imported as questions.
  if (block.options.length === 0 && !block.answer.trim()) return;
  const label = block.text ? `"${block.text.slice(0, 60)}"` : `Question #${index}`;
  if (!block.text.trim()) {
    issues.push(`${label}: has no question text`);
    return;
  }
  const usable = block.options
    .slice(0, MAX_OPTIONS)
    .filter((o) => o.text.trim().length > 0);
  if (usable.length < 2) {
    issues.push(`${label}: needs at least two options (found ${usable.length})`);
    return;
  }
  const key = resolveAnswer(block.answer, usable);
  if (!key) {
    issues.push(
      block.answer.trim()
        ? `${label}: answer "${block.answer.trim().slice(0, 40)}" does not match any option`
        : `${label}: missing an Answer: line`
    );
    return;
  }
  const { points, error } = block.points
    ? parsePoints(block.points)
    : { points: 100, error: null };
  if (error) issues.push(`${label}: ${error}`);
  out.push({
    question_text: block.text.trim(),
    options: usable.map((o) => ({ key: o.key, text: o.text.trim() })),
    correct_key: key,
    points,
  });
}

/** Parse the raw text extracted from a .docx into question rows. */
export function parseDocxText(raw: string): DocxParseResult {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const questions: DocxQuestion[] = [];
  const issues: string[] = [];
  let current: Block | null = null;
  let counter = 0;
  // Tracks what continuation lines should extend within the current block.
  let mode: "question" | "option" | "meta" | "none" = "none";

  const flush = () => {
    if (current) {
      counter += 1;
      acceptBlock(current, counter, questions, issues);
    }
    current = null;
    mode = "none";
  };

  for (const line of lines) {
    let m: RegExpExecArray | null;

    if ((m = RE_QUESTION.exec(line))) {
      flush();
      current = newBlock(m[1]);
      mode = "question";
      continue;
    }
    if ((m = RE_NUMBERED.exec(line)) && !RE_LETTER_OPT.test(line)) {
      flush();
      current = newBlock(m[1]);
      mode = "question";
      continue;
    }
    if ((m = RE_OPTION.exec(line))) {
      if (!current) {
        issues.push(`Ignored stray option line "${line.slice(0, 60)}" (no question above it)`);
        continue;
      }
      current.options.push({ key: m[1].toUpperCase(), text: m[2] });
      mode = "option";
      continue;
    }
    if ((m = RE_LETTER_OPT.exec(line))) {
      if (!current) {
        issues.push(`Ignored stray option line "${line.slice(0, 60)}" (no question above it)`);
        continue;
      }
      current.options.push({ key: m[1].toUpperCase(), text: m[2] });
      mode = "option";
      continue;
    }
    if ((m = RE_ANSWER.exec(line))) {
      if (current) {
        current.answer = m[1];
        mode = "meta";
      }
      continue;
    }
    if ((m = RE_POINTS.exec(line))) {
      if (current) {
        current.points = m[1];
        mode = "meta";
      }
      continue;
    }
    // Continuation of a wrapped question/option; stray text after meta lines
    // starts a new question so nothing is silently dropped.
    if (current && (mode === "question" || mode === "option")) {
      if (mode === "question") current.text += " " + line;
      else current.options[current.options.length - 1].text += " " + line;
      continue;
    }
    if (current) {
      flush();
    }
    // A line outside any block — treat as the start of a plain question.
    current = newBlock(line);
    mode = "question";
  }
  flush();

  return { questions, issues };
}

/** Read an uploaded .docx and extract its text as question rows. */
export async function parseDocxFile(file: File): Promise<DocxParseResult> {
  const buffer = await file.arrayBuffer();
  const result = await extractRawText({ arrayBuffer: buffer });
  if (!result.value.trim()) {
    throw new Error("This Word document has no readable text.");
  }
  return parseDocxText(result.value);
}

// ---------------------------------------------------------------------------
// Downloadable template (built client-side with the `docx` library).
// ---------------------------------------------------------------------------

function line(text: string, opts: { bold?: boolean; italics?: boolean } = {}) {
  return new Paragraph({
    children: [new TextRun({ text, bold: opts.bold, italics: opts.italics })],
  });
}

function labeled(label: string, value: string) {
  return new Paragraph({
    children: [
      new TextRun({ text: label, bold: true }),
      new TextRun({ text: value }),
    ],
  });
}

/** A ready-to-fill .docx template using the labeled-field format. */
export async function buildTemplateDocxBlob(): Promise<Blob> {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "BlackBox Quiz — Question Template", bold: true, size: 32 })],
          }),
          line(""),
          labeled("How to use: ", "one block per question. Keep the labels shown below — the importer reads them. Delete the example questions and type your own. Save the file and upload it on the setup page."),
          line(""),
          new Paragraph({ children: [new TextRun({ text: "Rules", bold: true, size: 26 })] }),
          line("• Start every question with \"Question:\" on its own line."),
          line("• Add 2 to 8 options, each on its own line: \"Option A:\", \"Option B:\", …"),
          line("• Mark the right one with \"Answer:\" — an option letter (B) or the exact option text."),
          line("• Optionally set points with \"Points:\" (100, 200, 300, 500, 1000…). Default is 100."),
          line(""),
          new Paragraph({ children: [new TextRun({ text: "Example 1", bold: true, size: 26 })] }),
          labeled("Question: ", "Which planet is known as the Red Planet?"),
          labeled("Option A: ", "Venus"),
          labeled("Option B: ", "Mars"),
          labeled("Option C: ", "Jupiter"),
          labeled("Option D: ", "Saturn"),
          labeled("Answer: ", "B"),
          labeled("Points: ", "100"),
          line(""),
          new Paragraph({ children: [new TextRun({ text: "Example 2", bold: true, size: 26 })] }),
          labeled("Question: ", "Who authored the novel 'Things Fall Apart'?"),
          labeled("Option A: ", "Chinua Achebe"),
          labeled("Option B: ", "Wole Soyinka"),
          labeled("Answer: ", "Chinua Achebe"),
          labeled("Points: ", "200"),
          line(""),
          line("— Your questions start below this line —", { italics: true }),
        ],
      },
    ],
  });
  return Packer.toBlob(doc);
}

/** Trigger a browser download of the template. */
export async function downloadTemplateDocx(): Promise<void> {
  const blob = await buildTemplateDocxBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "blackboxquiz-question-template.docx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
