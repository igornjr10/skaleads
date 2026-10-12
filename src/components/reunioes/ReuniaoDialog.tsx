import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/SearchableSelect";
import { SeletorMultiplo } from "@/components/SeletorMultiplo";
import { useAuth } from "@/hooks/useAuth";
import { errorMessage } from "@/lib/utils";
import { type Reuniao, deInputLocal, duracaoLegivel, paraInputLocal, paraReuniao } from "@/lib/reunioes";
import type { ClienteDaReuniao, PessoaDaReuniao } from "./useReunioes";

const SEM_CLIENTE = "__sem__";
const DURACOES = [15, 30, 45, 60, 90, 120, 180];

function proximaHoraCheia() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return paraInputLocal(d.toISOString());
}

function urlValida(v: string) {
  return !v || /^https?:\/\/\S+$/i.test(v);
}

interface Form {
  titulo: string;
  cliente: string;
  inicio: string;
  duracao: number;
  participantes: string[];
  meet_url: string;
  local: string;
  pauta: string;
}

export function ReuniaoDialog({
  open, onOpenChange, reuniao, participantesAtuais, clientes, pessoas, clienteInicial, podeDefinirParticipantes, onSalva,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reuniao: Reuniao | null;
  participantesAtuais: string[];
  clientes: ClienteDaReuniao[];
  pessoas: PessoaDaReuniao[];
  clienteInicial?: string | null;
  podeDefinirParticipantes: boolean;
  onSalva: (r: Reuniao, participantes: string[]) => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState<Form>({ titulo: "", cliente: SEM_CLIENTE, inicio: "", duracao: 60, participantes: [], meet_url: "", local: "", pauta: "" });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (reuniao) {
      setForm({
        titulo: reuniao.titulo,
        cliente: reuniao.client_id ?? SEM_CLIENTE,
        inicio: paraInputLocal(reuniao.inicio),
        duracao: reuniao.duracao_min,
        participantes: participantesAtuais,
        meet_url: reuniao.meet_url ?? "",
        local: reuniao.local ?? "",
        pauta: reuniao.pauta ?? "",
      });
    } else {
      setForm({
        titulo: "",
        cliente: clienteInicial ?? SEM_CLIENTE,
        inicio: proximaHoraCheia(),
        duracao: 60,
        participantes: user ? [user.id] : [],
        meet_url: "",
        local: "",
        pauta: "",
      });
    }
    // Reinicia o formulario so ao abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reuniao?.id]);

  const opcoesCliente = useMemo(() => {
    const lista = [{ value: SEM_CLIENTE, label: "Sem cliente (reunião interna)" }, ...clientes.map(c => ({ value: c.id, label: c.name }))];
    // Reuniao de cliente fora da carteira (participante) continua mostrando algo.
    if (reuniao?.client_id && !clientes.some(c => c.id === reuniao.client_id)) {
      lista.push({ value: reuniao.client_id, label: "Cliente fora da sua carteira" });
    }
    return lista;
  }, [clientes, reuniao?.client_id]);

  const duracoes = DURACOES.includes(form.duracao) ? DURACOES : [...DURACOES, form.duracao].sort((a, b) => a - b);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }));

  async function salvar() {
    if (!user) return;
    const titulo = form.titulo.trim();
    const inicio = deInputLocal(form.inicio);
    const meet = form.meet_url.trim();
    if (!titulo) return toast.error("Dê um título para a reunião");
    if (!inicio) return toast.error("Informe data e hora");
    if (!urlValida(meet)) return toast.error("O link do Meet precisa começar com https://");

    const campos = {
      titulo,
      client_id: form.cliente === SEM_CLIENTE ? null : form.cliente,
      inicio,
      duracao_min: form.duracao,
      meet_url: meet || null,
      local: form.local.trim() || null,
      pauta: form.pauta.trim() || null,
    };

    setSalvando(true);
    try {
      const res = reuniao
        ? await supabase.from("reunioes").update(campos).eq("id", reuniao.id).select("*").single()
        : await supabase.from("reunioes").insert({ ...campos, created_by: user.id }).select("*").single();
      if (res.error) throw res.error;
      const salva = paraReuniao(res.data as Record<string, unknown>);

      let participantes = participantesAtuais;
      if (podeDefinirParticipantes || !reuniao) {
        const antes = new Set(reuniao ? participantesAtuais : []);
        const depois = new Set(form.participantes);
        const entrar = [...depois].filter(id => !antes.has(id));
        const sair = [...antes].filter(id => !depois.has(id));
        if (entrar.length) {
          const { error } = await supabase.from("reuniao_participantes").insert(entrar.map(user_id => ({ reuniao_id: salva.id, user_id })));
          if (error) throw error;
        }
        if (sair.length) {
          const { error } = await supabase.from("reuniao_participantes").delete().eq("reuniao_id", salva.id).in("user_id", sair);
          if (error) throw error;
        }
        participantes = form.participantes;
      }

      onSalva(salva, participantes);
      toast.success(reuniao ? "Reunião atualizada" : "Reunião agendada");
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e, "Não foi possível salvar a reunião"));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !salvando && onOpenChange(v)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{reuniao ? "Editar reunião" : "Agendar reunião"}</DialogTitle>
          <DialogDescription>Participantes recebem aviso no sino e veem a reunião na agenda deles.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="reuniao-titulo">Título</Label>
            <Input id="reuniao-titulo" value={form.titulo} onChange={e => set("titulo", e.target.value)} placeholder="Ex.: Alinhamento mensal" maxLength={160} />
          </div>

          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <SearchableSelect
              options={opcoesCliente}
              value={form.cliente}
              onChange={v => set("cliente", v || SEM_CLIENTE)}
              placeholder="Sem cliente"
              searchPlaceholder="Buscar cliente..."
              emptyText="Nenhum cliente"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
            <div className="space-y-1.5">
              <Label htmlFor="reuniao-inicio">Data e hora</Label>
              <Input id="reuniao-inicio" type="datetime-local" value={form.inicio} onChange={e => set("inicio", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Duração</Label>
              <Select value={String(form.duracao)} onValueChange={v => set("duracao", Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {duracoes.map(d => (
                    <SelectItem key={d} value={String(d)}>{duracaoLegivel(d)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Participantes</Label>
            <SeletorMultiplo
              opcoes={pessoas.map(p => ({ value: p.id, label: p.nome, detalhe: p.id === user?.id ? "você" : undefined }))}
              valor={form.participantes}
              onChange={v => set("participantes", v)}
              placeholder="Quem vai participar"
              busca="Buscar pessoa..."
              disabled={!!reuniao && !podeDefinirParticipantes}
            />
            {!!reuniao && !podeDefinirParticipantes && (
              <p className="text-xs text-muted-foreground">Só quem marcou a reunião (ou um ADM) muda os participantes.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reuniao-meet">Link do Google Meet</Label>
            <Input id="reuniao-meet" value={form.meet_url} onChange={e => set("meet_url", e.target.value)} placeholder="https://meet.google.com/..." inputMode="url" />
            <p className="text-xs text-muted-foreground">Crie o evento no Google Agenda e cole aqui o link do Meet que aparece no convite.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reuniao-local">Local (opcional)</Label>
            <Input id="reuniao-local" value={form.local} onChange={e => set("local", e.target.value)} placeholder="Escritório do cliente, sala 2..." />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reuniao-pauta">Pauta</Label>
            <Textarea id="reuniao-pauta" value={form.pauta} onChange={e => set("pauta", e.target.value)} rows={4} placeholder="O que precisa ser tratado" />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {reuniao ? "Salvar" : "Agendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
