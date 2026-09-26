import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { CompetitionResults } from "@/features/results/types";

/**
 * Results export (spec §60). Produces CSV, XLSX (multi-sheet) and a browser
 * print/PDF of the reconstructed results. Pure and client-side so it works
 * offline too. BlackBox + organization branding is included per §60.
 */

export interface ExportMeta {
  competitionName: string;
  organizationName: string;
  dateLabel: string;
  branding: string;
}

const TEAM_METRICS: [string, (t: CompetitionResults["teams"][number]) => number][] = [
  ["Final score", (t) => t.finalScore],
  ["Starting score", (t) => t.startingScore],
  ["Points gained", (t) => t.pointsGained],
  ["Questions selected", (t) => t.questionsSelected],
  ["Correct answers", (t) => t.correct],
  ["Wrong answers", (t) => t.wrong],
  ["Timeouts", (t) => t.timeouts],
  ["Bonus opportunities", (t) => t.bonusReceived],
  ["Bonus correct", (t) => t.bonusCorrect],
  ["Bonus wrong", (t) => t.bonusWrong],
  ["Questions attempted", (t) => t.attempted],
  ["Manual adjustments", (t) => t.adjustments],
];

export function buildSummarySheet(
  results: CompetitionResults,
  meta: ExportMeta
): XLSX.WorkSheet {
  const header: (string | number)[][] = [
    [meta.branding],
    [meta.competitionName],
    [meta.organizationName, "", meta.dateLabel],
    ["Status", results.status, results.isDraw ? "DRAW" : ""],
    [],
    ["Metric", ...results.teams.map((t) => t.name)],
  ];
  const body = TEAM_METRICS.map(([label, get]) => [
    label,
    ...results.teams.map((t) => get(t)),
  ]);
  const aoa = [...header, ...body];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 24 }, ...results.teams.map(() => ({ wch: 18 }))];
  return ws;
}

export function buildQuestionsSheet(
  results: CompetitionResults
): XLSX.WorkSheet {
  const teamName = (id: string | null) =>
    (id && results.teams.find((t) => t.teamId === id)?.name) || "";
  const rows = results.questions.map((q) => ({
    "Question": q.questionNumber,
    "Value": q.points,
    "Primary Team": teamName(q.primaryTeamId),
    "Primary Result": q.primaryResult,
    "Bonus Team": teamName(q.bonusTeamId),
    "Bonus Result": q.bonusResult,
    "Points Awarded": q.pointsAwarded,
    "Awarded To": teamName(q.awardedTeamId),
  }));
  const ws = XLSX.utils.json_to_sheet(rows, {
    header: [
      "Question",
      "Value",
      "Primary Team",
      "Primary Result",
      "Bonus Team",
      "Bonus Result",
      "Points Awarded",
      "Awarded To",
    ],
  });
  ws["!cols"] = [
    { wch: 10 },
    { wch: 8 },
    { wch: 16 },
    { wch: 14 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
  ];
  return ws;
}

export function buildWorkbook(
  results: CompetitionResults,
  meta: ExportMeta
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSummarySheet(results, meta), "Summary");
  XLSX.utils.book_append_sheet(wb, buildQuestionsSheet(results), "Questions");
  return wb;
}

/** Flat CSV: header block + per-question rows (§60). */
export function resultsToCsv(
  results: CompetitionResults,
  meta: ExportMeta
): string {
  const teamName = (id: string | null) =>
    (id && results.teams.find((t) => t.teamId === id)?.name) || "";
  const lines: string[][] = [
    [meta.branding],
    [meta.competitionName],
    [meta.organizationName, meta.dateLabel],
    ["Status", results.status],
    [],
    ["Metric", ...results.teams.map((t) => t.name)],
    ...TEAM_METRICS.map(([label, get]) => [
      label,
      ...results.teams.map((t) => String(get(t))),
    ]),
    [],
    [
      "Question",
      "Value",
      "Primary Team",
      "Primary Result",
      "Bonus Team",
      "Bonus Result",
      "Points Awarded",
      "Awarded To",
    ],
    ...results.questions.map((q) => [
      String(q.questionNumber),
      String(q.points),
      teamName(q.primaryTeamId),
      q.primaryResult,
      teamName(q.bonusTeamId),
      q.bonusResult,
      String(q.pointsAwarded),
      teamName(q.awardedTeamId),
    ]),
  ];
  return Papa.unparse(lines);
}

/** Trigger a client-side file download from a Blob. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadCsv(filename: string, csv: string): void {
  downloadBlob(
    filename,
    new Blob([csv], { type: "text/csv;charset=utf-8" })
  );
}

export function downloadXlsx(filename: string, wb: XLSX.WorkBook): void {
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob(
    filename,
    new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
  );
}
