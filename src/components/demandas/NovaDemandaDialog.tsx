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
import { useAuth } from "@/hooks/useAuth";
import type { ClienteResumo, Pessoa } from "@/hooks/useDemandas";
import { errorMessage } from "@/lib/utils";
import { rotuloPapel } from "@/lib/permissoes";
import { CATEGORIAS, PRIORIDADES, type Demanda, paraDemanda } from "@/lib/demandas";

const SEM = "sem";

const VAZIO = {
  titulo: "",
  descricao: "",
  categoria: "outro",
  client_id: SEM,
  prioridade: "media",
  prazo: "",
  assigned_to: SEM,
};

export function NovaDemandaDialog({ open, onOpenChange, onCreated, clientes, pessoas, prazoInicial }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (d: Demanda) => void;
  clientes: ClienteResumo[];
  pessoas: Pessoa[];
  prazoInicial?: string;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState({ ...VAZIO, prazo: prazoInicial ?? "" });
  const [salvando, setSalvando] = useState(false);

  // Quem abre e o pai (botao ou dia do calendario): o form zera a cada abertura.
  useEffect(() => {
    if (open) setForm({ ...VAZIO, prazo: prazoInicial ?? "" });
  }, [open, prazoInicial]);

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
        client_id: form.client_id === SEM ? null : form.client_id,
        prioridade: form.prioridade,
        prazo: form.prazo || null,
        assigned_to: form.assigned_to === SEM ? null : form.assigned_to,
        created_by: user.id,
      })
      .select("*")
      .single();
    setSalvando(false);
    if (error) return toast.error(errorMessage(error, "Não foi possível criar a demanda"));
    onCreated(paraDemanda(data));
    onOpenChange(false);
    toast.success("Demanda criada");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={criar} className="space-y-3">
          <DialogHeader>
            <DialogTitle>Nova demanda</DialogTitle>
            <DialogDescription>Quem recebe é avisado no sino. Você acompanha e aprova quando ela voltar para revisão.</DialogDescription>
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
            <div>
              <Label>Responsável</Label>
              <Select value={form.assigned_to} onValueChange={v => setForm({ ...form, assigned_to: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM}>Sem responsável</SelectItem>
                  {pessoas.map(p => <SelectItem key={p.id} value={p.id}>{p.nome} · {rotuloPapel(p.role)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cliente</Label>
              <Select value={form.client_id} onValueChange={v => setForm({ ...form, client_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM}>Sem cliente (interna)</SelectItem>
                  {clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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
            <div className="sm:col-span-2">
              <Label>Prazo</Label>
              <Input type="date" value={form.prazo} onChange={e => setForm({ ...form, prazo: e.target.value })} />
            </div>
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
