import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Pause, Play, Plus, Send, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { errorMessage } from "@/lib/utils";
import { CampoBusca, casaBusca } from "@/components/CampoBusca";
import { SeletorDeLeads, type LeadParaEnvio } from "./SeletorDeLeads";
import { TextoComVariaveis } from "./TextoComVariaveis";
import { type LimitesWa, estimativaDeEnvio } from "@/lib/whatsapp-fila";

interface Disparo { id: string; nome: string; texto: string; status: string; created_at: string; criado_por: string | null }
type Contagem = { pendente: number; enviado: number; erro: number; cancelado: number };

const STATUS: Record<string, { label: string; cor: string }> = {
  ativo: { label: "Enviando", cor: "bg-blue-500/15 text-blue-300" },
  pausado: { label: "Pausado", cor: "bg-amber-500/15 text-amber-300" },
  concluido: { label: "Concluído", cor: "bg-emerald-500/15 text-emerald-300" },
  cancelado: { label: "Cancelado", cor: "bg-muted text-muted-foreground" },
};

export function DisparosTab({ meuId, isAdmin, limites }: { meuId: string | undefined; isAdmin: boolean; limites: LimitesWa }) {
  const [disparos, setDisparos] = useState<Disparo[] | null>(null);
  const [contagens, setContagens] = useState<Map<string, Contagem>>(new Map());
  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState("");
  const [texto, setTexto] = useState("");
  const [inicio, setInicio] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [escolhidos, setEscolhidos] = useState<LeadParaEnvio[]>([]);
  const [criando, setCriando] = useState(false);
  const [busca, setBusca] = useState("");

  async function carregar() {
    const { data } = await supabase.from("wa_disparos").select("id, nome, texto, status, created_at, criado_por").order("created_at", { ascending: false }).limit(50);
    const lista = (data ?? []) as Disparo[];
    setDisparos(lista);
    if (!lista.length) return;
    const { data: fila } = await supabase.from("wa_fila").select("disparo_id, status").in("disparo_id", lista.map(d => d.id));
    const mapa = new Map<string, Contagem>();
    for (const f of (fila ?? []) as { disparo_id: string; status: keyof Contagem }[]) {
      const c = mapa.get(f.disparo_id) ?? { pendente: 0, enviado: 0, erro: 0, cancelado: 0 };
      c[f.status] += 1;
      mapa.set(f.disparo_id, c);
    }
    setContagens(mapa);
  }

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 20_000);
    return () => clearInterval(t);
  }, []);

  async function mudarStatus(d: Disparo, status: "ativo" | "pausado" | "cancelado") {
    const { error } = await supabase.from("wa_disparos").update({ status }).eq("id", d.id);
    if (error) return toast.error(errorMessage(error, "Não foi possível mudar o disparo"));
    if (status === "cancelado") {
      await supabase.from("wa_fila").update({ status: "cancelado" }).eq("disparo_id", d.id).eq("status", "pendente");
    }
    carregar();
  }

  async function criar() {
    if (!nome.trim() || !texto.trim()) return toast.error("Dê um nome e escreva a mensagem");
    if (!ids.length) return toast.error("Escolha pelo menos um lead");
    if (!meuId) return;
    setCriando(true);
    try {
      const { data: d, error } = await supabase.from("wa_disparos")
        .insert({ nome: nome.trim(), texto: texto.trim(), criado_por: meuId }).select("id").single();
      if (error) throw error;
      const enviarApos = inicio ? new Date(inicio).toISOString() : new Date().toISOString();
      for (let i = 0; i < ids.length; i += 500) {
        const { error: e } = await supabase.from("wa_fila").insert(ids.slice(i, i + 500).map(lead_id => ({
          lead_id, texto: texto.trim(), origem: "disparo", disparo_id: d.id, enviar_apos: enviarApos, criado_por: meuId,
        })));
        if (e) throw e;
      }
      toast.success(`Disparo criado: ${ids.length} mensagens na fila`);
      setNovo(false);
      setNome(""); setTexto(""); setInicio(""); setIds([]); setEscolhidos([]);
      carregar();
    } catch (err) {
      toast.error(errorMessage(err, "Não foi possível criar o disparo"));
    } finally {
      setCriando(false);
    }
  }

  const estimativa = estimativaDeEnvio(ids.length, limites);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Mesma mensagem para vários leads, uma a cada {limites.intervalo_seg}s, até {limites.limite_diario} por dia,
          das {limites.hora_inicio}h às {limites.hora_fim}h.
        </p>
        <Button onClick={() => setNovo(true)}><Plus className="mr-1.5 h-4 w-4" /> Disparo</Button>
      </div>

      {disparos && disparos.length > 0 && (
        <CampoBusca value={busca} onChange={setBusca} placeholder="Buscar disparo" className="max-w-sm" />
      )}

      {disparos === null ? (
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <div className="space-y-3">
          {disparos.length > 0 && !disparos.some(d => casaBusca(busca, d.nome, d.texto)) && (
            <p className="col-span-full py-6 text-center text-sm text-muted-foreground">Nenhum disparo encontrado</p>
          )}
          {disparos.filter(d => casaBusca(busca, d.nome, d.texto)).map(d => {
            const c = contagens.get(d.id) ?? { pendente: 0, enviado: 0, erro: 0, cancelado: 0 };
            const total = c.pendente + c.enviado + c.erro + c.cancelado;
            const st = STATUS[d.status] ?? STATUS.ativo;
            const meu = d.criado_por === meuId;
            return (
              <Card key={d.id} className="shadow-card">
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{d.nome}</span>
                    <Badge className={st.cor}>{st.label}</Badge>
                    <span className="text-xs text-muted-foreground">{format(parseISO(d.created_at), "dd/MM HH:mm", { locale: ptBR })}</span>
                    <div className="ml-auto flex gap-1">
                      {d.status === "ativo" && (meu || isAdmin) && <Button size="sm" variant="outline" onClick={() => mudarStatus(d, "pausado")}><Pause className="mr-1 h-3.5 w-3.5" /> Pausar</Button>}
                      {d.status === "pausado" && (meu || isAdmin) && <Button size="sm" variant="outline" onClick={() => mudarStatus(d, "ativo")}><Play className="mr-1 h-3.5 w-3.5" /> Retomar</Button>}
                      {(d.status === "ativo" || d.status === "pausado") && (meu || isAdmin) && (
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => mudarStatus(d, "cancelado")}><X className="mr-1 h-3.5 w-3.5" /> Cancelar</Button>
                      )}
                    </div>
                  </div>
                  <Progress value={total ? ((c.enviado + c.erro + c.cancelado) / total) * 100 : 0} className="h-1.5" />
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span><strong className="text-foreground">{c.enviado}</strong> enviadas</span>
                    <span>{c.pendente} na fila</span>
                    {c.erro > 0 && <span className="text-destructive">{c.erro} com erro</span>}
                    {c.cancelado > 0 && <span>{c.cancelado} canceladas</span>}
                  </div>
                  <p className="line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">{d.texto}</p>
                </CardContent>
              </Card>
            );
          })}
          {disparos.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nenhum disparo ainda.</p>}
        </div>
      )}

      <Dialog open={novo} onOpenChange={setNovo}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo disparo</DialogTitle>
            <DialogDescription>
              Número não oficial: mande para quem já conhece a agência ou deu o contato. Lista fria em massa é o caminho mais rápido para o bloqueio.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Nome</Label>
                <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Convite webinar outubro" />
              </div>
              <div>
                <Label>Começar em</Label>
                <Input type="datetime-local" value={inicio} onChange={e => setInicio(e.target.value)} />
                <p className="mt-1 text-[11px] text-muted-foreground">Vazio = agora</p>
              </div>
            </div>
            <div>
              <Label>Mensagem</Label>
              <TextoComVariaveis valor={texto} onChange={setTexto} exemplo={escolhidos[0] ?? null} />
            </div>
            <div>
              <Label>Para quem</Label>
              <SeletorDeLeads selecionados={ids} onChange={(novos, leads) => { setIds(novos); setEscolhidos(leads); }} meuId={meuId} />
            </div>
            {ids.length > 0 && <p className="rounded-lg bg-muted/40 px-3 py-2 text-sm">{estimativa}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovo(false)}>Cancelar</Button>
            <Button onClick={criar} disabled={criando}>
              {criando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />} Colocar na fila
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
