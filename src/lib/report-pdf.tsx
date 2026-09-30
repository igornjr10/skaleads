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

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function buildContentBriefPdfBlob(params: {
  pauta: import("@/lib/niche-insights").PautaDeConteudo;
  segmentLabel: string;
  contas: number;
}) {
  const [{ pdf }, { ContentBriefPdfTemplate }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/reports/ContentBriefPdfTemplate"),
  ]);

  return pdf(
    <ContentBriefPdfTemplate
      pauta={params.pauta}
      segmentLabel={params.segmentLabel}
      contas={params.contas}
      geradoEm={new Date().toLocaleDateString("pt-BR")}
    />
  ).toBlob();
}
