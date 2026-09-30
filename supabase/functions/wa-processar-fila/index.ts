import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { sendText } from "../_shared/whatsapp.ts";
import { isServiceRole } from "../_shared/auth.ts";
import { atualizar, chaveTelefone, db, inserir, numeroParaEnvio, preencherModelo } from "../_shared/wa-crm.ts";

// Esvazia wa_fila (disparos e sequencias). Chamado pelo pg_cron a cada minuto.
//
// Numero nao oficial que manda rajada e bloqueado, entao cada empresa tem
// intervalo minimo entre envios, teto diario e janela de horario
// (wa_config). Dentro de uma chamada a function espera o intervalo entre um
// envio e outro e para antes de ~50s, para nao encavalar com o proximo minuto.

const ORCAMENTO_MS = 50_000;
const PADRAO = { limite_diario: 150, intervalo_seg: 30, hora_inicio: 8, hora_fim: 20 };

function agoraEmSaoPaulo() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const p = (t: string) => partes.find(x => x.type === t)?.value ?? "00";
  return { dia: `${p("year")}-${p("month")}-${p("day")}`, hora: Number(p("hour")) % 24 };
}

const dormir = (ms: number) => new Promise(r => setTimeout(r, ms));

async function processarEmpresa(companyId: string, inicio: number) {
  const [cfgLinha] = await db<any[]>(`wa_config?company_id=eq.${companyId}&select=*`);
  const cfg = { ...PADRAO, ...(cfgLinha ?? {}) };
  const { dia, hora } = agoraEmSaoPaulo();
  if (hora < cfg.hora_inicio || hora >= cfg.hora_fim) return { empresa: companyId, pulou: "fora do horario" };

  // Meia-noite em Sao Paulo (UTC-3, sem horario de verao desde 2019).
  const inicioDoDia = `${dia}T03:00:00.000Z`;
  const enviadasHoje = await db<any[]>(
    `wa_mensagens?company_id=eq.${companyId}&direcao=eq.saida&origem=in.(disparo,sequencia)&enviada_em=gte.${inicioDoDia}&select=enviada_em&order=enviada_em.desc`
  );
  let restante = cfg.limite_diario - enviadasHoje.length;
  if (restante <= 0) return { empresa: companyId, pulou: "teto diario" };

  let ultimoEnvio = enviadasHoje[0] ? new Date(enviadasHoje[0].enviada_em).getTime() : 0;
  const itens = await db<any[]>(
    `wa_fila?company_id=eq.${companyId}&status=eq.pendente&enviar_apos=lte.${new Date().toISOString()}` +
      `&select=*,crm_leads(id,contato_nome,empresa,cidade,segmento,whatsapp,telefone),wa_disparos(nome,status),wa_inscricoes(status,sequencia_id,wa_sequencias(nome,ativa))` +
      `&order=enviar_apos&limit=${Math.min(restante, 20)}`
  );

  let enviados = 0;
  const erros: string[] = [];
  for (const item of itens) {
    if (Date.now() - inicio > ORCAMENTO_MS || restante <= 0) break;

    // Disparo pausado e sequencia desligada seguram o item na fila sem perder a vez.
    if (item.origem === "disparo" && item.wa_disparos?.status !== "ativo") continue;
    if (item.origem === "sequencia") {
      if (item.wa_inscricoes?.status !== "ativa") {
        await atualizar(`wa_fila?id=eq.${item.id}`, { status: "cancelado", erro: "Inscrição encerrada" });
        continue;
      }
      if (item.wa_inscricoes?.wa_sequencias?.ativa === false) continue;
    }

    const lead = item.crm_leads;
    const numero = numeroParaEnvio(lead?.whatsapp || lead?.telefone);
    if (!numero) {
      await atualizar(`wa_fila?id=eq.${item.id}`, { status: "erro", erro: "Lead sem WhatsApp" });
      continue;
    }

    // Espera o intervalo desde o ultimo envio, com folga aleatoria de ate 20%:
    // cadencia fixa ao segundo tambem denuncia automacao.
    const intervalo = cfg.intervalo_seg * 1000 * (1 + Math.random() * 0.2);
    const espera = ultimoEnvio + intervalo - Date.now();
    if (espera > 0) {
      if (Date.now() - inicio + espera > ORCAMENTO_MS) break;
      await dormir(espera);
    }

    const texto = preencherModelo(item.texto, lead);
    try {
      const enviado = await sendText(numero, texto);
      ultimoEnvio = Date.now();
      restante -= 1;
      enviados += 1;

      // A mensagem ja saiu: falha ao registrar nao pode reenviar nem virar erro do item.
      await inserir("wa_mensagens", {
        company_id: companyId,
        lead_id: lead.id,
        chave: chaveTelefone(numero),
        telefone: numero,
        messageid: enviado?.messageid ?? enviado?.id ?? null,
        direcao: "saida",
        tipo: "text",
        texto,
        origem: item.origem,
        status: enviado?.status ?? "enviada",
        autor_id: item.criado_por,
        fila_id: item.id,
      }, false).catch(err => console.error("wa-processar-fila: registro da mensagem", (err as Error).message));
      await atualizar(`wa_fila?id=eq.${item.id}`, { status: "enviado", enviado_em: new Date().toISOString() });

      const rotulo = item.origem === "disparo"
        ? `Disparo "${item.wa_disparos?.nome ?? ""}"`
        : `Sequência "${item.wa_inscricoes?.wa_sequencias?.nome ?? ""}", mensagem ${item.passo}`;
      await inserir("crm_atividades", {
        lead_id: lead.id, autor_id: item.criado_por, tipo: "mensagem", canal: "whatsapp", descricao: `${rotulo}: ${texto.slice(0, 160)}`,
      }, false);

      if (item.origem === "sequencia") await agendarProximoPasso(item);
    } catch (err) {
      const erro = (err as Error).message;
      erros.push(erro);
      await atualizar(`wa_fila?id=eq.${item.id}`, { status: "erro", erro: erro.slice(0, 300) });
      // Sessao caida: todo envio seguinte falharia igual. Para e tenta no proximo minuto.
      if (/\b(503|401)\b|disconnected|not connected/i.test(erro)) break;
    }
  }

  await encerrarDisparosVazios(companyId);
  return { empresa: companyId, enviados, erros: erros.length };
}

async function agendarProximoPasso(item: any) {
  const inscricao = item.inscricao_id;
  const [proximo] = await db<any[]>(
    `wa_sequencia_passos?sequencia_id=eq.${item.wa_inscricoes.sequencia_id}&ordem=gt.${item.passo}&select=ordem,espera_dias,texto&order=ordem&limit=1`
  );
  if (!proximo) {
    await atualizar(`wa_inscricoes?id=eq.${inscricao}`, { status: "concluida", passo_atual: item.passo });
    return;
  }
  await atualizar(`wa_inscricoes?id=eq.${inscricao}`, { passo_atual: item.passo });
  await inserir("wa_fila", {
    company_id: item.company_id,
    lead_id: item.lead_id,
    texto: proximo.texto,
    origem: "sequencia",
    inscricao_id: inscricao,
    passo: proximo.ordem,
    enviar_apos: new Date(Date.now() + proximo.espera_dias * 86_400_000).toISOString(),
    criado_por: item.criado_por,
  }, false);
}

async function encerrarDisparosVazios(companyId: string) {
  const ativos = await db<any[]>(`wa_disparos?company_id=eq.${companyId}&status=eq.ativo&select=id`);
  for (const d of ativos) {
    const pendentes = await db<any[]>(`wa_fila?disparo_id=eq.${d.id}&status=eq.pendente&select=id&limit=1`);
    if (!pendentes.length) await atualizar(`wa_disparos?id=eq.${d.id}`, { status: "concluido" });
  }
}

serve(async (req) => {
  const segredo = Deno.env.get("CRON_SECRET");
  const doCron = !!segredo && req.headers.get("x-cron-secret") === segredo;
  if (!doCron && !isServiceRole(req)) return new Response(JSON.stringify({ error: "Sem permissão" }), { status: 401 });

  const inicio = Date.now();
  try {
    const devidos = await db<any[]>(
      `wa_fila?status=eq.pendente&enviar_apos=lte.${new Date().toISOString()}&select=company_id&limit=1000`
    );
    const empresas = [...new Set(devidos.map(d => d.company_id))];
    const resultados = [];
    for (const e of empresas) {
      if (Date.now() - inicio > ORCAMENTO_MS) break;
      resultados.push(await processarEmpresa(e, inicio));
    }
    return new Response(JSON.stringify({ ok: true, resultados }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("wa-processar-fila", (err as Error).message);
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), { status: 500 });
  }
});
