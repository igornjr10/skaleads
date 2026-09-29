import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/utils";
import { SeletorDeLeads } from "./SeletorDeLeads";
import { TextoComVariaveis } from "./TextoComVariaveis";

interface Passo { id?: string; ordem: number; espera_dias: number; texto: string }
interface Sequencia { id: string; nome: string; ativa: boolean; parar_se_responder: boolean; wa_sequencia_passos: Passo[] }
type Contagem = Record<"ativa" | "concluida" | "respondeu" | "cancelada", number>;

const VAZIA = (): Contagem => ({ ativa: 0, concluida: 0, respondeu: 0, cancelada: 0 });

export function SequenciasTab({ meuId, isAdmin }: { meuId: string | undefined; isAdmin: boolean }) {
  const [sequencias, setSequencias] = useState<Sequencia[] | null>(null);
  const [contagens, setContagens] = useState<Map<string, Contagem>>(new Map());
  const [editando, setEditando] = useState<{ id: string | null; nome: string; parar: boolean; passos: Passo[] } | null>(null);
  const [inscrevendo, setInscrevendo] = useState<Sequencia | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    const { data } = await supabase.from("wa_sequencias")
      .select("id, nome, ativa, parar_se_responder, wa_sequencia_passos(id, ordem, espera_dias, texto)").order("created_at");
    const lista = ((data ?? []) as unknown as Sequencia[]).map(s => ({ ...s, wa_sequencia_passos: [...s.wa_sequencia_passos].sort((a, b) => a.ordem - b.ordem) }));
    setSequencias(lista);
    const { data: insc } = await supabase.from("wa_inscricoes").select("sequencia_id, status");
    const mapa = new Map<string, Contagem>();
    for (const i of (insc ?? []) as { sequencia_id: string; status: keyof Contagem }[]) {
      const c = mapa.get(i.sequencia_id) ?? VAZIA();
      c[i.status] += 1;
      mapa.set(i.sequencia_id, c);
    }
    setContagens(mapa);
  }
  useEffect(() => { carregar(); }, []);

  async function salvar() {
    if (!editando) return;
    if (!editando.nome.trim()) return toast.error("Dê um nome à sequência");
    if (!editando.passos.length || editando.passos.some(p => !p.texto.trim())) return toast.error("Toda mensagem precisa de texto");
    setSalvando(true);
    try {
      let id = editando.id;
      if (id) {
        const { error } = await supabase.from("wa_sequencias").update({ nome: editando.nome.trim(), parar_se_responder: editando.parar }).eq("id", id);
        if (error) throw error;
        // Passos sao reescritos: a fila guarda o texto do passo ja agendado,
        // entao quem esta no meio da cadencia nao e afetado pela edicao.
        const { error: e2 } = await supabase.from("wa_sequencia_passos").delete().eq("sequencia_id", id);
        if (e2) throw e2;
      } else {
        const { data, error } = await supabase.from("wa_sequencias")
          .insert({ nome: editando.nome.trim(), parar_se_responder: editando.parar }).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      const { error: e3 } = await supabase.from("wa_sequencia_passos").insert(
        editando.passos.map((p, i) => ({ sequencia_id: id!, ordem: i + 1, espera_dias: p.espera_dias, texto: p.texto.trim() }))
      );
      if (e3) throw e3;
      setEditando(null);
      carregar();
    } catch (err) {
      toast.error(errorMessage(err, "Não foi possível salvar a sequência"));
    } finally {
      setSalvando(false);
    }
  }

  async function alternar(s: Sequencia) {
    const { error } = await supabase.from("wa_sequencias").update({ ativa: !s.ativa }).eq("id", s.id);
    if (error) return toast.error(errorMessage(error, "Não foi possível mudar"));
    carregar();
  }

  async function inscrever() {
    if (!inscrevendo || !ids.length) return;
    setSalvando(true);
    const { data, error } = await supabase.rpc("inscrever_em_sequencia", { _sequencia_id: inscrevendo.id, _lead_ids: ids });
    setSalvando(false);
    if (error) return toast.error(errorMessage(error, "Não foi possível inscrever"));
    const pulados = ids.length - (data ?? 0);
    toast.success(`${data} lead${data === 1 ? "" : "s"} inscrito${data === 1 ? "" : "s"}${pulados ? ` · ${pulados} já estavam na sequência` : ""}`);
    setInscrevendo(null);
    setIds([]);
    carregar();
  }

  function moverPasso(i: number, passo: -1 | 1) {
    if (!editando) return;
    const j = i + passo;
    if (j < 0 || j >= editando.passos.length) return;
    const passos = [...editando.passos];
    [passos[i], passos[j]] = [passos[j], passos[i]];
    setEditando({ ...editando, passos });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Cadência automática de follow-up. Por padrão para sozinha quando o lead responde.</p>
        {isAdmin && (
          <Button onClick={() => setEditando({ id: null, nome: "", parar: true, passos: [{ ordem: 1, espera_dias: 0, texto: "" }] })}>
            <Plus className="mr-1.5 h-4 w-4" /> Sequência
          </Button>
        )}
      </div>

      {sequencias === null ? (
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {sequencias.map(s => {
            const c = contagens.get(s.id) ?? VAZIA();
            let dia = 0;
            return (
              <Card key={s.id} className="shadow-card">
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{s.nome}</span>
                    {!s.ativa && <Badge variant="secondary">Pausada</Badge>}
                    <div className="ml-auto flex items-center gap-1">
                      {isAdmin && <Switch checked={s.ativa} onCheckedChange={() => alternar(s)} title={s.ativa ? "Pausar" : "Ligar"} />}
                      {isAdmin && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditando({
                          id: s.id, nome: s.nome, parar: s.parar_se_responder, passos: s.wa_sequencia_passos.map(p => ({ ...p })),
                        })}><Pencil className="h-3.5 w-3.5" /></Button>
                      )}
                    </div>
                  </div>
                  <ol className="space-y-1.5 border-l border-border/60 pl-4">
                    {s.wa_sequencia_passos.map(p => {
                      dia += p.espera_dias;
                      return (
                        <li key={p.id ?? p.ordem} className="text-sm">
                          <span className="text-xs font-medium text-muted-foreground">Dia {dia} · </span>
                          <span className="line-clamp-2 inline whitespace-pre-wrap">{p.texto}</span>
                        </li>
                      );
                    })}
                  </ol>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span><strong className="text-foreground">{c.ativa}</strong> em andamento</span>
                    <span>{c.respondeu} responderam</span>
                    <span>{c.concluida} concluídas</span>
                    <Button size="sm" variant="outline" className="ml-auto" disabled={!s.ativa} onClick={() => { setIds([]); setInscrevendo(s); }}>
                      <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Inscrever leads
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {sequencias.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground lg:col-span-2">
              {isAdmin ? "Nenhuma sequência ainda." : "O ADM ainda não montou nenhuma sequência."}
            </p>
          )}
        </div>
      )}

      <Dialog open={!!editando} onOpenChange={open => !open && setEditando(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editando?.id ? "Editar sequência" : "Nova sequência"}</DialogTitle>
            <DialogDescription>Cada mensagem sai X dias depois da anterior (a primeira, X dias depois da inscrição), dentro do horário de envio.</DialogDescription>
          </DialogHeader>
          {editando && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <Label>Nome</Label>
                  <Input value={editando.nome} onChange={e => setEditando({ ...editando, nome: e.target.value })} placeholder="Ex.: Follow-up pós-primeiro contato" />
                </div>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <Switch checked={editando.parar} onCheckedChange={parar => setEditando({ ...editando, parar })} /> Parar se responder
                </label>
              </div>
              {editando.passos.map((p, i) => (
                <div key={i} className="space-y-2 rounded-xl border border-border/60 p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Mensagem {i + 1}</span>
                    <span className="text-xs text-muted-foreground">enviar</span>
                    <Input
                      type="number"
                      min={0}
                      max={90}
                      className="h-8 w-20"
                      value={p.espera_dias}
                      onChange={e => setEditando({ ...editando, passos: editando.passos.map((x, k) => (k === i ? { ...x, espera_dias: Math.max(0, Math.min(90, Number(e.target.value) || 0)) } : x)) })}
                    />
                    <span className="text-xs text-muted-foreground">dia(s) {i === 0 ? "após a inscrição" : "após a anterior"}</span>
                    <div className="ml-auto flex">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moverPasso(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moverPasso(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" disabled={editando.passos.length === 1}
                        onClick={() => setEditando({ ...editando, passos: editando.passos.filter((_, k) => k !== i) })}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                  <TextoComVariaveis
                    linhas={3}
                    valor={p.texto}
                    onChange={texto => setEditando({ ...editando, passos: editando.passos.map((x, k) => (k === i ? { ...x, texto } : x)) })}
                  />
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setEditando({ ...editando, passos: [...editando.passos, { ordem: editando.passos.length + 1, espera_dias: 2, texto: "" }] })}>
                <Plus className="mr-1.5 h-4 w-4" /> Mensagem
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!inscrevendo} onOpenChange={open => !open && setInscrevendo(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Inscrever em “{inscrevendo?.nome}”</DialogTitle>
            <DialogDescription>Lead já inscrito nesta sequência é pulado. A primeira mensagem entra na fila de envio.</DialogDescription>
          </DialogHeader>
          <SeletorDeLeads selecionados={ids} onChange={setIds} meuId={meuId} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setInscrevendo(null)}>Cancelar</Button>
            <Button onClick={inscrever} disabled={salvando || !ids.length}>
              {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Inscrever {ids.length || ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
