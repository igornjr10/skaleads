import {
  Document,
  Image,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { ReportData } from "@/lib/report-types";

function sanitizePdfText(value?: string | null) {
  if (!value) return "";

  return value
    .normalize("NFKD")
    .replace(/[•·▪▫◦●]/g, "- ")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[✅✔]/g, "OK ")
    .replace(/[❌✖]/g, "X ")
    .replace(/[🔥🚀⭐✨💥🎯📈📊💬📣]/g, " ")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

function fmtNullableNum(v?: number | null) {
  if (v === null || v === undefined) return "-";
  return fmtNum(v);
}

function chunkMetrics<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function getPreferredMetrics(data: ReportData) {
  const preferences = data.metricPreferences?.length
    ? data.metricPreferences
    : ["spend", "impressions", "clicks", "roas", "ctr"];

  const registry: Record<string, { label: string; value: string; note: string }> = {
    spend: {
      label: "Valor investido",
      value: fmtCurrency(data.summary.spend),
      note: "No periodo selecionado",
    },
    impressions: {
      label: "Impressoes totais",
      value: fmtNum(data.summary.impressions),
      note: "Entrega acumulada",
    },
    clicks: {
      label: "Total de cliques no link",
      value: fmtNum(data.summary.clicks),
      note: "Cliques no link no periodo",
    },
    messagesStarted: {
      label: "Mensagens iniciadas",
      value: fmtNum(data.summary.messagesStarted || 0),
      note: "Conversas abertas no periodo",
    },
    purchaseValue: {
      label: "Valor de compras",
      value: fmtCurrency(data.summary.purchaseValue || 0),
      note: "Conversao total registrada",
    },
    purchases: {
      label: "Compras",
      value: fmtNum(data.summary.purchases || 0),
      note: "Quantidade total de compras",
    },
    costPerPurchase: {
      label: "Custo por compra",
      value: data.summary.purchases ? fmtCurrency(data.summary.costPerPurchase || 0) : "-",
      note: "Investimento medio por compra",
    },
    roas: {
      label: "ROAS",
      value: `${(data.summary.roas || 0).toFixed(2)}x`,
      note: "Retorno por real investido",
    },
    revenue: {
      label: "Faturamento",
      value: fmtCurrency(data.summary.revenue || 0),
      note: "Receita gerada no periodo",
    },
    ctr: {
      label: "CTR",
      value: fmtPct(data.summary.ctr || 0),
      note: "Taxa de cliques",
    },
    cpc: {
      label: "CPC",
      value: fmtCurrency(data.summary.cpc || 0),
      note: "Custo medio por clique",
    },
    cpm: {
      label: "CPM",
      value: fmtCurrency(data.summary.cpm || 0),
      note: "Custo por mil impressoes",
    },
    reach: {
      label: "Alcance",
      value: fmtNum(data.summary.reach || 0),
      note: "Pessoas unicas alcancadas",
    },
    frequency: {
      label: "Frequencia",
      value: (data.summary.frequency || 0).toFixed(2),
      note: "Exibicoes medias por pessoa",
    },
  };

  return preferences.map((key) => registry[key]).filter(Boolean);
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#0f172a",
    backgroundColor: "#eef4f8",
    padding: 24,
  },
  shell: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 26,
  },
  cover: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    paddingTop: 18,
    paddingBottom: 26,
  },
  agencyKicker: {
    fontSize: 9,
    color: "#94a3b8",
    letterSpacing: 1.2,
    marginBottom: 20,
  },
  badgeCircle: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: "#f7efe3",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#eadcc8",
  },
  brandLogo: {
    width: 74,
    height: 74,
    borderRadius: 37,
    objectFit: "cover",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#eadcc8",
  },
  badgeText: {
    fontSize: 13,
    color: "#8b6a3d",
    fontFamily: "Helvetica-Bold",
  },
  coverRule: {
    width: 54,
    height: 3,
    borderRadius: 999,
    backgroundColor: "#2563eb",
    marginBottom: 18,
  },
  coverTitle: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 10,
  },
  coverSub: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 18,
  },
  coverMeta: {
    fontSize: 10,
    color: "#1f2937",
    textAlign: "center",
    lineHeight: 1.5,
    maxWidth: 360,
  },
  coverPill: {
    marginTop: 22,
    borderWidth: 1,
    borderColor: "#dbe4ee",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 16,
    fontSize: 9,
    color: "#64748b",
  },
  reportCard: {
    borderWidth: 1,
    borderColor: "#dbe7f3",
    borderRadius: 16,
    overflow: "hidden",
    boxShadow: "0 8 24 rgba(15, 23, 42, 0.04)",
  },
  reportCardTop: {
    height: 4,
    backgroundColor: "#2563eb",
  },
  reportCardBody: {
    padding: 18,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  networkDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    color: "#ffffff",
    textAlign: "center",
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    paddingTop: 5,
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: 14.5,
    fontFamily: "Helvetica-Bold",
  },
  sectionSub: {
    fontSize: 8,
    color: "#64748b",
    marginTop: 3,
  },
  headerChip: {
    fontSize: 8,
    color: "#2563eb",
    backgroundColor: "#eef5ff",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 11,
  },
  metricsRow: {
    flexDirection: "row",
    marginBottom: 16,
  },
  metricCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: "#edf2f7",
  },
  metricLabel: {
    fontSize: 8,
    color: "#475569",
    textAlign: "center",
    marginBottom: 7,
  },
  metricValue: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  metricNote: {
    fontSize: 7,
    color: "#94a3b8",
    marginTop: 5,
  },
  analysisBox: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fbfd",
    borderRadius: 14,
    padding: 15,
    marginBottom: 16,
  },
  analysisLabel: {
    fontSize: 8,
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 7,
  },
  analysisText: {
    fontSize: 10.2,
    color: "#334155",
    lineHeight: 1.55,
  },
  blockTitle: {
    fontSize: 11.5,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 12,
  },
  tableWrap: {
    borderWidth: 1,
    borderColor: "#dbe7f3",
    borderRadius: 12,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f7fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#dbe7f3",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  tableHeaderCell: {
    fontSize: 7,
    color: "#64748b",
    fontFamily: "Helvetica-Bold",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f7",
  },
  tableRowAlt: {
    backgroundColor: "#fcfdff",
  },
  tableCell: {
    fontSize: 7.5,
    color: "#1f2937",
  },
  adCell: {
    flexDirection: "row",
    alignItems: "center",
  },
  adThumb: {
    width: 34,
    height: 34,
    borderRadius: 6,
    marginRight: 8,
    objectFit: "cover",
  },
  adThumbFallback: {
    width: 34,
    height: 34,
    borderRadius: 6,
    marginRight: 8,
    backgroundColor: "#e2e8f0",
    color: "#475569",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  adNameWrap: {
    flex: 1,
  },
  adTypeText: {
    fontSize: 6.5,
    color: "#64748b",
    marginTop: 2,
  },
  statusCell: {
    flex: 1.2,
    alignItems: "flex-end",
  },
  statusPill: {
    fontSize: 7,
    color: "#2563eb",
    backgroundColor: "#eff6ff",
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  helperText: {
    fontSize: 9,
    color: "#64748b",
    textAlign: "center",
    marginTop: 12,
  },
  socialCard: {
    borderWidth: 1,
    borderColor: "#dbe7f3",
    backgroundColor: "#f8fbfd",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  socialHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  socialLogo: {
    width: 42,
    height: 42,
    borderRadius: 21,
    objectFit: "cover",
    marginRight: 10,
  },
  socialLogoFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 10,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  socialLogoFallbackText: {
    fontSize: 11,
    color: "#475569",
    fontFamily: "Helvetica-Bold",
  },
  socialProfileName: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
  },
  socialProfileMeta: {
    fontSize: 8,
    color: "#64748b",
    marginTop: 2,
  },
  socialMetricsRow: {
    flexDirection: "row",
  },
  socialMetricCell: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: "#e2e8f0",
    paddingHorizontal: 8,
  },
  socialMetricLabel: {
    fontSize: 7.5,
    color: "#64748b",
    marginBottom: 4,
  },
  socialMetricValue: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
  },
  socialMetricSource: {
    fontSize: 6.5,
    color: "#94a3b8",
    marginTop: 4,
  },
  colWide: {
    flex: 3.2,
  },
  colMetric: {
    flex: 1.2,
    textAlign: "right",
  },
  colNarrow: {
    flex: 1,
    textAlign: "right",
  },
  footer: {
    position: "absolute",
    left: 40,
    right: 40,
    bottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 7,
    color: "#94a3b8",
  },
});

function Footer({ agency, page }: { agency: string; page: number }) {
  return (
    <View style={styles.footer}>
      <Text style={styles.footerText}>{agency || "MarketProAds"}  |  Relatorio executivo</Text>
      <Text style={styles.footerText}>{page}</Text>
    </View>
  );
}

function SummaryTable({ data }: { data: ReportData }) {
  const campaigns = data.topCampaigns.slice(0, 10);

  return (
    <>
      <Text style={styles.blockTitle}>Campanhas em destaque</Text>
      <View style={styles.tableWrap}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, styles.colWide]}>Nome da campanha</Text>
          <Text style={[styles.tableHeaderCell, styles.colMetric]}>Investido</Text>
          <Text style={[styles.tableHeaderCell, styles.colMetric]}>Compras</Text>
          <Text style={[styles.tableHeaderCell, styles.colMetric]}>CTR</Text>
          <Text style={[styles.tableHeaderCell, styles.colMetric]}>Custo por compra</Text>
          <Text style={[styles.tableHeaderCell, styles.colMetric]}>Status</Text>
        </View>
        {campaigns.map((campaign, index) => (
          <View key={index} style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}>
            <Text style={[styles.tableCell, styles.colWide]}>{sanitizePdfText(campaign.name)}</Text>
            <Text style={[styles.tableCell, styles.colMetric]}>{fmtCurrency(campaign.spend)}</Text>
            <Text style={[styles.tableCell, styles.colMetric]}>{fmtNum(campaign.conversions)}</Text>
            <Text style={[styles.tableCell, styles.colMetric]}>{campaign.ctr !== undefined ? fmtPct(campaign.ctr) : "-"}</Text>
            <Text style={[styles.tableCell, styles.colMetric]}>
              {campaign.conversions > 0 ? fmtCurrency(campaign.spend / campaign.conversions) : "-"}
            </Text>
            <View style={styles.statusCell}>
              <Text style={styles.statusPill}>{campaign.status}</Text>
            </View>
          </View>
        ))}
      </View>
      {campaigns.length === 0 && <Text style={styles.helperText}>Nao ha campanhas suficientes para o periodo selecionado.</Text>}
    </>
  );
}

function AdsTable({ data }: { data: ReportData }) {
  const ads = data.topAds.slice(0, 10);

  return (
    <>
      <Text style={styles.blockTitle}>Anuncios em destaque</Text>
      <View style={styles.tableWrap}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, styles.colWide]}>Anuncio</Text>
          <Text style={[styles.tableHeaderCell, styles.colNarrow]}>Cliques</Text>
          <Text style={[styles.tableHeaderCell, styles.colNarrow]}>Investido</Text>
          <Text style={[styles.tableHeaderCell, styles.colNarrow]}>Impressoes</Text>
          <Text style={[styles.tableHeaderCell, styles.colNarrow]}>CTR</Text>
          <Text style={[styles.tableHeaderCell, styles.colNarrow]}>CPC</Text>
          <Text style={[styles.tableHeaderCell, styles.colNarrow]}>CPM</Text>
        </View>
        {ads.map((ad, index) => (
          <View key={index} style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}>
            <View style={[styles.colWide, styles.adCell]}>
              {ad.previewUrl ? (
                <Image src={ad.previewUrl} style={styles.adThumb} />
              ) : (
                <View style={styles.adThumbFallback}>
                  <Text>AD</Text>
                </View>
              )}
              <View style={styles.adNameWrap}>
                <Text style={styles.tableCell}>{sanitizePdfText(ad.name)}</Text>
                <Text style={styles.adTypeText}>{ad.creativeType === "video" ? "Video" : "Imagem"}</Text>
              </View>
            </View>
            <Text style={[styles.tableCell, styles.colNarrow]}>{fmtNum(ad.clicks)}</Text>
            <Text style={[styles.tableCell, styles.colNarrow]}>{fmtCurrency(ad.spend)}</Text>
            <Text style={[styles.tableCell, styles.colNarrow]}>{fmtNum(ad.impressions)}</Text>
            <Text style={[styles.tableCell, styles.colNarrow]}>{fmtPct(ad.ctr)}</Text>
            <Text style={[styles.tableCell, styles.colNarrow]}>{fmtCurrency(ad.cpc)}</Text>
            <Text style={[styles.tableCell, styles.colNarrow]}>{fmtCurrency(ad.cpm)}</Text>
          </View>
        ))}
      </View>
      {ads.length === 0 && <Text style={styles.helperText}>Nenhum anuncio sincronizado para compor esta pagina.</Text>}
    </>
  );
}

function SocialPresenceCard({ data }: { data: ReportData }) {
  if (!data.socialPresence?.enabled) return null;

  const profile = data.socialPresence;
  const initials = sanitizePdfText(profile.profileName || data.client.name || "MP").slice(0, 2).toUpperCase();

  return (
    <View style={styles.socialCard}>
      <View style={styles.socialHeader}>
        {profile.logoUrl ? (
          <Image src={profile.logoUrl} style={styles.socialLogo} />
        ) : (
          <View style={styles.socialLogoFallback}>
            <Text style={styles.socialLogoFallbackText}>{initials}</Text>
          </View>
        )}
        <View>
          <Text style={styles.socialProfileName}>{sanitizePdfText(profile.profileName)}</Text>
          <Text style={styles.socialProfileMeta}>
            {sanitizePdfText(profile.sourceLabels.length ? profile.sourceLabels.join(" + ") : "Presenca digital")}
          </Text>
        </View>
      </View>

      <View style={styles.socialMetricsRow}>
        {profile.metrics.map((metric, index) => (
          <View key={metric.key} style={[styles.socialMetricCell, index === profile.metrics.length - 1 && { borderRightWidth: 0 }]}>
            <Text style={styles.socialMetricLabel}>{metric.label}</Text>
            <Text style={styles.socialMetricValue}>{fmtNullableNum(metric.value)}</Text>
            <Text style={styles.socialMetricSource}>{sanitizePdfText(metric.source)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function ReportPdfTemplate({ data }: { data: ReportData }) {
  const introText = `Relatorio gerado dos dados analisados entre ${data.period.label}.`;
  const campaigns = data.topCampaigns.slice(0, 10);
  const ads = data.topAds.slice(0, 10);
  const recommendationPage = ads.length > 0 ? 4 : 3;
  const preferredMetrics = getPreferredMetrics(data);
  const metricRows = chunkMetrics(preferredMetrics, 4);
  const consolidatedMetrics = [
    ...preferredMetrics,
    { label: "CTR medio", value: fmtPct(data.summary.ctr), note: "Taxa de clique" },
    { label: "CPC medio", value: fmtCurrency(data.summary.cpc), note: "Custo por clique" },
    { label: "CPM medio", value: fmtCurrency(data.summary.cpm), note: "Custo por mil" },
    { label: "Compras totais", value: fmtNum(data.summary.purchases || data.summary.conversions), note: "Compras registradas" },
  ];

  return (
    <Document title={`Relatorio - ${sanitizePdfText(data.client.name)}`} author={sanitizePdfText(data.branding.agencyName) || "MarketProAds"}>
      <Page size="A4" style={styles.page}>
        <View style={styles.shell}>
          <View style={styles.cover}>
            {data.client.logoUrl ? (
              <Image src={data.client.logoUrl} style={styles.brandLogo} />
            ) : (
              <View style={styles.badgeCircle}>
                <Text style={styles.badgeText}>{sanitizePdfText(data.client.name || "MP").slice(0, 2).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.coverTitle}>Relatorio de {sanitizePdfText(data.client.name)}</Text>
            <Text style={styles.coverSub}>Analise de desempenho</Text>
            <Text style={styles.coverMeta}>{introText}</Text>
            <Text style={styles.coverPill}>Gerado em {data.generatedAt}</Text>
          </View>

          <View style={styles.reportCard}>
            <View style={styles.reportCardTop} />
            <View style={styles.reportCardBody}>
              <SocialPresenceCard data={data} />

              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                  <Text style={styles.networkDot}>M</Text>
                  <View>
                    <Text style={styles.sectionTitle}>Meta Ads</Text>
                    <Text style={styles.sectionSub}>{sanitizePdfText(data.client.adAccountLabel) || "Conta Meta conectada"}</Text>
                  </View>
                </View>
                <Text style={styles.headerChip}>Periodo: {data.period.label}</Text>
              </View>

              {metricRows.map((row, rowIndex) => (
                <View key={rowIndex} style={styles.metricsRow}>
                  {row.map((metric, index) => (
                    <View key={metric.label} style={[styles.metricCell, index === row.length - 1 && { borderRightWidth: 0 }]}>
                      <Text style={styles.metricLabel}>{metric.label}</Text>
                      <Text style={styles.metricValue}>{metric.value}</Text>
                      <Text style={styles.metricNote}>{metric.note}</Text>
                    </View>
                  ))}
                </View>
              ))}

              <View style={styles.analysisBox}>
                <Text style={styles.analysisLabel}>Analise</Text>
                <Text style={styles.analysisText}>{data.recommendations || "Sem analise registrada para este periodo."}</Text>
              </View>

              <SummaryTable data={data} />
            </View>
          </View>
        </View>
        <Footer agency={data.branding.agencyName} page={1} />
      </Page>

      <Page size="A4" style={styles.page}>
        <View style={styles.shell}>
          <View style={styles.reportCard}>
            <View style={styles.reportCardTop} />
            <View style={styles.reportCardBody}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                  <Text style={styles.networkDot}>M</Text>
                  <View>
                    <Text style={styles.sectionTitle}>Meta Ads</Text>
                    <Text style={styles.sectionSub}>{sanitizePdfText(data.client.adAccountLabel) || "Conta Meta conectada"}</Text>
                  </View>
                </View>
                <Text style={styles.headerChip}>Resumo do periodo</Text>
              </View>

              <View style={styles.metricsRow}>
                <View style={styles.metricCell}>
                  <Text style={styles.metricLabel}>CTR medio</Text>
                  <Text style={styles.metricValue}>{fmtPct(data.summary.ctr)}</Text>
                  <Text style={styles.metricNote}>Taxa de clique</Text>
                </View>
                <View style={styles.metricCell}>
                  <Text style={styles.metricLabel}>CPC medio</Text>
                  <Text style={styles.metricValue}>{fmtCurrency(data.summary.cpc)}</Text>
                  <Text style={styles.metricNote}>Custo por clique</Text>
                </View>
                <View style={styles.metricCell}>
                  <Text style={styles.metricLabel}>CPM medio</Text>
                  <Text style={styles.metricValue}>{fmtCurrency(data.summary.cpm)}</Text>
                  <Text style={styles.metricNote}>Custo por mil</Text>
                </View>
                <View style={[styles.metricCell, { borderRightWidth: 0 }]}>
                  <Text style={styles.metricLabel}>CPA medio</Text>
                  <Text style={styles.metricValue}>
                    {data.summary.purchases ? fmtCurrency(data.summary.costPerPurchase || 0) : "-"}
                  </Text>
                  <Text style={styles.metricNote}>Custo por compra</Text>
                </View>
              </View>

              <AdsTable data={data} />
            </View>
          </View>
        </View>
        <Footer agency={data.branding.agencyName} page={2} />
      </Page>

      <Page size="A4" style={styles.page}>
        <View style={styles.shell}>
          <View style={styles.reportCard}>
            <View style={styles.reportCardTop} />
            <View style={styles.reportCardBody}>
              <Text style={[styles.sectionTitle, { marginBottom: 10 }]}>Leituras e proximos passos</Text>

              <View style={styles.analysisBox}>
                <Text style={styles.analysisLabel}>Resumo do gestor</Text>
                <Text style={styles.analysisText}>{data.recommendations || "Sem recomendacoes adicionais."}</Text>
              </View>

              <View style={styles.metricsRow}>
                <View style={styles.metricCell}>
                  <Text style={styles.metricLabel}>Campanhas avaliadas</Text>
                  <Text style={styles.metricValue}>{fmtNum(campaigns.length)}</Text>
                  <Text style={styles.metricNote}>Conjunto priorizado</Text>
                </View>
                <View style={styles.metricCell}>
                  <Text style={styles.metricLabel}>Mensagens iniciadas</Text>
                  <Text style={styles.metricValue}>{fmtNum(data.summary.messagesStarted || 0)}</Text>
                  <Text style={styles.metricNote}>Conversas abertas no periodo</Text>
                </View>
                <View style={styles.metricCell}>
                  <Text style={styles.metricLabel}>Anuncios avaliados</Text>
                  <Text style={styles.metricValue}>{fmtNum(ads.length)}</Text>
                  <Text style={styles.metricNote}>Criativos sincronizados</Text>
                </View>
                <View style={[styles.metricCell, { borderRightWidth: 0 }]}>
                  <Text style={styles.metricLabel}>Maior gasto em campanha</Text>
                  <Text style={styles.metricValue}>{campaigns[0] ? fmtCurrency(campaigns[0].spend) : "-"}</Text>
                  <Text style={styles.metricNote}>Maior concentracao de verba</Text>
                </View>
              </View>

              <Text style={styles.blockTitle}>Resumo consolidado</Text>
              <View style={styles.tableWrap}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHeaderCell, styles.colWide]}>Indicador</Text>
                  <Text style={[styles.tableHeaderCell, styles.colMetric]}>Valor</Text>
                </View>
                {consolidatedMetrics.map((metric, index) => (
                  <View key={index} style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}>
                    <Text style={[styles.tableCell, styles.colWide]}>{metric.label}</Text>
                    <Text style={[styles.tableCell, styles.colMetric]}>{metric.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
        <Footer agency={data.branding.agencyName} page={recommendationPage} />
      </Page>
    </Document>
  );
}
