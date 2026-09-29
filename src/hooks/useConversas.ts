import { useCallback, useEffect, useMemo, useState } from "react";
import { subDays } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/utils";
import { buscarTudo } from "@/lib/buscar-tudo";

export interface MensagemWa {
  id: string;
  company_id: string;
  lead_id: string | null;
  chave: string;
  telefone: string | null;
  nome_contato: string | null;
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
  chave: string;
  leadId: string | null;
  nome: string | null;
  telefone: string | null;
  ultima: MensagemWa;
  naoLidas: number;
}

/** A caixa olha 90 dias; a conversa aberta carrega o historico inteiro do contato. */
const DIAS = 90;

export function agruparConversas(mensagens: MensagemWa[]): Conversa[] {
  const porChave = new Map<string, Conversa>();
  for (const m of mensagens) {
    const c = porChave.get(m.chave);
    const naoLida = m.direcao === "entrada" && !m.lida_em ? 1 : 0;
    if (!c) {
      porChave.set(m.chave, {
        chave: m.chave, leadId: m.lead_id, nome: m.nome_contato, telefone: m.telefone, ultima: m, naoLidas: naoLida,
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

export function useConversas() {
  const [mensagens, setMensagens] = useState<MensagemWa[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    try {
      const desde = subDays(new Date(), DIAS).toISOString();
      const linhas = await buscarTudo<MensagemWa>((de, ate) =>
        supabase.from("wa_mensagens").select("*").gte("enviada_em", desde).order("enviada_em").range(de, ate)
      );
      setMensagens(linhas);
    } catch (err) {
      toast.error(errorMessage(err, "Não foi possível carregar as conversas"));
    } finally {
      setLoading(false);
    }
  }, []);

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

  const marcarLida = useCallback(async (chave: string) => {
    const agora = new Date().toISOString();
    setMensagens(atual => atual.map(m => (m.chave === chave && m.direcao === "entrada" && !m.lida_em ? { ...m, lida_em: agora } : m)));
    await supabase.from("wa_mensagens").update({ lida_em: agora }).eq("chave", chave).eq("direcao", "entrada").is("lida_em", null);
  }, []);

  return { mensagens, conversas, loading, juntar, marcarLida, recarregar: carregar };
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
