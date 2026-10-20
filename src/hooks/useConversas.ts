import { useCallback, useEffect, useMemo, useState } from "react";
import { subDays } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/utils";
import { buscarTudo } from "@/lib/buscar-tudo";

export interface MensagemWa {
  id: string;
  company_id: string;
  /** Numero (de qual pessoa da equipe) que recebeu ou enviou. */
  instancia_id: string | null;
  lead_id: string | null;
  chave: string;
  chatid?: string | null;
  telefone: string | null;
  nome_contato: string | null;
  /** Em grupo, quem mandou a mensagem. */
  remetente?: string | null;
  messageid: string | null;
  direcao: string;
  tipo: string | null;
  texto: string | null;
  origem: string;
  status: string | null;
  autor_id: string | null;
  enviada_em: string;
  lida_em: string | null;
}

export interface Conversa {
  /** Numero + contato: o mesmo contato falando com duas pessoas sao duas conversas. */
  id: string;
  instanciaId: string | null;
  chave: string;
  grupo: boolean;
  leadId: string | null;
  nome: string | null;
  telefone: string | null;
  ultima: MensagemWa;
  naoLidas: number;
}

/** A caixa olha 90 dias; a conversa aberta carrega o historico inteiro do contato. */
const DIAS = 90;

export const ehGrupo = (chave: string) => chave.endsWith("@g.us");

export const idDaConversa = (instanciaId: string | null, chave: string) => `${instanciaId ?? "-"}|${chave}`;

/** De quem e cada numero conectado (o ADM ve os da equipe; os demais, so o proprio). */
export interface NumeroWa {
  id: string;
  userId: string;
  nome: string;
  meu: boolean;
}

export function agruparConversas(mensagens: MensagemWa[]): Conversa[] {
  const porChave = new Map<string, Conversa>();
  for (const m of mensagens) {
    const id = idDaConversa(m.instancia_id, m.chave);
    const c = porChave.get(id);
    const naoLida = m.direcao === "entrada" && !m.lida_em ? 1 : 0;
    if (!c) {
      porChave.set(id, {
        id, instanciaId: m.instancia_id, chave: m.chave, grupo: ehGrupo(m.chave), leadId: m.lead_id, nome: m.nome_contato, telefone: m.telefone, ultima: m, naoLidas: naoLida,
      });
      continue;
    }
    c.naoLidas += naoLida;
    c.leadId = c.leadId ?? m.lead_id;
    c.nome = c.nome ?? m.nome_contato;
    c.telefone = c.telefone ?? m.telefone;
    if (m.enviada_em > c.ultima.enviada_em) c.ultima = m;
  }
  return [...porChave.values()].sort((a, b) => (a.ultima.enviada_em < b.ultima.enviada_em ? 1 : -1));
}

export function useConversas(meuId?: string | null) {
  const [mensagens, setMensagens] = useState<MensagemWa[]>([]);
  const [numeros, setNumeros] = useState<NumeroWa[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    try {
      const desde = subDays(new Date(), DIAS).toISOString();
      const [linhas, { data: inst }] = await Promise.all([
        buscarTudo<MensagemWa>((de, ate) =>
          supabase.from("wa_mensagens").select("*").gte("enviada_em", desde).order("enviada_em").range(de, ate)
        ),
        supabase.from("wa_instancias").select("id, user_id"),
      ]);
      const donos = [...new Set((inst ?? []).map(i => i.user_id))];
      const { data: perfis } = donos.length
        ? await supabase.from("profiles").select("id, full_name, email").in("id", donos)
        : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
      setNumeros((inst ?? []).map(i => {
        const p = (perfis ?? []).find(x => x.id === i.user_id);
        return { id: i.id, userId: i.user_id, nome: p?.full_name || p?.email || "Equipe", meu: i.user_id === meuId };
      }));
      setMensagens(linhas);
    } catch (err) {
      toast.error(errorMessage(err, "Não foi possível carregar as conversas"));
    } finally {
      setLoading(false);
    }
  }, [meuId]);

  const juntar = useCallback((m: MensagemWa) => {
    setMensagens(atual => {
      const i = atual.findIndex(x => x.id === m.id);
      if (i === -1) return [...atual, m];
      const copia = [...atual];
      copia[i] = m;
      return copia;
    });
  }, []);

  useEffect(() => {
    carregar();
    // Tempo real: a RLS vale para o canal, entao so chega o que a pessoa ja podia ver.
    const canal = supabase
      .channel("wa_mensagens")
      .on("postgres_changes", { event: "*", schema: "public", table: "wa_mensagens" }, payload => {
        if (payload.new && "id" in payload.new) juntar(payload.new as MensagemWa);
      })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [carregar, juntar]);

  const conversas = useMemo(() => agruparConversas(mensagens), [mensagens]);

  // So o dono do numero zera o contador (a policy de update tambem so deixa ele).
  const marcarLida = useCallback(async (c: Conversa) => {
    if (!c.instanciaId || !numeros.some(n => n.id === c.instanciaId && n.meu)) return;
    const agora = new Date().toISOString();
    setMensagens(atual => atual.map(m => (
      m.chave === c.chave && m.instancia_id === c.instanciaId && m.direcao === "entrada" && !m.lida_em ? { ...m, lida_em: agora } : m
    )));
    await supabase.from("wa_mensagens").update({ lida_em: agora })
      .eq("chave", c.chave).eq("instancia_id", c.instanciaId).eq("direcao", "entrada").is("lida_em", null);
  }, [numeros]);

  return { mensagens, conversas, numeros, loading, juntar, marcarLida, recarregar: carregar };
}

/** Manda pelo wa-enviar e devolve a mensagem gravada. */
export async function enviarWhatsapp(alvo: { leadId?: string | null; chave?: string }, texto: string): Promise<MensagemWa> {
  const { data, error } = await supabase.functions.invoke("wa-enviar", {
    body: { lead_id: alvo.leadId ?? undefined, chave: alvo.leadId ? undefined : alvo.chave, texto },
  });
  if (error) {
    const detalhe = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.().catch(() => null);
    throw new Error(detalhe?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data.mensagem as MensagemWa;
}
