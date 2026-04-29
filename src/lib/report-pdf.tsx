import type { ReportData } from "@/lib/report-types";

export async function buildReportPdfBlob(data: ReportData) {
  const [{ pdf }, { ReportPdfTemplate }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/reports/ReportPdfTemplate"),
  ]);

  return pdf(<ReportPdfTemplate data={data} />).toBlob();
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
