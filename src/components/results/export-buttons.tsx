"use client";

import { useState } from "react";
import { FileSpreadsheet, Printer, Table2 } from "lucide-react";
import { toast } from "sonner";
import type { CompetitionResults } from "@/features/results/types";
import {
  buildWorkbook,
  downloadCsv,
  downloadXlsx,
  resultsToCsv,
  type ExportMeta,
} from "@/features/results/export";
import { Button } from "@/components/ui/button";

/**
 * Results export controls (spec §60). CSV + multi-sheet XLSX built from the
 * reconstructed results, plus a browser print/PDF of the on-screen final
 * results. Purely client-side so it also works in the offline build.
 */
export function ExportButtons({
  results,
  competitionName,
  organizationName,
}: {
  results: CompetitionResults;
  competitionName: string;
  organizationName: string;
}) {
  const [busy, setBusy] = useState(false);

  const meta: ExportMeta = {
    competitionName,
    organizationName,
    dateLabel: new Date().toLocaleDateString(),
    branding: "Designed & Developed by BlackBox Tech",
  };

  const slug =
    competitionName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
    "results";

  function onCsv() {
    try {
      setBusy(true);
      downloadCsv(`${slug}.csv`, resultsToCsv(results, meta));
      toast.success("CSV downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  function onXlsx() {
    try {
      setBusy(true);
      downloadXlsx(`${slug}.xlsx`, buildWorkbook(results, meta));
      toast.success("Excel workbook downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  function onPrint() {
    try {
      window.print();
    } catch {
      toast.error("Unable to open print dialog");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Button variant="outline" size="sm" onClick={onCsv} disabled={busy}>
        <Table2 />
        CSV
      </Button>
      <Button variant="outline" size="sm" onClick={onXlsx} disabled={busy}>
        <FileSpreadsheet />
        Excel (.xlsx)
      </Button>
      <Button variant="outline" size="sm" onClick={onPrint}>
        <Printer />
        Print / PDF
      </Button>
    </div>
  );
}
