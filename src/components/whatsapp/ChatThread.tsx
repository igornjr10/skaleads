import { useEffect, useRef, useState } from "react";
import { format, isSameDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, CheckCheck, FileText, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { enviarWhatsapp, type MensagemWa } from "@/hooks/useConversas";
import { type DadosDoLead, preencherModelo } from "@/lib/whatsapp";
import { ehMarcadorDeMidia, tipoDeMidia } from "@/lib/whatsapp-midia";
import { MidiaWa } from "./MidiaWa";

const ORIGEM: Record<string, string> = {
  disparo: "disparo",
  sequencia: "sequência",
  celular: "pelo celular",
};

/**
 * Historico de um contato e caixa de resposta. Carrega sozinho pela chave e
 * escuta o tempo real so daquela conversa. Abrir marca as recebidas como lidas.
 */
export function ChatThread({ chave, leadId, lead, onEnviada, altura = "h-[420px]" }: {
  chave: string;
  leadId?: string | null;
  lead?: DadosDoLead | null;
  onEnviada?: (m: MensagemWa) => void;
  altura?: string;
}) {
  const [mensagens, setMensagens] = useState<MensagemWa[] | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [modelos, setModelos] = useState<{ id: string; nome: string; texto: string }[]>([]);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMensagens(null);
    setTexto("");
    supabase.from("wa_mensagens").select("*").eq("chave", chave).order("enviada_em")
      .then(({ data }) => setMensagens((data ?? []) as MensagemWa[]));
    supabase.from("wa_mensagens").update({ lida_em: new Date().toISOString() })
      .eq("chave", chave).eq("direcao", "entrada").is("lida_em", null).then(() => undefined);

    const canal = supabase
      .channel(`wa_conversa_${chave}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wa_mensagens", filter: `chave=eq.${chave}` }, payload => {
        const m = payload.new as MensagemWa;
        if (!m?.id) return;
        setMensagens(atual => {
          if (!atual) return atual;
          const i = atual.findIndex(x => x.id === m.id);
          if (i === -1) return [...atual, m];
          const copia = [...atual];
          copia[i] = m;
          return copia;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [chave]);

  useEffect(() => {
    supabase.from("wa_modelos").select("id, nome, texto").order("nome")
      .then(({ data }) => setModelos((data ?? []) as { id: string; nome: string; texto: string }[]));
  }, []);

  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [mensagens?.length]);

  async function enviar() {
    const conteudo = texto.trim();
    if (!conteudo || enviando) return;
    setEnviando(true);
    try {
      const m = await enviarWhatsapp({ leadId, chave }, conteudo);
      setTexto("");
      setMensagens(atual => (atual && !atual.some(x => x.id === m.id) ? [...atual, m] : atual));
      onEnviada?.(m);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível enviar");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className={`${altura} overflow-y-auto rounded-xl border border-border/60 bg-background/40 p-3`}>
        {mensagens === null ? (
          <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : mensagens.length === 0 ? (
          <p className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            Nenhuma mensagem com este contato ainda.
          </p>
        ) : (
          <div className="space-y-1.5">
            {mensagens.map((m, i) => {
              const dia = parseISO(m.enviada_em);
              const novoDia = i === 0 || !isSameDay(parseISO(mensagens[i - 1].enviada_em), dia);
              const minha = m.direcao === "saida";
              const midia = m.messageid ? tipoDeMidia(m.tipo) : null;
              return (
                <div key={m.id}>
                  {novoDia && (
                    <div className="my-2 text-center text-[11px] text-muted-foreground">
                      {format(dia, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                    </div>
                  )}
                  <div className={`flex ${minha ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      minha ? "rounded-br-md bg-primary/15 text-foreground" : "rounded-bl-md bg-muted"
                    }`}>
                      {!minha && m.remetente && (
                        <p className="mb-0.5 text-[11px] font-semibold text-primary">{m.remetente}</p>
                      )}
                      {midia && <MidiaWa mensagemId={m.id} tipo={midia} />}
                      {!(midia && ehMarcadorDeMidia(m.texto)) && (
                        <p className={`whitespace-pre-wrap break-words ${midia ? "mt-1" : ""}`}>{m.texto}</p>
                      )}
                      <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                        {ORIGEM[m.origem] && <span>{ORIGEM[m.origem]} ·</span>}
                        {format(dia, "HH:mm")}
                        {minha && (/read|lida|played/i.test(m.status ?? "")
                          ? <CheckCheck className="h-3 w-3 text-sky-400" />
                          : /deliver|entreg/i.test(m.status ?? "") ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={fim} />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          rows={2}
          placeholder="Escreva a mensagem (Enter envia, Shift+Enter quebra linha)"
          className="flex-1"
        />
        <div className="flex gap-2 sm:flex-col">
          {modelos.length > 0 && (
            <Select value="" onValueChange={id => {
              const mod = modelos.find(x => x.id === id);
              if (mod) setTexto(lead ? preencherModelo(mod.texto, lead) : mod.texto);
            }}>
              <SelectTrigger className="w-full sm:w-36"><FileText className="mr-1.5 h-4 w-4" /><SelectValue placeholder="Modelo" /></SelectTrigger>
              <SelectContent>{modelos.map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Button onClick={enviar} disabled={!texto.trim() || enviando} className="sm:w-36">
            {enviando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />} Enviar
          </Button>
        </div>
      </div>
    </div>
  );
}
