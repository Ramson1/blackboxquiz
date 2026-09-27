"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FileUp, FileText, Upload } from "lucide-react";
import { bulkImportQuestionsAction } from "@/features/questions/actions";
import {
  IMPORT_TEMPLATE_CSV,
  importTemplateXlsx,
  parseQuestionFile,
} from "@/features/questions/parse-import";
import {
  validateQuestionDraft,
  type QuestionDraft,
} from "@/lib/validation/questions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ValidatedRow {
  draft: QuestionDraft;
  error: string | null;
}

function download(filename: string, data: string | Blob, type?: string) {
  const blob =
    typeof data === "string" ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function BulkImportDialog({
  competitionId,
  open,
  onOpenChange,
}: {
  competitionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<ValidatedRow[] | null>(null);
  const [missingColumns, setMissingColumns] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");

  function reset() {
    setRows(null);
    setMissingColumns([]);
    setFileName("");
  }

  function onOpen(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleFile(file: File) {
    setParsing(true);
    setFileName(file.name);
    try {
      const parsed = await parseQuestionFile(file);
      setMissingColumns(parsed.missingColumns);
      setRows(
        parsed.drafts.map((draft) => ({
          draft,
          error: validateQuestionDraft(draft),
        }))
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not parse file");
      setFileName("");
    } finally {
      setParsing(false);
    }
  }

  const validRows = rows?.filter((r) => !r.error) ?? [];
  const invalidCount = rows?.filter((r) => r.error).length ?? 0;

  function onConfirm() {
    if (validRows.length === 0) {
      toast.error("No valid rows to import");
      return;
    }
    start(async () => {
      const res = await bulkImportQuestionsAction({
        competitionId,
        drafts: validRows.map((r) => r.draft),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { imported, rejected } = res.result;
      toast.success(`Imported ${imported} question(s)${rejected ? `, skipped ${rejected}` : ""}`);
      onOpenChange(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bulk import questions</DialogTitle>
          <DialogDescription>
            Upload a CSV or XLSX file. Invalid rows are shown and skipped —
            only valid rows are imported.
          </DialogDescription>
        </DialogHeader>

        {!rows ? (
          <div className="flex flex-col gap-4">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-10 text-center hover:bg-muted/50">
              <FileUp className="size-8 text-muted-foreground" />
              <span className="font-medium">
                {parsing ? "Parsing…" : "Choose a CSV or Excel file"}
              </span>
              <span className="text-xs text-muted-foreground">
                Download the template below, fill in your questions (one per
                row), then upload it here. Every row is validated and previewed
                before anything is imported.
              </span>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                disabled={parsing}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = "";
                }}
              />
            </label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  download(
                    "question-template.csv",
                    IMPORT_TEMPLATE_CSV,
                    "text/csv;charset=utf-8"
                  )
                }
              >
                <FileText />
                Download CSV template
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  download("question-template.xlsx", importTemplateXlsx())
                }
              >
                <FileSpreadsheet />
                Download Excel template
              </Button>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Download className="size-3.5" />
              Tip: correct_answer accepts the option letter (A–D) or the exact
              option text. Leave option_c/option_d empty for 2-option questions.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {fileName} — {rows.length} row(s) parsed
              </p>
              <Button variant="ghost" size="sm" onClick={reset}>
                Choose another file
              </Button>
            </div>

            {missingColumns.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  Missing columns: {missingColumns.join(", ")}. Rows needing them
                  will be rejected.
                </span>
              </div>
            )}

            <div className="max-h-80 overflow-y-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60 text-left">
                  <tr>
                    <th className="w-10 px-2 py-1.5">#</th>
                    <th className="px-2 py-1.5">Question</th>
                    <th className="w-16 px-2 py-1.5">Pts</th>
                    <th className="px-2 py-1.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={i}
                      className={
                        r.error
                          ? "border-t bg-red-500/5 text-red-700 dark:text-red-400"
                          : "border-t"
                      }
                    >
                      <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                        {i + 1}
                      </td>
                      <td className="px-2 py-1.5">
                        <span className="line-clamp-1">
                          {r.draft.question_text || (
                            <em className="text-muted-foreground">(empty)</em>
                          )}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 tabular-nums">
                        {r.draft.points ?? "—"}
                      </td>
                      <td className="px-2 py-1.5">
                        {r.error ? (
                          <span className="inline-flex items-center gap-1">
                            <AlertTriangle className="size-3.5" />
                            {r.error}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="size-3.5" />
                            Valid
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-sm">
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                {validRows.length} valid
              </span>
              {invalidCount > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-red-600 dark:text-red-400">
                    {invalidCount} will be skipped
                  </span>
                </>
              )}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button
            onClick={onConfirm}
            disabled={pending || validRows.length === 0}
          >
            <Upload />
            Import {validRows.length > 0 ? `${validRows.length} question(s)` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
