import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { PautaDeConteudo } from "@/lib/niche-insights";

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: "#0f172a", padding: 36, lineHeight: 1.5 },
  faixa: { borderBottomWidth: 3, borderBottomColor: "#10b981", paddingBottom: 10, marginBottom: 18 },
  sobretitulo: { fontSize: 8, color: "#64748b", letterSpacing: 1.5, textTransform: "uppercase" },
  titulo: { fontSize: 22, fontFamily: "Helvetica-Bold", marginTop: 4 },
  subtitulo: { fontSize: 9, color: "#64748b", marginTop: 4 },
  resumo: {
    backgroundColor: "#fff7ed",
    borderLeftWidth: 3,
    borderLeftColor: "#10b981",
    padding: 10,
    marginBottom: 18,
    fontSize: 11,
  },
  secao: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 8 },
  bloco: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 6, padding: 10, marginBottom: 8 },
  blocoTitulo: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  apoio: { fontSize: 9, color: "#475569" },
  etiqueta: { fontSize: 8, color: "#10b981", fontFamily: "Helvetica-Bold", textTransform: "uppercase", marginBottom: 2 },
  campo: { marginTop: 4 },
  campoNome: { fontSize: 8, color: "#64748b", textTransform: "uppercase" },
  linhaTopo: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  proporcao: { fontSize: 8, color: "#64748b" },
  semana: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#10b981",
    marginTop: 10,
    marginBottom: 4,
  },
  item: { flexDirection: "row", marginBottom: 3 },
  marcador: { width: 12, color: "#10b981" },
  ressalva: {
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 8,
    fontSize: 8,
    color: "#64748b",
  },
  rodape: { position: "absolute", bottom: 20, left: 36, right: 36, fontSize: 7, color: "#94a3b8" },
});

interface Props {
  pauta: PautaDeConteudo;
  segmentLabel: string;
  contas: number;
  geradoEm: string;
}

function Lista({ itens }: { itens: string[] }) {
  return (
    <>
      {itens.map((texto, i) => (
        <View key={i} style={styles.item}>
          <Text style={styles.marcador}>•</Text>
          <Text style={{ flex: 1 }}>{texto}</Text>
        </View>
      ))}
    </>
  );
}

export function ContentBriefPdfTemplate({ pauta, segmentLabel, contas, geradoEm }: Props) {
  return (
    <Document title={`Calendario de conteudo — ${segmentLabel}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.faixa}>
          <Text style={styles.sobretitulo}>Calendario de conteudo organico</Text>
          <Text style={styles.titulo}>{segmentLabel}</Text>
          <Text style={styles.subtitulo}>
            Gerado em {geradoEm} · baseado no desempenho de {contas} conta(s) deste nicho
          </Text>
        </View>

        {pauta.resumo ? <Text style={styles.resumo}>{pauta.resumo}</Text> : null}

        {pauta.cadencia ? (
          <View style={styles.bloco} wrap={false}>
            <Text style={styles.campoNome}>Cadencia</Text>
            <Text>{pauta.cadencia}</Text>
          </View>
        ) : null}

        {pauta.pilares?.length ? (
          <>
            <Text style={styles.secao}>Pilares do conteudo</Text>
            {pauta.pilares.map((pilar, i) => (
              <View key={i} style={styles.bloco} wrap={false}>
                <View style={styles.linhaTopo}>
                  <Text style={styles.blocoTitulo}>{pilar.nome}</Text>
                  {pilar.proporcao ? <Text style={styles.proporcao}>{pilar.proporcao}</Text> : null}
                </View>
                {pilar.porque ? <Text style={styles.apoio}>{pilar.porque}</Text> : null}
                {pilar.exemplos?.length ? (
                  <View style={styles.campo}>
                    <Text style={styles.campoNome}>Ideias</Text>
                    <Lista itens={pilar.exemplos} />
                  </View>
                ) : null}
              </View>
            ))}
          </>
        ) : null}

        {pauta.calendario?.length ? (
          <>
            <Text style={styles.secao} break>
              Calendario de 4 semanas
            </Text>
            {/* Agrupado por semana: quem posta pensa em semana, nao em lista
                corrida de 16 posts. */}
            {[...new Set(pauta.calendario.map((p) => p.semana))].sort((a, b) => a - b).map((semana) => (
              <View key={semana} wrap={false}>
                <Text style={styles.semana}>Semana {semana}</Text>
                {pauta.calendario!
                  .filter((p) => p.semana === semana)
                  .map((post, i) => (
                    <View key={i} style={styles.bloco} wrap={false}>
                      <View style={styles.linhaTopo}>
                        <Text style={styles.etiqueta}>
                          {post.dia} · {post.formato}
                        </Text>
                        <Text style={styles.proporcao}>{post.pilar}</Text>
                      </View>
                      <Text style={styles.blocoTitulo}>{post.tema}</Text>
                      {post.gancho ? (
                        <View style={styles.campo}>
                          <Text style={styles.campoNome}>Gancho</Text>
                          <Text>{post.gancho}</Text>
                        </View>
                      ) : null}
                      {post.cta ? (
                        <View style={styles.campo}>
                          <Text style={styles.campoNome}>Chamada</Text>
                          <Text>{post.cta}</Text>
                        </View>
                      ) : null}
                    </View>
                  ))}
              </View>
            ))}
          </>
        ) : null}

        {pauta.evitar?.length ? (
          <>
            <Text style={styles.secao}>O que evitar</Text>
            <Lista itens={pauta.evitar} />
          </>
        ) : null}

        {/* A honestidade da base vai impressa: o dado e de trafego pago, e quem
            ler a pauta meses depois precisa saber disso sem perguntar. */}
        <Text style={styles.ressalva}>
          Como ler: este calendario e de conteudo organico. Ele foi montado a partir do que prende a atencao deste
          publico em anuncios pagos do nicho — o que transfere e o interesse e o formato, nao a metrica nem o texto de
          venda. Nenhum cliente e identificado e nenhum anuncio e reproduzido.
          {pauta.ressalva ? ` ${pauta.ressalva}` : ""}
        </Text>

        <Text style={styles.rodape} fixed>
          Scale Ads · calendario de conteudo por nicho
        </Text>
      </Page>
    </Document>
  );
}
