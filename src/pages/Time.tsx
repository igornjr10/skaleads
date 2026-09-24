import { useEffect, useMemo, useState } from "react";
import { addDays, differenceInCalendarDays, endOfWeek, format, isWithinInterval, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BellRing,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Database,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Plus,
  Repeat,
  Sun,
  Tag,
  Trash2,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Cliente {
  id: string;
  name: string;
}

interface Perfil {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface Membro {
  id: string;
  user_id: string | null;
  nome: string;
  funcao: string;
  email: string | null;
  whatsapp: string | null;
  ativo: boolean;
}

type Tipo = "semanal" | "diaria";
type Prioridade = "baixa" | "normal" | "alta" | "urgente";
type Status = "pendente" | "andamento" | "concluida";

interface Demanda {
  id: string;
  member_id: string | null;
  client_id: string | null;
  tipo: Tipo;
  titulo: string;
  descricao: string | null;
  prioridade: Prioridade;
  status: Status;
  prazo: string | null;
  notified_at: string | null;
}

interface ResultadoCanal {
  sent: boolean;
  skipped?: string;
  error?: string;
}

interface ResultadoAviso {
  success: boolean;
  email: ResultadoCanal;
  whatsapp: ResultadoCanal;
  app: ResultadoCanal;
  error?: string;
}

const FUNCOES = [
  "Gestor de tráfego",
  "Designer",
  "Editor de vídeo",
  "Copywriter",
  "Social media",
  "Atendimento",
  "Financeiro",
];

const PRIORIDADES: Record<Prioridade, { label: string; ponto: string; chip: string }> = {
  baixa: { label: "Baixa", ponto: "bg-emerald-400", chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" },
  normal: { label: "Normal", ponto: "bg-sky-400", chip: "border-sky-500/30 bg-sky-500/10 text-sky-300" },
  alta: { label: "Alta", ponto: "bg-amber-400", chip: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
  urgente: { label: "Urgente", ponto: "bg-rose-500", chip: "border-rose-500/30 bg-rose-500/10 text-rose-300" },
};

const STATUS_SEGUINTE: Record<Status, Status> = {
  pendente: "andamento",
  andamento: "concluida",
  concluida: "pendente",
};

const MEMBRO_VAZIO: Omit<Membro, "id"> = {
  user_id: null,
  nome: "",
  funcao: FUNCOES[0],
  email: "",
  whatsapp: "",
  ativo: true,
};

function hojeIso() {
  return format(new Date(), "yyyy-MM-dd");
}

function dataLocal(iso: string) {
  return new Date(`${iso}T00:00:00`);
}

function iniciais(texto: string) {
  const partes = texto.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}

function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/)[0] || nome;
}

function descreverPrazo(prazo: string | null, status: Status) {
  if (!prazo) return { texto: "sem prazo", atrasada: false, hoje: false };
  const dias = differenceInCalendarDays(dataLocal(prazo), new Date());
  const data = format(dataLocal(prazo), "dd MMM", { locale: ptBR });
  if (status === "concluida") return { texto: data, atrasada: false, hoje: false };
  if (dias < 0) return { texto: `${data} · ${Math.abs(dias)}d atrasado`, atrasada: true, hoje: false };
  if (dias === 0) return { texto: `${data} · hoje`, atrasada: false, hoje: true };
  if (dias === 1) return { texto: `${data} · amanhã`, atrasada: false, hoje: false };
  return { texto: data, atrasada: false, hoje: false };
}

function resumirAviso(r: ResultadoAviso) {
  const canal = (nome: string, c: ResultadoCanal) => {
    if (c.sent) return `${nome} ✓`;
    if (c.error) return `${nome} ✗ (${c.error})`;
    return null;
  };
  return [canal("Email", r.email), canal("WhatsApp", r.whatsapp), canal("App", r.app)]
    .filter(Boolean)
    .join(" · ");
}

function StatusBotao({ status, onClick, disabled }: { status: Status; onClick: () => void; disabled?: boolean }) {
  const titulo = { pendente: "Marcar em andamento", andamento: "Marcar concluída", concluida: "Reabrir" }[status];
  return (
    <button
      type="button"
      title={titulo}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="shrink-0 rounded-full text-muted-foreground transition-colors hover:text-primary disabled:cursor-default disabled:hover:text-muted-foreground"
    >
      {status === "concluida" ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
      ) : status === "andamento" ? (
        <Loader2 className="h-4 w-4 text-sky-400" />
      ) : (
        <Circle className="h-4 w-4" />
      )}
    </button>
  );
}

function LinhaDemanda({ demanda, cliente, podeEditar, onStatus, onAbrir }: {
  demanda: Demanda;
  cliente?: Cliente;
  podeEditar: boolean;
  onStatus: () => void;
  onAbrir: () => void;
}) {
  const prazo = descreverPrazo(demanda.prazo, demanda.status);
  const concluida = demanda.status === "concluida";
  const prioridade = PRIORIDADES[demanda.prioridade];

  return (
    <div
      onClick={onAbrir}
      className={`group flex cursor-pointer items-start gap-2.5 rounded-xl border border-transparent px-2 py-2 transition-colors hover:border-border/60 hover:bg-white/[0.03] ${
        concluida ? "opacity-50" : ""
      }`}
    >
      <div className="pt-0.5">
        <StatusBotao status={demanda.status} onClick={onStatus} disabled={!podeEditar} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${prioridade.ponto}`} title={`Prioridade ${prioridade.label}`} />
          <p className={`truncate text-sm font-medium leading-snug ${concluida ? "line-through" : ""}`}>{demanda.titulo}</p>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          <span className={`inline-flex items-center gap-1 ${prazo.atrasada ? "font-medium text-rose-400" : prazo.hoje ? "font-medium text-amber-300" : ""}`}>
            <CalendarDays className="h-3 w-3" />
            {prazo.texto}
          </span>
          {cliente && <span className="truncate">· {cliente.name}</span>}
          {(demanda.prioridade === "alta" || demanda.prioridade === "urgente") && (
            <span className={`font-semibold uppercase tracking-wide ${demanda.prioridade === "urgente" ? "text-rose-400" : "text-amber-300"}`}>
              · {prioridade.label}
            </span>
          )}
        </div>
      </div>
      <Pencil className="mt-1 h-3 w-3 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/70" />
    </div>
  );
}

export default function Time() {
  const { role } = useAuth();
  const podeEditar = role !== "viewer";

  const [membros, setMembros] = useState<Membro[]>([]);
  const [demandas, setDemandas] = useState<Demanda[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [loading, setLoading] = useState(true);
  const [semTabela, setSemTabela] = useState(false);

  const [semana, setSemana] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [filtroTipo, setFiltroTipo] = useState<"todas" | Tipo>("todas");
  const [mostrarConcluidas, setMostrarConcluidas] = useState(false);
  const [mostrarInativos, setMostrarInativos] = useState(false);

  const [membroAberto, setMembroAberto] = useState<(Omit<Membro, "id"> & { id?: string }) | null>(null);
  const [demandaAberta, setDemandaAberta] = useState<(Omit<Demanda, "id" | "notified_at"> & { id?: string; notified_at?: string | null }) | null>(null);
  const [membroOriginal, setMembroOriginal] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [notificando, setNotificando] = useState(false);

  const inicioSemana = semana;
  const fimSemana = endOfWeek(semana, { weekStartsOn: 1 });
  const semanaAtual = differenceInCalendarDays(inicioSemana, startOfWeek(new Date(), { weekStartsOn: 1 })) === 0;

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setLoading(true);
    const [membrosRes, demandasRes, clientesRes, perfisRes] = await Promise.all([
      supabase.from("team_members").select("*").order("nome"),
      supabase.from("team_demands").select("*").order("prazo", { ascending: true, nullsFirst: false }).order("created_at"),
      supabase.from("clients").select("id, name").eq("status", "active").order("name"),
      supabase.from("profiles").select("id, full_name, email"),
    ]);

    if (membrosRes.error?.code === "42P01" || demandasRes.error?.code === "42P01") {
      setSemTabela(true);
      setLoading(false);
      return;
    }
    if (membrosRes.error) toast.error(membrosRes.error.message);
    if (demandasRes.error) toast.error(demandasRes.error.message);

    setMembros((membrosRes.data as Membro[]) ?? []);
    setDemandas((demandasRes.data as Demanda[]) ?? []);
    setClientes((clientesRes.data as Cliente[]) ?? []);
    setPerfis((perfisRes.data as Perfil[]) ?? []);
    setLoading(false);
  }

  const clientesPorId = useMemo(() => Object.fromEntries(clientes.map((c) => [c.id, c])), [clientes]);
  const membrosVisiveis = useMemo(
    () => membros.filter((m) => mostrarInativos || m.ativo),
    [membros, mostrarInativos]
  );

  const visiveis = useMemo(
    () =>
      demandas.filter((d) => {
        if (filtroTipo !== "todas" && d.tipo !== filtroTipo) return false;
        if (!mostrarConcluidas && d.status === "concluida") return false;
        if (!d.prazo) return d.status !== "concluida";
        return isWithinInterval(dataLocal(d.prazo), { start: inicioSemana, end: fimSemana });
      }),
    [demandas, filtroTipo, mostrarConcluidas, inicioSemana, fimSemana]
  );

  const porMembro = useMemo(() => {
    const mapa: Record<string, Demanda[]> = {};
    for (const d of visiveis) {
      const chave = d.member_id ?? "__sem";
      (mapa[chave] ??= []).push(d);
    }
    return mapa;
  }, [visiveis]);

  const stats = useMemo(() => {
    const abertas = demandas.filter((d) => d.status !== "concluida");
    return {
      pessoas: membros.filter((m) => m.ativo).length,
      abertas: abertas.length,
      atrasadas: abertas.filter((d) => d.prazo && differenceInCalendarDays(dataLocal(d.prazo), new Date()) < 0).length,
      urgentes: abertas.filter((d) => d.prioridade === "urgente").length,
    };
  }, [demandas, membros]);

  // ── Membros ──────────────────────────────────────────────────────────────
  function abrirMembro(m?: Membro) {
    setMembroAberto(m ? { ...m, email: m.email ?? "", whatsapp: m.whatsapp ?? "" } : { ...MEMBRO_VAZIO });
  }

  async function salvarMembro() {
    if (!membroAberto) return;
    if (!membroAberto.nome.trim()) return toast.error("Informe o nome da pessoa");
    if (!membroAberto.funcao.trim()) return toast.error("Informe a função");
    const email = membroAberto.email?.trim() || null;
    const whatsapp = membroAberto.whatsapp?.trim() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("Email inválido");
    if (!email && !whatsapp) toast.warning("Sem email nem WhatsApp esta pessoa não receberá avisos de demanda");

    setSalvando(true);
    const payload = {
      nome: membroAberto.nome.trim(),
      funcao: membroAberto.funcao.trim(),
      email,
      whatsapp,
      user_id: membroAberto.user_id,
      ativo: membroAberto.ativo,
    };
    const { error } = membroAberto.id
      ? await supabase.from("team_members").update(payload).eq("id", membroAberto.id)
      : await supabase.from("team_members").insert(payload);
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success(membroAberto.id ? "Pessoa atualizada" : "Pessoa adicionada ao time");
    setMembroAberto(null);
    carregar();
  }

  async function excluirMembro() {
    if (!membroAberto?.id) return;
    const pendentes = demandas.filter((d) => d.member_id === membroAberto.id && d.status !== "concluida").length;
    if (pendentes > 0 && !window.confirm(`${membroAberto.nome} tem ${pendentes} demanda(s) aberta(s). Elas ficarão sem responsável. Remover mesmo assim?`)) return;
    const { error } = await supabase.from("team_members").delete().eq("id", membroAberto.id);
    if (error) return toast.error(error.message);
    toast.success("Pessoa removida do time");
    setMembroAberto(null);
    carregar();
  }

  function vincularPerfil(perfilId: string | null) {
    if (!membroAberto) return;
    const perfil = perfis.find((p) => p.id === perfilId);
    setMembroAberto({
      ...membroAberto,
      user_id: perfilId,
      nome: membroAberto.nome || perfil?.full_name || "",
      email: membroAberto.email || perfil?.email || "",
    });
  }

  // ── Demandas ─────────────────────────────────────────────────────────────
  function abrirDemanda(d?: Demanda, preset?: Partial<Demanda>) {
    if (d) {
      setMembroOriginal(d.member_id);
      setDemandaAberta({ ...d, descricao: d.descricao ?? "" });
      return;
    }
    const tipo = preset?.tipo ?? (filtroTipo === "diaria" ? "diaria" : "semanal");
    setMembroOriginal(null);
    setDemandaAberta({
      member_id: preset?.member_id ?? null,
      client_id: null,
      tipo,
      titulo: "",
      descricao: "",
      prioridade: "normal",
      status: "pendente",
      prazo: tipo === "diaria" ? hojeIso() : format(addDays(inicioSemana, 4), "yyyy-MM-dd"),
    });
  }

  function trocarTipo(tipo: Tipo) {
    if (!demandaAberta) return;
    const prazoPadrao = tipo === "diaria" ? hojeIso() : format(addDays(inicioSemana, 4), "yyyy-MM-dd");
    setDemandaAberta({ ...demandaAberta, tipo, prazo: demandaAberta.id ? demandaAberta.prazo : prazoPadrao });
  }

  async function notificar(demandaId: string, silencioso = false) {
    setNotificando(true);
    const { data, error } = await supabase.functions.invoke<ResultadoAviso>("notify-team-demand", {
      body: { demand_id: demandaId },
    });
    setNotificando(false);

    const resultado = data as ResultadoAviso | null;
    if (error || !resultado || resultado.error) {
      let detalhe = resultado?.error ?? error?.message ?? "Erro desconhecido";
      // Em status não-2xx o supabase-js esconde o corpo; o motivo real está lá.
      if (error && "context" in error) {
        try {
          const corpo = await (error as { context: Response }).context.json();
          if (corpo?.error) detalhe = corpo.error;
        } catch { /* corpo não-JSON */ }
      }
      toast.error(`Demanda salva, mas o aviso não saiu: ${detalhe}`);
      return;
    }
    const resumo = resumirAviso(resultado);
    if (resultado.success) {
      toast.success(silencioso ? "Aviso reenviado" : "Responsável avisado", { description: resumo });
    } else {
      toast.warning("Nenhum canal conseguiu avisar o responsável", {
        description: resumo || "Cadastre email ou WhatsApp para essa pessoa",
      });
    }
    setDemandas((atual) =>
      atual.map((d) => (d.id === demandaId ? { ...d, notified_at: new Date().toISOString() } : d))
    );
  }

  async function salvarDemanda() {
    if (!demandaAberta) return;
    if (!demandaAberta.titulo.trim()) return toast.error("Dê um título para a demanda");

    setSalvando(true);
    const payload = {
      member_id: demandaAberta.member_id,
      client_id: demandaAberta.client_id,
      tipo: demandaAberta.tipo,
      titulo: demandaAberta.titulo.trim(),
      descricao: demandaAberta.descricao?.trim() || null,
      prioridade: demandaAberta.prioridade,
      status: demandaAberta.status,
      prazo: demandaAberta.prazo || null,
    };

    const resposta = demandaAberta.id
      ? await supabase.from("team_demands").update(payload).eq("id", demandaAberta.id).select("id").single()
      : await supabase.from("team_demands").insert(payload).select("id").single();

    setSalvando(false);
    if (resposta.error) return toast.error(resposta.error.message);

    const id = resposta.data.id;
    const etiquetaNova = Boolean(demandaAberta.member_id) && demandaAberta.member_id !== membroOriginal;
    setDemandaAberta(null);
    await carregar();

    if (etiquetaNova && demandaAberta.status !== "concluida") {
      await notificar(id);
    } else {
      toast.success(demandaAberta.id ? "Demanda atualizada" : "Demanda criada");
    }
  }

  async function excluirDemanda() {
    if (!demandaAberta?.id) return;
    const { error } = await supabase.from("team_demands").delete().eq("id", demandaAberta.id);
    if (error) return toast.error(error.message);
    setDemandaAberta(null);
    carregar();
  }

  async function avancarStatus(d: Demanda) {
    if (!podeEditar) return;
    const status = STATUS_SEGUINTE[d.status];
    const anterior = demandas;
    setDemandas((atual) => atual.map((x) => (x.id === d.id ? { ...x, status } : x)));
    const { error } = await supabase.from("team_demands").update({ status }).eq("id", d.id);
    if (error) {
      setDemandas(anterior);
      toast.error(error.message);
    }
  }

  if (semTabela) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <Database className="h-8 w-8 text-muted-foreground" />
          <h2 className="text-base font-semibold">Gestão de time ainda não instalada no banco</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Rode a migration <code className="text-primary">20260909000000_gestao_time.sql</code> e recarregue.
          </p>
        </CardContent>
      </Card>
    );
  }

  const semResponsavel = porMembro["__sem"] ?? [];
  const rotuloSemana = `${format(inicioSemana, "dd MMM", { locale: ptBR })} – ${format(fimSemana, "dd MMM", { locale: ptBR })}`;

  return (
    <div className="space-y-5">
      {/* ── Cabeçalho ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
            <UsersRound className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Gestão de time</h1>
            <p className="text-sm text-muted-foreground">
              Quem faz o quê na semana e no dia. Etiquete alguém numa demanda e ela recebe o aviso por email e WhatsApp.
            </p>
          </div>
        </div>

        {podeEditar && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => abrirMembro()}>
              <UserRoundPlus className="mr-2 h-4 w-4" />
              Nova pessoa
            </Button>
            <Button onClick={() => abrirDemanda()} disabled={membros.length === 0 && !loading}>
              <Plus className="mr-2 h-4 w-4" />
              Nova demanda
            </Button>
          </div>
        )}
      </div>

      {/* ── Indicadores ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { rotulo: "Pessoas ativas", valor: stats.pessoas, cor: "text-foreground" },
          { rotulo: "Demandas abertas", valor: stats.abertas, cor: "text-foreground" },
          { rotulo: "Atrasadas", valor: stats.atrasadas, cor: stats.atrasadas > 0 ? "text-rose-400" : "text-foreground" },
          { rotulo: "Urgentes", valor: stats.urgentes, cor: stats.urgentes > 0 ? "text-amber-300" : "text-foreground" },
        ].map((s) => (
          <Card key={s.rotulo}>
            <CardContent className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{s.rotulo}</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${s.cor}`}>{loading ? "—" : s.valor}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-background/40 p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSemana(addDays(semana, -7))} title="Semana anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <button
            type="button"
            onClick={() => setSemana(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            className="min-w-[150px] rounded-lg px-2 py-1 text-center text-sm font-semibold capitalize hover:bg-white/[0.04]"
            title="Voltar para a semana atual"
          >
            {rotuloSemana}
            {semanaAtual && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">atual</span>}
          </button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSemana(addDays(semana, 7))} title="Próxima semana">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex rounded-lg border border-border/60 p-0.5">
          {([
            { id: "todas", label: "Todas" },
            { id: "semanal", label: "Semanais", icon: Repeat },
            { id: "diaria", label: "Do dia", icon: Sun },
          ] as const).map((op) => (
            <button
              key={op.id}
              type="button"
              onClick={() => setFiltroTipo(op.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                filtroTipo === op.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {"icon" in op && op.icon && <op.icon className="h-3 w-3" />}
              {op.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground sm:ml-auto">
          <label className="inline-flex cursor-pointer items-center gap-2">
            <Switch checked={mostrarConcluidas} onCheckedChange={setMostrarConcluidas} />
            Concluídas
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2">
            <Switch checked={mostrarInativos} onCheckedChange={setMostrarInativos} />
            Inativos
          </label>
        </div>
      </div>

      {/* ── Cards por pessoa ────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72 rounded-2xl" />
          ))}
        </div>
      ) : membrosVisiveis.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <UsersRound className="h-8 w-8 text-muted-foreground" />
            <h2 className="text-base font-semibold">Ninguém no time ainda</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Cadastre as pessoas com email e WhatsApp. Depois, ao criar uma demanda e etiquetar alguém, o aviso sai na hora.
            </p>
            {podeEditar && (
              <Button onClick={() => abrirMembro()}>
                <UserRoundPlus className="mr-2 h-4 w-4" />
                Adicionar primeira pessoa
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {membrosVisiveis.map((m) => {
            const lista = porMembro[m.id] ?? [];
            const semanais = lista.filter((d) => d.tipo === "semanal");
            const diarias = lista.filter((d) => d.tipo === "diaria");
            const abertas = demandas.filter((d) => d.member_id === m.id && d.status !== "concluida");
            const atrasadas = abertas.filter((d) => d.prazo && differenceInCalendarDays(dataLocal(d.prazo), new Date()) < 0).length;

            const bloco = (titulo: string, Icone: typeof Repeat, itens: Demanda[], tipo: Tipo) => (
              <div>
                <div className="mb-1 flex items-center justify-between px-2">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <Icone className="h-3 w-3" />
                    {titulo}
                    <span className="tabular-nums text-muted-foreground/60">{itens.length}</span>
                  </span>
                  {podeEditar && (
                    <button
                      type="button"
                      onClick={() => abrirDemanda(undefined, { member_id: m.id, tipo })}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-primary"
                    >
                      <Plus className="h-3 w-3" />
                      adicionar
                    </button>
                  )}
                </div>
                {itens.length === 0 ? (
                  <p className="px-2 py-2 text-[11px] text-muted-foreground/50">nada por aqui</p>
                ) : (
                  <div className="flex flex-col">
                    {itens.map((d) => (
                      <LinhaDemanda
                        key={d.id}
                        demanda={d}
                        cliente={d.client_id ? clientesPorId[d.client_id] : undefined}
                        podeEditar={podeEditar}
                        onStatus={() => avancarStatus(d)}
                        onAbrir={() => podeEditar && abrirDemanda(d)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );

            return (
              <Card key={m.id} className={`flex flex-col ${m.ativo ? "" : "opacity-60"}`}>
                <CardContent className="flex flex-1 flex-col gap-4 p-4">
                  <div className="flex items-start gap-3">
                    <div className="relative">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-sm font-bold text-emerald-300 ring-1 ring-emerald-500/25">
                        {iniciais(m.nome)}
                      </div>
                      {atrasadas > 0 && (
                        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white" title={`${atrasadas} atrasada(s)`}>
                          {atrasadas}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-base font-semibold leading-tight">{m.nome}</p>
                        {!m.ativo && <Badge variant="outline" className="text-[10px]">inativo</Badge>}
                      </div>
                      <Badge variant="outline" className="mt-1 border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-300">
                        {m.funcao}
                      </Badge>
                      <div className="mt-2 flex flex-col gap-0.5 text-[11px] text-muted-foreground">
                        <span className={`inline-flex items-center gap-1.5 ${m.email ? "" : "text-amber-400/80"}`}>
                          <Mail className="h-3 w-3" />
                          <span className="truncate">{m.email || "sem email"}</span>
                        </span>
                        <span className={`inline-flex items-center gap-1.5 ${m.whatsapp ? "" : "text-amber-400/80"}`}>
                          <Phone className="h-3 w-3" />
                          {m.whatsapp || "sem WhatsApp"}
                        </span>
                      </div>
                    </div>
                    {podeEditar && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground" onClick={() => abrirMembro(m)} title="Editar pessoa">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

                  <div className="flex flex-1 flex-col gap-4">
                    {filtroTipo !== "diaria" && bloco("Semana", Repeat, semanais, "semanal")}
                    {filtroTipo !== "semanal" && bloco("Do dia", Sun, diarias, "diaria")}
                  </div>

                  <p className="text-[11px] text-muted-foreground/60">
                    {abertas.length === 0 ? "Tudo entregue" : `${abertas.length} aberta${abertas.length === 1 ? "" : "s"} no total`}
                  </p>
                </CardContent>
              </Card>
            );
          })}

          {semResponsavel.length > 0 && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-semibold">Sem responsável</p>
                  <span className="text-xs tabular-nums text-muted-foreground">{semResponsavel.length}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Abra a demanda e etiquete alguém para disparar o aviso.</p>
                <div className="flex flex-col">
                  {semResponsavel.map((d) => (
                    <LinhaDemanda
                      key={d.id}
                      demanda={d}
                      cliente={d.client_id ? clientesPorId[d.client_id] : undefined}
                      podeEditar={podeEditar}
                      onStatus={() => avancarStatus(d)}
                      onAbrir={() => podeEditar && abrirDemanda(d)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Diálogo: pessoa ─────────────────────────────────────────────── */}
      <Dialog open={Boolean(membroAberto)} onOpenChange={(v) => !v && setMembroAberto(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{membroAberto?.id ? "Editar pessoa" : "Nova pessoa no time"}</DialogTitle>
          </DialogHeader>

          {membroAberto && (
            <div className="space-y-4">
              <div>
                <Label>Usuário do sistema (opcional)</Label>
                <Select value={membroAberto.user_id ?? "nenhum"} onValueChange={(v) => vincularPerfil(v === "nenhum" ? null : v)}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Não tem login aqui</SelectItem>
                    {perfis.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">Vinculando, a pessoa também recebe o aviso no sino do app.</p>
              </div>

              <div>
                <Label>Nome</Label>
                <Input className="mt-1.5" value={membroAberto.nome} onChange={(e) => setMembroAberto({ ...membroAberto, nome: e.target.value })} placeholder="Ex: Ana Souza" />
              </div>

              <div>
                <Label>Função</Label>
                <Input
                  className="mt-1.5"
                  list="funcoes-time"
                  value={membroAberto.funcao}
                  onChange={(e) => setMembroAberto({ ...membroAberto, funcao: e.target.value })}
                  placeholder="Ex: Gestor de tráfego"
                />
                <datalist id="funcoes-time">
                  {FUNCOES.map((f) => <option key={f} value={f} />)}
                </datalist>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {FUNCOES.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setMembroAberto({ ...membroAberto, funcao: f })}
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                        membroAberto.funcao === f
                          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                          : "border-border/60 text-muted-foreground hover:border-emerald-500/30 hover:text-foreground"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Email</Label>
                  <Input type="email" className="mt-1.5" value={membroAberto.email ?? ""} onChange={(e) => setMembroAberto({ ...membroAberto, email: e.target.value })} placeholder="ana@agencia.com" />
                </div>
                <div>
                  <Label>WhatsApp</Label>
                  <Input className="mt-1.5" value={membroAberto.whatsapp ?? ""} onChange={(e) => setMembroAberto({ ...membroAberto, whatsapp: e.target.value })} placeholder="11 99999-9999" />
                </div>
              </div>

              {membroAberto.id && (
                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-border/60 px-3 py-2.5 text-sm">
                  <span>
                    Ativo no time
                    <span className="block text-[11px] text-muted-foreground">Inativo some dos cards, mas mantém o histórico.</span>
                  </span>
                  <Switch checked={membroAberto.ativo} onCheckedChange={(v) => setMembroAberto({ ...membroAberto, ativo: v })} />
                </label>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            {membroAberto?.id ? (
              <Button variant="ghost" onClick={excluirMembro} className="text-destructive hover:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Remover
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMembroAberto(null)}>Cancelar</Button>
              <Button onClick={salvarMembro} disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: demanda ────────────────────────────────────────────── */}
      <Dialog open={Boolean(demandaAberta)} onOpenChange={(v) => !v && setDemandaAberta(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{demandaAberta?.id ? "Editar demanda" : "Nova demanda"}</DialogTitle>
          </DialogHeader>

          {demandaAberta && (
            <div className="space-y-4">
              <div className="flex rounded-lg border border-border/60 p-0.5">
                {([
                  { id: "semanal", label: "Demanda da semana", icon: Repeat },
                  { id: "diaria", label: "Demanda do dia", icon: Sun },
                ] as const).map((op) => (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => trocarTipo(op.id)}
                    className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      demandaAberta.tipo === op.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <op.icon className="h-3 w-3" />
                    {op.label}
                  </button>
                ))}
              </div>

              <div>
                <Label>Título</Label>
                <Input
                  className="mt-1.5"
                  value={demandaAberta.titulo}
                  onChange={(e) => setDemandaAberta({ ...demandaAberta, titulo: e.target.value })}
                  placeholder="Ex: Subir campanha de remarketing do cliente X"
                  autoFocus
                />
              </div>

              <div>
                <Label className="inline-flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5" />
                  Etiquetar responsável
                </Label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {membros.filter((m) => m.ativo || m.id === demandaAberta.member_id).map((m) => {
                    const selecionado = demandaAberta.member_id === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setDemandaAberta({ ...demandaAberta, member_id: selecionado ? null : m.id })}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                          selecionado
                            ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                            : "border-border/60 text-muted-foreground hover:border-emerald-500/30 hover:text-foreground"
                        }`}
                      >
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-[9px] font-bold text-emerald-300">
                          {iniciais(m.nome)}
                        </span>
                        {primeiroNome(m.nome)}
                        <span className="text-[10px] opacity-60">· {m.funcao}</span>
                      </button>
                    );
                  })}
                  {membros.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">Cadastre pessoas no time para etiquetar.</p>
                  )}
                </div>
                {demandaAberta.member_id && demandaAberta.member_id !== membroOriginal && (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-emerald-300/90">
                    <BellRing className="h-3 w-3" />
                    Ao salvar, o aviso sai por email e WhatsApp com prioridade e prazo.
                  </p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Prioridade</Label>
                  <Select value={demandaAberta.prioridade} onValueChange={(v) => setDemandaAberta({ ...demandaAberta, prioridade: v as Prioridade })}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(PRIORIDADES) as Prioridade[]).map((p) => (
                        <SelectItem key={p} value={p}>
                          <span className="inline-flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${PRIORIDADES[p].ponto}`} />
                            {PRIORIDADES[p].label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Prazo</Label>
                  <Input type="date" className="mt-1.5" value={demandaAberta.prazo ?? ""} onChange={(e) => setDemandaAberta({ ...demandaAberta, prazo: e.target.value || null })} />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={demandaAberta.status} onValueChange={(v) => setDemandaAberta({ ...demandaAberta, status: v as Status })}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="andamento">Em andamento</SelectItem>
                      <SelectItem value="concluida">Concluída</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Cliente (opcional)</Label>
                <Select value={demandaAberta.client_id ?? "nenhum"} onValueChange={(v) => setDemandaAberta({ ...demandaAberta, client_id: v === "nenhum" ? null : v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Interno / sem cliente</SelectItem>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Descrição</Label>
                <Textarea
                  className="mt-1.5 min-h-20"
                  value={demandaAberta.descricao ?? ""}
                  onChange={(e) => setDemandaAberta({ ...demandaAberta, descricao: e.target.value })}
                  placeholder="O que precisa ser feito, onde está o material, o que não pode faltar..."
                />
              </div>

              {demandaAberta.id && demandaAberta.member_id && demandaAberta.member_id === membroOriginal && (
                <div className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
                  <span>
                    {demandaAberta.notified_at
                      ? `Último aviso em ${format(new Date(demandaAberta.notified_at), "dd/MM 'às' HH:mm", { locale: ptBR })}`
                      : "Responsável ainda não foi avisado"}
                  </span>
                  <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" disabled={notificando} onClick={() => demandaAberta.id && notificar(demandaAberta.id, true)}>
                    <BellRing className="h-3 w-3" />
                    {notificando ? "Enviando..." : "Reenviar aviso"}
                  </Button>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            {demandaAberta?.id ? (
              <Button variant="ghost" onClick={excluirDemanda} className="text-destructive hover:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDemandaAberta(null)}>Cancelar</Button>
              <Button onClick={salvarDemanda} disabled={salvando || notificando}>
                {salvando ? "Salvando..." : notificando ? "Avisando..." : "Salvar"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
