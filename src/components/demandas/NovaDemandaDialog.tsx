import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SeletorMultiplo } from "@/components/SeletorMultiplo";
import { useAuth } from "@/hooks/useAuth";
import type { ClienteResumo, Pessoa } from "@/hooks/useDemandas";
import { errorMessage } from "@/lib/utils";
import { rotuloPapel } from "@/lib/permissoes";
import {
  CATEGORIAS, PRIORIDADES, RECORRENCIAS, type ClienteDaDemanda, type Demanda, type VinculosDemandas, paraDemanda,
} from "@/lib/demandas";

const SEM = "sem";

const VAZIO = {
  titulo: "",
  descricao: "",
  categoria: "outro",
  client_id: SEM,
  prioridade: "media",
  prazo: "",
  prazo_hora: "",
  assigned_to: SEM,
  clientes: [] as string[],
  corresponsaveis: [] as string[],
  recorrencia: SEM,
};

export interface DemandaInicial {
  titulo?: string;
  descricao?: string;
  categoria?: string;
  client_id?: string | null;
  assigned_to?: string | null;
}

export function NovaDemandaDialog({
  open, onOpenChange, onCreated, clientes, pessoas, prazoInicial, inicial, descricaoDialogo,
  vinculos, clientesAtivos, onVinculos,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (d: Demanda) => void;
  clientes: ClienteResumo[];
  pessoas: Pessoa[];
  /** Com as tabelas de vinculo no ar: varios clientes, corresponsaveis e recorrencia. */
  vinculos?: VinculosDemandas;
  clientesAtivos?: ClienteResumo[];
  onVinculos?: (taskId: string, v: { clientes?: ClienteDaDemanda[]; corresponsaveis?: string[] }) => void;
  prazoInicial?: string;
  /** Pre-preenche (ex.: tarefa que saiu de uma reuniao). */
  inicial?: DemandaInicial;
  descricaoDialogo?: string;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState({ ...VAZIO, prazo: prazoInicial ?? "" });
  const [salvando, setSalvando] = useState(false);

  // Quem abre e o pai (botao ou dia do calendario): o form zera a cada abertura.
  useEffect(() => {
    if (!open) return;
    setForm({
      ...VAZIO,
      prazo: prazoInicial ?? "",
      titulo: inicial?.titulo ?? "",
      descricao: inicial?.descricao ?? "",
      categoria: inicial?.categoria ?? VAZIO.categoria,
      client_id: inicial?.client_id ?? SEM,
      clientes: inicial?.client_id ? [inicial.client_id] : [],
      assigned_to: inicial?.assigned_to ?? SEM,
    });
  }, [open, prazoInicial, inicial]);

  const multi = !!vinculos?.disponivel;
  const principal = form.assigned_to === SEM ? null : form.assigned_to;
  // Um cliente so continua em client_id (como sempre foi); varios vao para task_clientes.
  const idsClientes = multi ? form.clientes : form.client_id === SEM ? [] : [form.client_id];
  const corresponsaveis = form.corresponsaveis.filter(id => id !== principal);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titulo.trim()) return toast.error("A demanda precisa de um título");
    if (!user) return;
    setSalvando(true);
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim() || null,
        categoria: form.categoria,
        client_id: idsClientes.length === 1 ? idsClientes[0] : null,
        prioridade: form.prioridade,
        prazo: form.prazo || null,
        prazo_hora: form.prazo && form.prazo_hora ? form.prazo_hora : null,
        assigned_to: principal,
        created_by: user.id,
        ...(multi && form.recorrencia !== SEM ? { recorrencia: form.recorrencia } : {}),
      })
      .select("*")
      .single();
    if (error) {
      setSalvando(false);
      return toast.error(errorMessage(error, "Não foi possível criar a demanda"));
    }
    const criada = paraDemanda(data);

    if (multi) {
      const [cli, cor] = await Promise.all([
        idsClientes.length > 1
          ? supabase.from("task_clientes").insert(idsClientes.map(client_id => ({ task_id: criada.id, client_id })))
          : Promise.resolve({ error: null }),
        corresponsaveis.length
          ? supabase.from("task_corresponsaveis").insert(corresponsaveis.map(user_id => ({ task_id: criada.id, user_id })))
          : Promise.resolve({ error: null }),
      ]);
      if (cli.error || cor.error) {
        toast.error(errorMessage(cli.error ?? cor.error, "A demanda foi criada, mas faltou gravar clientes ou responsáveis"));
      }
      onVinculos?.(criada.id, {
        clientes: idsClientes.length > 1 && !cli.error ? idsClientes.map(client_id => ({ client_id, feito: false })) : [],
        corresponsaveis: cor.error ? [] : corresponsaveis,
      });
    }

    setSalvando(false);
    onCreated(criada);
    onOpenChange(false);
    toast.success(idsClientes.length > 1 ? `Demanda criada para ${idsClientes.length} clientes` : "Demanda criada");
  }

  const opcoesPessoas = pessoas.map(p => ({ value: p.id, label: p.nome, detalhe: rotuloPapel(p.role) }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl sm:max-w-xl">
        <form onSubmit={criar} className="space-y-3">
          <DialogHeader>
            <DialogTitle>Nova demanda</DialogTitle>
            <DialogDescription>{descricaoDialogo ?? "Quem recebe é avisado no sino. Você acompanha e aprova quando ela voltar para revisão."}</DialogDescription>
          </DialogHeader>

          <div>
            <Label>Título</Label>
            <Input
              autoFocus
              value={form.titulo}
              onChange={e => setForm({ ...form, titulo: e.target.value })}
              placeholder="Ex.: Carrossel da promoção de outubro"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <Label>{multi ? "Responsável principal" : "Responsável"}</Label>
              <Select value={form.assigned_to} onValueChange={v => setForm({ ...form, assigned_to: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM}>Sem responsável</SelectItem>
                  {pessoas.map(p => <SelectItem key={p.id} value={p.id}>{p.nome} · {rotuloPapel(p.role)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {multi ? (
              <div className="min-w-0">
                <Label>Responsáveis secundários</Label>
                <SeletorMultiplo
                  opcoes={opcoesPessoas.filter(o => o.value !== principal)}
                  valor={corresponsaveis}
                  onChange={v => setForm({ ...form, corresponsaveis: v })}
                  placeholder="Ninguém além do principal"
                  busca="Buscar pessoa..."
                />
              </div>
            ) : (
              <div className="min-w-0">
                <Label>Cliente</Label>
                <Select value={form.client_id} onValueChange={v => setForm({ ...form, client_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM}>Sem cliente (interna)</SelectItem>
                    {clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {multi && (
              <div className="min-w-0 sm:col-span-2">
                <Label>Clientes</Label>
                <SeletorMultiplo
                  opcoes={clientes.map(c => ({ value: c.id, label: c.name, detalhe: c.status && c.status !== "active" ? "inativo" : undefined }))}
                  valor={form.clientes}
                  onChange={v => setForm({ ...form, clientes: v })}
                  placeholder="Sem cliente (interna)"
                  busca="Buscar cliente..."
                  todos={{ label: "Selecionar todos os ativos", valores: (clientesAtivos ?? clientes).map(c => c.id) }}
                />
                {form.clientes.length > 1 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Uma demanda só, com o andamento marcado cliente a cliente.
                  </p>
                )}
              </div>
            )}
            <div>
              <Label>Categoria</Label>
              <Select value={form.categoria} onValueChange={v => setForm({ ...form, categoria: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select value={form.prioridade} onValueChange={v => setForm({ ...form, prioridade: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORIDADES.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prazo</Label>
              <Input type="date" value={form.prazo} onChange={e => setForm({ ...form, prazo: e.target.value })} />
            </div>
            <div>
              <Label>Horário <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <Input type="time" disabled={!form.prazo} value={form.prazo_hora} onChange={e => setForm({ ...form, prazo_hora: e.target.value })} />
            </div>
            {multi && (
              <div className="sm:col-span-2">
                <Label>Repetir</Label>
                <Select value={form.recorrencia} onValueChange={v => setForm({ ...form, recorrencia: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM}>Não repete</SelectItem>
                    {RECORRENCIAS.map(r => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {form.recorrencia !== SEM && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Ao concluir, a próxima abre sozinha com os mesmos clientes e responsáveis, a partir do prazo desta.
                  </p>
                )}
              </div>
            )}
          </div>

          <div>
            <Label>Descrição / briefing</Label>
            <Textarea
              rows={4}
              value={form.descricao}
              onChange={e => setForm({ ...form, descricao: e.target.value })}
              placeholder="O que precisa ser feito, referências, formato, links..."
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={salvando}>
              {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Criar demanda
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
