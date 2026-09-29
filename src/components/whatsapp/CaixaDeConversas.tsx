import { useEffect, useMemo, useState } from "react";
import { format, isToday, parseISO } from "date-fns";
import { Loader2, MessageCircle, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import type { Conversa } from "@/hooks/useConversas";
import { errorMessage } from "@/lib/utils";
import { formatarTelefone } from "@/lib/whatsapp";
import { ChatThread } from "./ChatThread";

interface LeadResumo { id: string; contato_nome: string; empresa: string | null; cidade: string | null; segmento: string | null }

export function CaixaDeConversas({ conversas, loading, onLida, onLeadCriado }: {
  conversas: Conversa[];
  loading: boolean;
  onLida: (chave: string) => void;
  onLeadCriado: () => void;
}) {
  const { user } = useAuth();
  const [aberta, setAberta] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todas" | "nao_lidas" | "sem_lead">("todas");
  const [leads, setLeads] = useState<Map<string, LeadResumo>>(new Map());
  const [criando, setCriando] = useState(false);

  const idsDeLead = useMemo(() => [...new Set(conversas.map(c => c.leadId).filter((x): x is string => !!x))], [conversas]);
  useEffect(() => {
    if (!idsDeLead.length) return;
    supabase.from("crm_leads").select("id, contato_nome, empresa, cidade, segmento").in("id", idsDeLead)
      .then(({ data }) => setLeads(new Map(((data ?? []) as LeadResumo[]).map(l => [l.id, l]))));
  }, [idsDeLead]);

  const nomeDe = (c: Conversa) => {
    const l = c.leadId ? leads.get(c.leadId) : null;
    if (l) return l.empresa ? `${l.empresa} · ${l.contato_nome}` : l.contato_nome;
    return c.nome || formatarTelefone(c.telefone ?? c.chave);
  };

  const visiveis = conversas.filter(c => {
    if (filtro === "nao_lidas" && !c.naoLidas) return false;
    if (filtro === "sem_lead" && c.leadId) return false;
    const termo = busca.trim().toLowerCase();
    if (!termo) return true;
    const digitos = termo.replace(/\D/g, "");
    return nomeDe(c).toLowerCase().includes(termo) || (!!digitos && (c.telefone ?? c.chave).includes(digitos));
  });

  const atual = conversas.find(c => c.chave === aberta) ?? null;
  const leadAtual = atual?.leadId ? leads.get(atual.leadId) ?? null : null;

  function abrir(c: Conversa) {
    setAberta(c.chave);
    if (c.naoLidas) onLida(c.chave);
  }

  // Contato novo que escreveu: vira lead da prospeccao com um clique. O trigger
  // no banco puxa a conversa inteira para o lead recem-criado.
  async function virarLead(c: Conversa) {
    if (!user) return;
    setCriando(true);
    try {
      const { data: funilId, error: e1 } = await supabase.rpc("garantir_funil_prospeccao");
      if (e1) throw e1;
      const { data: etapa } = await supabase.from("crm_etapas").select("id").eq("funil_id", funilId).eq("tipo", "aberta").order("posicao").limit(1).single();
      const { error } = await supabase.from("crm_leads").insert({
        funil_id: funilId as string,
        etapa_id: etapa!.id,
        contato_nome: c.nome || formatarTelefone(c.telefone ?? c.chave),
        whatsapp: c.telefone ?? c.chave,
        canal: "inbound",
        origem: "WhatsApp",
        responsavel_id: user.id,
        created_by: user.id,
        posicao: Date.now(),
      });
      if (error) throw error;
      toast.success("Lead criado e ligado à conversa");
      onLeadCriado();
    } catch (err) {
      toast.error(errorMessage(err, "Não foi possível criar o lead"));
    } finally {
      setCriando(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome ou número" className="pl-9" />
        </div>
        <div className="flex gap-1">
          {([["todas", "Todas"], ["nao_lidas", "Não lidas"], ["sem_lead", "Sem lead"]] as const).map(([id, rotulo]) => (
            <Button key={id} size="sm" variant={filtro === id ? "secondary" : "ghost"} onClick={() => setFiltro(id)}>{rotulo}</Button>
          ))}
        </div>
        <div className="max-h-[560px] space-y-1 overflow-y-auto pr-1">
          {loading ? (
            <Loader2 className="mx-auto mt-8 h-5 w-5 animate-spin text-muted-foreground" />
          ) : visiveis.map(c => {
            const quando = parseISO(c.ultima.enviada_em);
            return (
              <button
                key={c.chave}
                type="button"
                onClick={() => abrir(c)}
                className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                  aberta === c.chave ? "border-primary/40 bg-primary/10" : "border-transparent hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`min-w-0 flex-1 truncate text-sm ${c.naoLidas ? "font-semibold" : "font-medium"}`}>{nomeDe(c)}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{format(quando, isToday(quando) ? "HH:mm" : "dd/MM")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {c.ultima.direcao === "saida" ? "Você: " : ""}{c.ultima.texto}
                  </span>
                  {!c.leadId && <Badge variant="outline" className="shrink-0 text-[9px]">sem lead</Badge>}
                  {c.naoLidas > 0 && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{c.naoLidas}</span>}
                </div>
              </button>
            );
          })}
          {!loading && visiveis.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {conversas.length ? "Nada nesse filtro." : "Nenhuma conversa ainda. Ligue a caixa na aba Configuração."}
            </p>
          )}
        </div>
      </div>

      <div>
        {atual ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{nomeDe(atual)}</span>
              <span className="text-xs text-muted-foreground">{formatarTelefone(atual.telefone ?? atual.chave)}</span>
              {!atual.leadId && (
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => virarLead(atual)} disabled={criando}>
                  {criando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <UserPlus className="mr-1.5 h-4 w-4" />} Virar lead
                </Button>
              )}
            </div>
            <ChatThread chave={atual.chave} leadId={atual.leadId} lead={leadAtual} altura="h-[520px]" />
          </div>
        ) : (
          <div className="flex h-[560px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground">
            <MessageCircle className="h-8 w-8" /> Escolha uma conversa
          </div>
        )}
      </div>
    </div>
  );
}
