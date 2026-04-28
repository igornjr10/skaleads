import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

export interface ReportData {
  generatedAt: string;
  client: { name: string };
  period: { start: string; end: string; label: string };
  summary: {
    spend: number;
    revenue: number;
    roas: number;
    conversions: number;
    impressions: number;
    clicks: number;
    ctr: number;
  };
  topCampaigns: Array<{
    name: string;
    spend: number;
    revenue: number;
    roas: number;
    conversions: number;
    status: string;
  }>;
  recommendations: string;
  branding: { primaryColor: string; agencyName: string };
}

function fmtCurrency(v: number) {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtNum(v: number) {
  return v.toLocaleString("pt-BR");
}
function fmtPct(v: number) {
  return `${v.toFixed(2)}%`;
}

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: "#1e1b4b", padding: 0 },

  // Cover
  cover: { flex: 1, backgroundColor: "#6366f1", padding: 0, justifyContent: "space-between" },
  coverTop: { padding: 48 },
  coverBottom: { backgroundColor: "rgba(0,0,0,0.2)", padding: 32 },
  coverTitle: { fontSize: 28, color: "#fff", fontFamily: "Helvetica-Bold", marginBottom: 8 },
  coverSub: { fontSize: 13, color: "rgba(255,255,255,0.85)" },
  coverDate: { fontSize: 10, color: "rgba(255,255,255,0.7)", marginTop: 4 },
  coverPeriod: { fontSize: 14, color: "#fff", fontFamily: "Helvetica-Bold" },

  // Sections
  section: { padding: "36 48", flex: 1 },
  sectionTitle: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#6366f1", marginBottom: 4 },
  divider: { height: 2, backgroundColor: "#6366f1", marginBottom: 20, opacity: 0.3 },

  // KPI grid
  kpiRow: { flexDirection: "row", gap: 12, marginBottom: 24 },
  kpiBox: { flex: 1, backgroundColor: "#f5f3ff", borderRadius: 8, padding: 16, alignItems: "center" },
  kpiLabel: { fontSize: 8, color: "#7c3aed", marginBottom: 4, textTransform: "uppercase" },
  kpiValue: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#1e1b4b" },
  kpiSub: { fontSize: 7, color: "#9ca3af", marginTop: 2 },

  // Table
  tableHeader: { flexDirection: "row", backgroundColor: "#6366f1", padding: "8 12", borderRadius: 4, marginBottom: 2 },
  tableHeaderCell: { color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 8 },
  tableRow: { flexDirection: "row", padding: "7 12", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  tableCell: { fontSize: 8, color: "#374151" },
  tableRowAlt: { backgroundColor: "#f9fafb" },

  // Col widths campaigns
  colName: { flex: 3 },
  colNum: { flex: 1.5, textAlign: "right" },
  colStatus: { flex: 1.5, textAlign: "center" },

  // Recs
  recText: { fontSize: 10, color: "#374151", lineHeight: 1.8 },

  // Footer
  footer: { position: "absolute", bottom: 24, left: 48, right: 48, flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 7, color: "#9ca3af" },
  pageNumber: { fontSize: 7, color: "#9ca3af" },
});

function Footer({ agency, page }: { agency: string; page: number }) {
  return (
    <View style={styles.footer}>
      <Text style={styles.footerText}>{agency || "MarketProAds"} — Confidencial</Text>
      <Text style={styles.pageNumber}>{page}</Text>
    </View>
  );
}

export function ReportPdfTemplate({ data }: { data: ReportData }) {
  const primary = data.branding.primaryColor || "#6366f1";
  const coverStyle = { ...styles.cover, backgroundColor: primary };

  const campaigns = data.topCampaigns.slice(0, 10);

  return (
    <Document title={`Relatório — ${data.client.name}`} author={data.branding.agencyName || "MarketProAds"}>
      {/* ── Cover ── */}
      <Page size="A4" style={styles.page}>
        <View style={coverStyle}>
          <View style={styles.coverTop}>
            <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginBottom: 48 }}>
              {data.branding.agencyName || "MarketProAds"}
            </Text>
            <Text style={styles.coverTitle}>{data.client.name}</Text>
            <Text style={styles.coverSub}>Relatório de Performance — Meta Ads</Text>
            <Text style={styles.coverDate}>Gerado em {data.generatedAt}</Text>
          </View>
          <View style={styles.coverBottom}>
            <Text style={{ fontSize: 9, color: "rgba(255,255,255,0.7)", marginBottom: 6 }}>PERÍODO ANALISADO</Text>
            <Text style={styles.coverPeriod}>{data.period.label}</Text>
          </View>
        </View>
      </Page>

      {/* ── Resumo Executivo ── */}
      <Page size="A4" style={styles.page}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resumo Executivo</Text>
          <View style={styles.divider} />

          <View style={styles.kpiRow}>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>Investimento</Text>
              <Text style={styles.kpiValue}>{fmtCurrency(data.summary.spend)}</Text>
            </View>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>Receita</Text>
              <Text style={styles.kpiValue}>{fmtCurrency(data.summary.revenue)}</Text>
            </View>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>ROAS</Text>
              <Text style={styles.kpiValue}>{data.summary.roas.toFixed(2)}x</Text>
            </View>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>Conversões</Text>
              <Text style={styles.kpiValue}>{fmtNum(data.summary.conversions)}</Text>
            </View>
          </View>

          <View style={[styles.kpiRow, { marginBottom: 0 }]}>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>Impressões</Text>
              <Text style={styles.kpiValue}>{fmtNum(data.summary.impressions)}</Text>
            </View>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>Cliques</Text>
              <Text style={styles.kpiValue}>{fmtNum(data.summary.clicks)}</Text>
            </View>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>CTR</Text>
              <Text style={styles.kpiValue}>{fmtPct(data.summary.ctr)}</Text>
            </View>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>CPA</Text>
              <Text style={styles.kpiValue}>
                {data.summary.conversions > 0
                  ? fmtCurrency(data.summary.spend / data.summary.conversions)
                  : "—"}
              </Text>
            </View>
          </View>
        </View>
        <Footer agency={data.branding.agencyName} page={2} />
      </Page>

      {/* ── Top Campanhas ── */}
      {campaigns.length > 0 && (
        <Page size="A4" style={styles.page}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top Campanhas</Text>
            <View style={styles.divider} />

            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, styles.colName]}>Campanha</Text>
              <Text style={[styles.tableHeaderCell, styles.colNum]}>Investimento</Text>
              <Text style={[styles.tableHeaderCell, styles.colNum]}>Receita</Text>
              <Text style={[styles.tableHeaderCell, styles.colNum]}>ROAS</Text>
              <Text style={[styles.tableHeaderCell, styles.colNum]}>Conversões</Text>
              <Text style={[styles.tableHeaderCell, styles.colStatus]}>Status</Text>
            </View>

            {campaigns.map((c, i) => (
              <View key={i} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                <Text style={[styles.tableCell, styles.colName]} numberOfLines={2}>{c.name}</Text>
                <Text style={[styles.tableCell, styles.colNum]}>{fmtCurrency(c.spend)}</Text>
                <Text style={[styles.tableCell, styles.colNum]}>{fmtCurrency(c.revenue)}</Text>
                <Text style={[styles.tableCell, styles.colNum]}>{c.roas.toFixed(2)}x</Text>
                <Text style={[styles.tableCell, styles.colNum]}>{fmtNum(c.conversions)}</Text>
                <Text style={[styles.tableCell, styles.colStatus]}>{c.status}</Text>
              </View>
            ))}
          </View>
          <Footer agency={data.branding.agencyName} page={3} />
        </Page>
      )}

      {/* ── Recomendações ── */}
      <Page size="A4" style={styles.page}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recomendações</Text>
          <View style={styles.divider} />
          <Text style={styles.recText}>{data.recommendations || "Nenhuma recomendação registrada para este período."}</Text>
        </View>
        <Footer agency={data.branding.agencyName} page={campaigns.length > 0 ? 4 : 3} />
      </Page>
    </Document>
  );
}
