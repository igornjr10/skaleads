import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CheckCircle2, Lightbulb, Loader2, Megaphone, MessageSquareWarning, Plus, RotateCcw, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import type { ClienteResumo } from "@/hooks/useDemandas";
import { veTodosOsClientes } from "@/lib/permissoes";
import { errorMessage } from "@/lib/utils";

const TIPOS_MURAL = [
  { id: "alerta", label: "Alerta", icon: AlertTriangle, cor: "text-amber-500 bg-amber-500/10 ring-amber-500/20" },
  { id: "problema", label: "Problema", icon: MessageSquareWarning, cor: "text-red-500 bg-red-500/10 ring-red-500/20" },
  { id: "ideia", label: "Ideia", icon: Lightbulb, cor: "text-violet-500 bg-violet-500/10 ring-violet-500/20" },
  { id: "aviso", label: "Aviso interno", icon: Megaphone, cor: "text-sky-500 bg-sky-500/10 ring-sky-500/20" },
  { id: "gestao", label: "Para a gestão", icon: ShieldAlert, cor: "text-primary bg-primary/10 ring-primary/20" },
] as const;

interface ItemMural {
  id: string;
  tipo: string;
  titulo: string;
  texto: string | null;
  client_id: string | null;
  autor_id: string | null;
  resolvido_at: string | null;
  resolvido_por: string | null;
  created_at: string;
}

const SEM = "sem";

export function MuralEquipe({ nomeDe, clientes, clientePorId }: {
  nomeDe: (id: string | null) => string;
  clientes: ClienteResumo[];
  clientePorId: Map<string, ClienteResumo>;
}) {
  const { user, role } = useAuth();
  const isAdmin = veTodosOsClientes(role);
  const [itens, setItens] = useState<ItemMural[] | null>(null);
  const [verResolvidos, setVerResolvidos] = useState(false);
  const [filtro, setFiltro] = useState<string>("todos");
  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState({ tipo: "alerta", titulo: "", texto: "", client_id: SEM });
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    let q = supabase.from("mural_itens").select("*").order("created_at", { ascending: false }).limit(60);
    if (!verResolvidos) q = q.is("resolvido_at", null);
    const { data, error } = await q;
    // Sem a migration o mural so fica vazio; o resto da Visao segue de pe.
    if (error) return setItens([]);
    setItens(data as ItemMural[]);
  }, [verResolvidos]);

  useEffect(() => {
    carregar();
    const canal = supabase
      .channel(`mural-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mural_itens" }, () => carregar())
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [carregar]);

  async function publicar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titulo.trim()) return toast.error("Escreva o assunto");
    if (!user) return;
    setSalvando(true);
    const { error } = await supabase.from("mural_itens").insert({
      tipo: form.tipo,
      titulo: form.titulo.trim(),
      texto: form.texto.trim() || null,
      client_id: form.client_id === SEM ? null : form.client_id,
      autor_id: user.id,
    });
    setSalvando(false);
    if (error) return toast.error(errorMessage(error, "Não foi possível publicar no mural"));
    setCriando(false);
    setForm({ tipo: "alerta", titulo: "", texto: "", client_id: SEM });
    carregar();
  }

  async function resolver(item: ItemMural, resolvido: boolean) {
    const { error } = await supabase.from("mural_itens").update({ resolvido_at: resolvido ? new Date().toISOString() : null }).eq("id", item.id);
    if (error) return toast.error(errorMessage(error, "Não foi possível atualizar"));
    carregar();
  }

  async function apagar(item: ItemMural) {
    const { error } = await supabase.from("mural_itens").delete().eq("id", item.id);
    if (error) return toast.error(errorMessage(error, "Não foi possível apagar"));
    carregar();
  }

  const visiveis = (itens ?? []).filter(i => filtro === "todos" || i.tipo === filtro);
  const tipo = (id: string) => TIPOS_MURAL.find(t => t.id === id) ?? TIPOS_MURAL[0];

  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base"><Megaphone className="h-4 w-4 text-primary" /> Mural da equipe</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">Alertas, ideias, problemas e avisos.</p>
        </div>
        <Button size="sm" variant="outline" className="shrink-0" onClick={() => setCriando(true)}>
          <Plus className="mr-1 h-4 w-4" /> Publicar
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap gap-1">
          {[{ id: "todos", label: "Todos" }, ...TIPOS_MURAL].map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFiltro(t.id)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${filtro === t.id ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {itens === null ? (
          <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : visiveis.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {verResolvidos ? "Nada por aqui." : "Nada pendente no mural."}
          </p>
        ) : (
          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {visiveis.map(i => {
              const t = tipo(i.tipo);
              const Icone = t.icon;
              const podeMexer = isAdmin || i.autor_id === user?.id;
              return (
                <div key={i.id} className={`rounded-xl border bg-card/60 p-3 ${i.resolvido_at ? "opacity-60" : ""}`}>
                  <div className="flex items-start gap-2.5">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ${t.cor}`}><Icone className="h-3.5 w-3.5" /></div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-medium leading-snug ${i.resolvido_at ? "line-through" : ""}`}>{i.titulo}</div>
                      {i.texto && <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{i.texto}</p>}
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {t.label} · {nomeDe(i.autor_id)}
                        {i.client_id && clientePorId.get(i.client_id) && ` · ${clientePorId.get(i.client_id)!.name}`}
                        {" · "}{formatDistanceToNow(new Date(i.created_at), { addSuffix: true, locale: ptBR })}
                        {i.resolvido_at && ` · resolvido por ${nomeDe(i.resolvido_por)}`}
                      </div>
                    </div>
                    {podeMexer && (
                      <div className="flex shrink-0 gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title={i.resolvido_at ? "Reabrir" : "Marcar como resolvido"}
                          onClick={() => resolver(i, !i.resolvido_at)}
                        >
                          {i.resolvido_at ? <RotateCcw className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Apagar" onClick={() => apagar(i)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setVerResolvidos(v => !v)}>
          {verResolvidos ? "Esconder resolvidos" : "Ver resolvidos"}
        </button>
      </CardContent>

      <Dialog open={criando} onOpenChange={setCriando}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={publicar} className="space-y-3">
            <DialogHeader>
              <DialogTitle>Publicar no mural</DialogTitle>
              <DialogDescription>Fica visível para a equipe que acessa a Visão da agência.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS_MURAL.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cliente</Label>
                <Select value={form.client_id} onValueChange={v => setForm({ ...form, client_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM}>Nenhum</SelectItem>
                    {clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Assunto</Label>
              <Input autoFocus value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Cliente X pediu para mudar o horário da reunião" />
            </div>
            <div>
              <Label>Detalhes</Label>
              <Textarea rows={3} value={form.texto} onChange={e => setForm({ ...form, texto: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCriando(false)}>Cancelar</Button>
              <Button type="submit" disabled={salvando}>{salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Publicar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
