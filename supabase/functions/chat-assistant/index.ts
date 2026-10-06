import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUser, jsonResponse, ownsClient } from "../_shared/auth.ts";
import { avaliarMeta, type MetricaDiaria, resultadosDoDia } from "../_shared/metas.ts";
import { limiteDeTokens, provedorLLM } from "../_shared/llm.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Message {
  role: "user" | "assistant";
  content: string;
}

type Ler = (tabela: string, qs: Record<string, string>, limite?: number) => Promise<any[]>;

// O contexto e lido com o JWT de quem pergunta, nao com service role: a RLS
// ja decide carteira, demandas, funis e financeiro por papel. Com service role
// o gestor recebia no chat a carteira inteira da empresa e o SDR, o financeiro.
function leitorDoUsuario(authorization: string): Ler {
  const base = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  return async (tabela, qs, limite = 1000) => {
    const url = new URL(`${base}/rest/v1/${tabela}`);
    Object.entries(qs).forEach(([k, v]) => url.searchParams.set(k, v));
    const linhas: any[] = [];
    // O PostgREST corta em 1000 linhas por resposta, e a metrica diaria da carteira passa disso.
    for (let de = 0; de < limite; de += 1000) {
      const ate = Math.min(de + 1000, limite) - 1;
      const res = await fetch(url, {
        headers: { apikey: anon, Authorization: authorization, Accept: "application/json", Range: `${de}-${ate}`, "Range-Unit": "items" },
      });
      if (res.status === 416) break;
      if (!res.ok) throw new Error(`${tabela}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      const pagina = await res.json();
      linhas.push(...pagina);
      if (pagina.length < ate - de + 1) break;
    }
    return linhas;
  };
}

// Uma secao que falha (tabela renomeada, coluna nova) nao pode derrubar o chat inteiro.
async function seguro(p: Promise<any[]>, secao: string): Promise<any[]> {
  try {
    return await p;
  } catch (err) {
    console.warn("chat-assistant contexto", secao, (err as Error).message);
    return [];
  }
}

const brl = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `R$${Number(v).toFixed(2)}`);

function hojeEmSP() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

function isoMenos(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

function variacao(atual: number, anterior: number) {
  if (anterior <= 0) return atual > 0 ? "novo" : "=";
  const v = ((atual - anterior) / anterior) * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`;
}

function somar(linhas: MetricaDiaria[]) {
  const gasto = linhas.reduce((s, d) => s + (Number(d.spend) || 0), 0);
  const resultados = linhas.reduce((s, d) => s + resultadosDoDia(d), 0);
  return { gasto, resultados, cpr: resultados > 0 ? gasto / resultados : null };
}

/** Ultimos 7 dias contra os 7 anteriores: e o que responde "aumentou o CPA?". */
function semanaContraAnterior(linhas: MetricaDiaria[], hoje: string) {
  const s = somar(linhas.filter(d => d.date > isoMenos(hoje, 7) && d.date <= hoje));
  const a = somar(linhas.filter(d => d.date > isoMenos(hoje, 14) && d.date <= isoMenos(hoje, 7)));
  return `7d: gasto ${brl(s.gasto)} (${variacao(s.gasto, a.gasto)}) | resultados ${s.resultados} (${variacao(s.resultados, a.resultados)}) | custo/resultado ${brl(s.cpr)} (antes ${brl(a.cpr)})`;
}

function linhaMeta(c: any, linhas: MetricaDiaria[], hoje: string) {
  const alvos = { alvo_resultados_mes: c.alvo_resultados_mes ?? null, alvo_custo_resultado: c.alvo_custo_resultado ?? null };
  const a = avaliarMeta(alvos, linhas, hoje);
  const mes = `Mês: gasto ${brl(a.gasto)}, ${a.resultados} resultados, custo/resultado ${brl(a.custoPorResultado)}`;
  if (a.situacao === "sem_meta") return `${mes} | sem meta definida`;
  const partes = [];
  if (a.alvoResultados) partes.push(`meta ${a.alvoResultados} resultados, projeção ${a.projecao}`);
  if (a.alvoCusto) partes.push(`custo alvo até ${brl(a.alvoCusto)}`);
  const situacao = { cedo: "início do mês, ainda sem julgamento", no_ritmo: "NO RITMO", abaixo: "ABAIXO DA META" }[a.situacao];
  const motivo = [a.resultadosAbaixo && "volume abaixo", a.custoAcima && "custo acima"].filter(Boolean).join(" e ");
  return `${mes} | ${partes.join(", ")} | ${situacao}${motivo ? ` (${motivo})` : ""}`;
}

function porCliente<T extends { client_id?: string | null }>(linhas: T[]) {
  const m = new Map<string, T[]>();
  for (const l of linhas) {
    if (!l.client_id) continue;
    const lista = m.get(l.client_id) ?? [];
    lista.push(l);
    m.set(l.client_id, lista);
  }
  return m;
}

function nomeDe(perfis: Map<string, string>, id: string | null | undefined) {
  return id ? perfis.get(id) ?? "alguém da equipe" : "sem responsável";
}

function resumoDemandas(tarefas: any[], perfis: Map<string, string>, nomes: Map<string, string>, hoje: string) {
  if (!tarefas.length) return "  Nenhuma demanda aberta visível";
  const extra = tarefas.length > 40 ? `\n  +${tarefas.length - 40} demandas abertas não listadas` : "";
  return tarefas.slice(0, 40).map(t => {
    const atrasada = t.prazo && t.prazo < hoje ? " ATRASADA" : "";
    const cliente = t.client_id ? nomes.get(t.client_id) ?? "cliente" : "interno";
    return `- ${t.titulo} | ${cliente} | ${t.status} | prioridade ${t.prioridade ?? "—"} | prazo ${t.prazo ?? "sem prazo"}${atrasada} | com ${nomeDe(perfis, t.assigned_to)}`;
  }).join("\n") + extra;
}

function resumoComercial(leads: any[], perfis: Map<string, string>, hoje: string) {
  if (!leads.length) return "  Nenhum lead visível";
  const mes = hoje.slice(0, 7);
  const abertos = leads.filter(l => (l.etapa?.tipo ?? "aberta") === "aberta");
  const ganhosMes = leads.filter(l => l.ganho_em?.slice(0, 7) === mes).length;
  const perdidosMes = leads.filter(l => l.perdido_em?.slice(0, 7) === mes);

  const porEtapa = new Map<string, number>();
  for (const l of abertos) {
    const chave = `${l.funil?.nome ?? "Funil"} > ${l.etapa?.nome ?? "?"}`;
    porEtapa.set(chave, (porEtapa.get(chave) ?? 0) + 1);
  }
  const agora = new Date().toISOString();
  const emSeteDias = new Date(Date.now() + 7 * 86400000).toISOString();
  const reunioes = abertos.filter(l => l.reuniao_em && l.reuniao_em >= agora && l.reuniao_em <= emSeteDias)
    .sort((a, b) => a.reuniao_em.localeCompare(b.reuniao_em));
  const followUpVencido = new Map<string, number>();
  for (const l of abertos) {
    if (l.proximo_contato_em && l.proximo_contato_em < agora) {
      const quem = nomeDe(perfis, l.responsavel_id);
      followUpVencido.set(quem, (followUpVencido.get(quem) ?? 0) + 1);
    }
  }
  const motivos = new Map<string, number>();
  for (const l of perdidosMes) {
    const m = (l.motivo_perda ?? "sem motivo").trim() || "sem motivo";
    motivos.set(m, (motivos.get(m) ?? 0) + 1);
  }

  return [
    `Leads abertos: ${abertos.length} | ganhos no mês: ${ganhosMes} | perdidos no mês: ${perdidosMes.length}`,
    `Por etapa: ${[...porEtapa.entries()].map(([k, n]) => `${k}: ${n}`).join("; ") || "—"}`,
    `Reuniões nos próximos 7 dias: ${reunioes.slice(0, 15).map(l => `${l.empresa || l.contato_nome} em ${l.reuniao_em.slice(0, 16).replace("T", " ")} (${nomeDe(perfis, l.closer_id ?? l.responsavel_id)})`).join("; ") || "nenhuma"}`,
    `Follow-ups vencidos por responsável: ${[...followUpVencido.entries()].map(([k, n]) => `${k}: ${n}`).join("; ") || "nenhum"}`,
    `Motivos de perda no mês: ${[...motivos.entries()].map(([k, n]) => `${k} (${n})`).join("; ") || "—"}`,
  ].join("\n");
}

function resumoFinanceiro(faturas: any[], nomes: Map<string, string>, hoje: string) {
  if (!faturas.length) return "  Nenhuma fatura em aberto visível (ou o usuário não tem acesso ao financeiro)";
  return faturas.slice(0, 40).map(f => {
    const vencida = f.status === "vencida" || f.due_date < hoje;
    return `- ${nomes.get(f.client_id) ?? "cliente"} | ${brl(f.amount)} | vence ${f.due_date}${vencida ? " VENCIDA" : ""}`;
  }).join("\n");
}

const LEADS_SELECT = "empresa,contato_nome,responsavel_id,closer_id,reuniao_em,proximo_contato_em,valor_estimado,origem,ganho_em,perdido_em,motivo_perda,client_id,etapa:crm_etapas(nome,tipo),funil:crm_funis(nome)";
const METRICAS_SELECT = "client_id,date,spend,messages,calls,directions,leads";

async function contextoDoCliente(ler: Ler, clientId: string, hoje: string): Promise<string> {
  const desde = [`${hoje.slice(0, 7)}-01`, isoMenos(hoje, 29)].sort()[0];
  const noCliente = { client_id: `eq.${clientId}` };

  const [clientes, metricas, campanhas, anuncios, auditorias, tarefas, leads, faturas, relatorios, alertas, perfis] = await Promise.all([
    seguro(ler("clients", {
      select: "id,name,status,city,state,business_segment,primary_goal,meta_sync_status,meta_balance_cents,alvo_resultados_mes,alvo_custo_resultado",
      id: `eq.${clientId}`,
    }, 1), "cliente"),
    seguro(ler("campaign_daily_metrics", { ...noCliente, select: METRICAS_SELECT, date: `gte.${desde}`, order: "date.asc" }, 5000), "metricas"),
    seguro(ler("campaigns", { ...noCliente, select: "name,status,objective,spend,impressions,clicks,ctr,cpc,messages,conversions", order: "spend.desc" }, 15), "campanhas"),
    seguro(ler("ads", {
      select: "name,status,spend,impressions,clicks,messages,ad_sets!inner(campaigns!inner(client_id))",
      "ad_sets.campaigns.client_id": `eq.${clientId}`,
      order: "spend.desc",
    }, 12), "anuncios"),
    seguro(ler("audit_runs", { ...noCliente, select: "score,results,created_at", order: "created_at.desc" }, 1), "auditoria"),
    seguro(ler("tasks", { ...noCliente, select: "titulo,status,prioridade,prazo,client_id,assigned_to", status: "neq.concluida", order: "prazo.asc.nullslast" }, 40), "demandas"),
    seguro(ler("crm_leads", { ...noCliente, select: LEADS_SELECT }, 2000), "crm"),
    seguro(ler("invoices", { ...noCliente, select: "client_id,due_date,amount,status,paid_at", status: "neq.cancelada", order: "due_date.desc" }, 6), "financeiro"),
    seguro(ler("reports", { ...noCliente, select: "name,created_at,status", order: "created_at.desc" }, 5), "relatorios"),
    seguro(ler("alert_events", {
      select: "triggered_at,metric_value,alerts!inner(name,client_id)",
      "alerts.client_id": `eq.${clientId}`,
      status: "eq.open",
      order: "triggered_at.desc",
    }, 10), "alertas"),
    seguro(ler("profiles", { select: "id,full_name,email" }, 500), "perfis"),
  ]);

  const c = clientes[0];
  if (!c) return "=== CLIENTE ===\nCliente não encontrado ou fora da carteira de quem pergunta.";

  const nomesPerfis = new Map(perfis.map((p: any) => [p.id, p.full_name || p.email || "—"]));
  const nomes = new Map([[c.id, c.name]]);
  const audit = auditorias[0];
  const peso: Record<string, number> = { critical: 3, warning: 2, info: 1 };
  const problemas = audit
    ? ((audit.results ?? []) as any[])
        .filter(r => r.status === "fail" || r.status === "warn")
        .sort((a, b) => (peso[b.severity] ?? 0) - (peso[a.severity] ?? 0))
        .slice(0, 5)
        .map(r => `  - [${r.severity}] ${r.name}: ${r.message}`)
        .join("\n")
    : "  Nenhuma auditoria";

  const ultimos14 = metricas.filter((d: any) => d.date > isoMenos(hoje, 14));

  return `=== CLIENTE ===
${c.name} [${c.status}] | Segmento: ${c.business_segment ?? "—"} | Objetivo: ${c.primary_goal ?? "—"} | ${c.city ?? "—"}/${c.state ?? "—"} | Conexão Meta: ${c.meta_sync_status ?? "—"} | Saldo Meta: ${c.meta_balance_cents !== null ? brl(c.meta_balance_cents / 100) : "—"}

=== META E RITMO ===
${linhaMeta(c, metricas, hoje)}
${semanaContraAnterior(metricas, hoje)}

=== DIA A DIA (14 dias) ===
${ultimos14.map((d: any) => `${d.date}: gasto ${brl(d.spend)}, resultados ${resultadosDoDia(d)}`).join("\n") || "  Sem entrega no período"}

=== CAMPANHAS (por gasto) ===
${campanhas.map(k => `- ${k.name} [${k.status}] | ${k.objective ?? "—"} | gasto ${brl(k.spend)} | CTR ${Number(k.ctr ?? 0).toFixed(2)}% | CPC ${brl(k.cpc)} | mensagens ${k.messages ?? 0} | conversões ${k.conversions ?? 0}`).join("\n") || "  Sem campanhas"}

=== CRIATIVOS / ANÚNCIOS (por gasto) ===
${anuncios.map(a => {
  const ctr = a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0;
  return `- ${a.name} [${a.status}] | gasto ${brl(a.spend)} | CTR ${ctr.toFixed(2)}% | cliques ${a.clicks ?? 0} | mensagens ${a.messages ?? 0}`;
}).join("\n") || "  Sem anúncios sincronizados"}

=== AUDITORIA ===
Score: ${audit?.score ?? "—"}/100${audit ? ` (em ${String(audit.created_at).slice(0, 10)})` : ""}
${problemas}

=== DEMANDAS ABERTAS DO CLIENTE ===
${resumoDemandas(tarefas, nomesPerfis, nomes, hoje)}

=== COMERCIAL (funil de vendas do cliente) ===
${resumoComercial(leads, nomesPerfis, hoje)}

=== FINANCEIRO (últimas faturas) ===
${faturas.map(f => `- ${f.due_date} | ${brl(f.amount)} | ${f.status}${f.paid_at ? ` (pago em ${String(f.paid_at).slice(0, 10)})` : ""}`).join("\n") || "  Nenhuma fatura visível"}

=== RELATÓRIOS ===
${relatorios.map(r => `- ${r.name} (${String(r.created_at).slice(0, 10)}, ${r.status})`).join("\n") || "  Nenhum relatório gerado"}

=== ALERTAS ABERTOS ===
${alertas.map(a => `- ${a.alerts?.name ?? "Alerta"} em ${String(a.triggered_at).slice(0, 10)} (valor ${a.metric_value ?? "—"})`).join("\n") || "  Nenhum"}`;
}

async function contextoGeral(ler: Ler, hoje: string): Promise<string> {
  const desde = [`${hoje.slice(0, 7)}-01`, isoMenos(hoje, 13)].sort()[0];

  const [clientes, metricas, campanhas, tarefas, leads, faturas, relatorios, alertas, perfis] = await Promise.all([
    seguro(ler("clients", {
      select: "id,name,status,business_segment,meta_sync_status,meta_balance_cents,alvo_resultados_mes,alvo_custo_resultado",
      status: "neq.archived",
      order: "name.asc",
    }, 500), "clientes"),
    seguro(ler("campaign_daily_metrics", { select: METRICAS_SELECT, date: `gte.${desde}`, order: "date.asc" }, 30000), "metricas"),
    seguro(ler("campaigns", { select: "name,status,spend,ctr,cpc,messages,client_id", order: "spend.desc" }, 20), "campanhas"),
    seguro(ler("tasks", { select: "titulo,status,prioridade,prazo,client_id,assigned_to", status: "neq.concluida", order: "prazo.asc.nullslast" }, 200), "demandas"),
    seguro(ler("crm_leads", { select: LEADS_SELECT }, 5000), "crm"),
    seguro(ler("invoices", { select: "client_id,due_date,amount,status", status: "in.(aberta,vencida)", order: "due_date.asc" }, 200), "financeiro"),
    seguro(ler("reports", { select: "client_id,created_at", created_at: `gte.${isoMenos(hoje, 30)}`, order: "created_at.desc" }, 2000), "relatorios"),
    seguro(ler("alert_events", { select: "triggered_at,alerts(name,client_id)", status: "eq.open", order: "triggered_at.desc" }, 30), "alertas"),
    seguro(ler("profiles", { select: "id,full_name,email" }, 500), "perfis"),
  ]);

  if (!clientes.length && !leads.length && !tarefas.length) {
    return "=== VISÃO GERAL ===\nNenhum dado visível para este usuário (sem carteira, demandas ou leads).";
  }

  const nomes = new Map(clientes.map((c: any) => [c.id, c.name]));
  const nomesPerfis = new Map(perfis.map((p: any) => [p.id, p.full_name || p.email || "—"]));
  const metricasPor = porCliente(metricas);
  const ultimoRelatorio = new Map<string, string>();
  for (const r of relatorios) if (r.client_id && !ultimoRelatorio.has(r.client_id)) ultimoRelatorio.set(r.client_id, String(r.created_at).slice(0, 10));

  const ativos = clientes.filter((c: any) => c.status === "active");
  // Cliente parado e sem meta nao tem o que analisar: vai numa linha so, para
  // o contexto nao estourar o limite de tokens da Groq com carteira grande.
  const temAssunto = (c: any) => (metricasPor.get(c.id) ?? []).some((d: any) => Number(d.spend) > 0) || c.alvo_resultados_mes || c.alvo_custo_resultado;
  const parados = clientes.filter((c: any) => !temAssunto(c)).map((c: any) => c.name);
  const linhasClientes = clientes.filter(temAssunto).map((c: any) => {
    const linhas = metricasPor.get(c.id) ?? [];
    const saldo = c.meta_balance_cents !== null ? ` | saldo Meta ${brl(c.meta_balance_cents / 100)}` : "";
    const relatorio = ultimoRelatorio.get(c.id) ?? "nenhum em 30 dias";
    return `## ${c.name} [${c.status}] | Meta: ${c.meta_sync_status ?? "—"}${saldo} | último relatório: ${relatorio}
${linhaMeta(c, linhas, hoje)}
${semanaContraAnterior(linhas, hoje)}`;
  });

  const investidoMes = somar(metricas.filter((d: any) => d.date.slice(0, 7) === hoje.slice(0, 7)));

  return `=== VISÃO GERAL (${hoje}) ===
Clientes na carteira visível: ${clientes.length} (${ativos.length} ativos) | Investido no mês: ${brl(investidoMes.gasto)} | Resultados no mês: ${investidoMes.resultados}

=== CLIENTES: META, MÊS E ÚLTIMOS 7 DIAS VS 7 ANTERIORES ===
${linhasClientes.join("\n\n") || "  Nenhum cliente com entrega ou meta"}
${parados.length ? `\nSem entrega nos últimos 14 dias e sem meta: ${parados.join(", ")}` : ""}

=== TOP CAMPANHAS (por gasto) ===
${campanhas.map(k => `- ${k.name} [${k.status}] | ${nomes.get(k.client_id) ?? "—"} | gasto ${brl(k.spend)} | CTR ${Number(k.ctr ?? 0).toFixed(2)}% | CPC ${brl(k.cpc)} | mensagens ${k.messages ?? 0}`).join("\n") || "  Nenhuma"}

=== DEMANDAS ABERTAS (por prazo) ===
${resumoDemandas(tarefas, nomesPerfis, nomes, hoje)}

=== COMERCIAL / CRM ===
${resumoComercial(leads, nomesPerfis, hoje)}

=== FINANCEIRO (faturas em aberto) ===
${resumoFinanceiro(faturas, nomes, hoje)}

=== ALERTAS DE CAMPANHA ABERTOS ===
${alertas.map(a => `- ${a.alerts?.name ?? "Alerta"} | ${nomes.get(a.alerts?.client_id) ?? "—"} | ${String(a.triggered_at).slice(0, 10)}`).join("\n") || "  Nenhum"}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { messages, clientId } = await req.json() as {
      messages: Message[];
      clientId?: string;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new Error("messages é obrigatório");
    }

    const user = await getUser(req);
    if (!user) return jsonResponse(cors, { error: "Não autenticado" }, 401);

    if (clientId && !(await ownsClient(user.id, clientId))) {
      return jsonResponse(cors, { error: "Cliente não encontrado na sua carteira" }, 404);
    }

    const ler = leitorDoUsuario(req.headers.get("Authorization") ?? "");
    const hoje = hojeEmSP();
    const context = clientId ? await contextoDoCliente(ler, clientId, hoje) : await contextoGeral(ler, hoje);

    const systemPrompt = `Você é o Cérebro da agência Midsam Business: assistente estratégico e operacional de uma agência de tráfego pago. Hoje é ${hoje}.

Você enxerga os dados reais da operação: campanhas Meta Ads, metas dos clientes, criativos, demandas da equipe, CRM comercial, financeiro, relatórios e alertas. Os dados abaixo já respeitam as permissões de quem pergunta: se uma seção vier vazia, pode ser falta de acesso — não invente.

Definições:
- Resultado = mensagens iniciadas + ligações + rotas + leads. Custo por resultado = gasto / resultados.
- "Projeção" é o volume de resultados no fim do mês mantido o ritmo atual. "ABAIXO DA META" já considera 10% de folga.
- "7d" compara os últimos 7 dias com os 7 anteriores.

DADOS:
${context}

Como responder:
- Português brasileiro, direto, com números concretos dos dados acima.
- Priorize o que muda a ação do gestor: clientes abaixo da meta, custo subindo, saldo acabando, demandas atrasadas, follow-ups vencidos, faturas vencidas.
- Para "o que precisa ser acompanhado", monte uma lista priorizada com o motivo e a próxima ação de cada item.
- Para resumo semanal, use: Resultados, Destaques, Pontos de atenção e Próximos passos.
- Se a pergunta pedir algo que não está nos dados, diga que não tem essa informação.
- Use markdown (negrito, listas, tabelas curtas) em respostas longas.`;

    const ia = provedorLLM();
    const response = await fetch(ia.url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ia.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ia.model,
        ...limiteDeTokens(ia, 4096),
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`${ia.nome} API error: ${err.error?.message ?? response.statusText}`);
    }

    const data = await response.json();
    const reply = data.choices[0].message.content as string;
    const tokens = {
      input: data.usage?.prompt_tokens ?? 0,
      output: data.usage?.completion_tokens ?? 0,
    };

    return new Response(
      JSON.stringify({ success: true, reply, tokens, cost_usd: "0.000000" }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("chat-assistant error:", err);
    const message = (err as any)?.message ?? String(err);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
