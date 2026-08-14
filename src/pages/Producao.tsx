import { useEffect, useMemo, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDraggable, useDroppable } from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { differenceInCalendarDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Calendar,
  Clapperboard,
  Database,
  ExternalLink,
  Image as ImageIcon,
  Plus,
  Trash2,
  Type as TypeIcon,
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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Cliente {
  id: string;
  name: string;
  logo_url: string | null;
}

interface Pessoa {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface Demanda {
  id: string;
  client_id: string;
  tipo: "video" | "design" | "copy";
  titulo: string;
  briefing: string | null;
  status: "backlog" | "producao" | "revisao" | "aprovado" | "publicado";
  prioridade: "baixa" | "normal" | "alta";
  responsavel_id: string | null;
  prazo: string | null;
  link_arquivo: string | null;
  link_referencia: string | null;
}

const COLUNAS = [
  { id: "backlog", label: "Fila" },
  { id: "producao", label: "Em produção" },
  { id: "revisao", label: "Em revisão" },
  { id: "aprovado", label: "Aprovado" },
  { id: "publicado", label: "Publicado" },
] as const;

const TIPOS = {
  video: { label: "Vídeo", icon: Clapperboard, cor: "border-violet-500/30 bg-violet-500/10 text-violet-300" },
  design: { label: "Design", icon: ImageIcon, cor: "border-sky-500/30 bg-sky-500/10 text-sky-300" },
  copy: { label: "Copy", icon: TypeIcon, cor: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
} as const;

const PRIORIDADES = {
  baixa: "text-muted-foreground",
  normal: "text-muted-foreground",
  alta: "text-rose-400",
} as const;

const VAZIA: Omit<Demanda, "id"> = {
  client_id: "",
  tipo: "video",
  titulo: "",
  briefing: "",
  status: "backlog",
  prioridade: "normal",
  responsavel_id: null,
  prazo: null,
  link_arquivo: "",
  link_referencia: "",
};

function nomeCurto(pessoa?: Pessoa) {
  if (!pessoa) return "Sem responsável";
  return pessoa.full_name || pessoa.email?.split("@")[0] || "Sem nome";
}

function iniciais(texto: string) {
  const partes = texto.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}

function Cartao({ demanda, clientes, pessoas, onAbrir }: {
  demanda: Demanda;
  clientes: Record<string, Cliente>;
  pessoas: Record<string, Pessoa>;
  onAbrir: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: demanda.id });
  const tipo = TIPOS[demanda.tipo];
  const Icone = tipo.icon;
  const responsavel = demanda.responsavel_id ? pessoas[demanda.responsavel_id] : undefined;

  const atraso = demanda.prazo ? differenceInCalendarDays(new Date(`${demanda.prazo}T00:00:00`), new Date()) : null;
  const atrasada = atraso !== null && atraso < 0 && demanda.status !== "publicado";

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onAbrir}
      className={`cursor-grab rounded-xl border border-border/60 bg-card p-3 shadow-card transition-colors hover:border-primary/40 active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <Badge variant="outline" className={`gap-1 ${tipo.cor}`}>
          <Icone className="h-3 w-3" />
          {tipo.label}
        </Badge>
        {demanda.prioridade === "alta" && (
          <span className="text-[10px] font-bold uppercase tracking-wide text-rose-400">Alta</span>
        )}
      </div>

      <p className="mt-2 text-sm font-medium leading-snug">{demanda.titulo}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        {clientes[demanda.client_id]?.name ?? "Cliente removido"}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2">
        {demanda.prazo ? (
          <span className={`inline-flex items-center gap-1 text-[11px] ${atrasada ? "text-rose-400" : PRIORIDADES[demanda.prioridade]}`}>
            <Calendar className="h-3 w-3" />
            {format(new Date(`${demanda.prazo}T00:00:00`), "dd MMM", { locale: ptBR })}
            {atrasada && ` · ${Math.abs(atraso!)}d atrasado`}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground/50">sem prazo</span>
        )}

        <span
          title={nomeCurto(responsavel)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary"
        >
          {responsavel ? iniciais(nomeCurto(responsavel)) : "—"}
        </span>
      </div>
    </div>
  );
}

function Coluna({ id, label, demandas, children }: {
  id: string;
  label: string;
  demandas: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-[260px] flex-1 flex-col rounded-2xl border p-3 transition-colors ${
        isOver ? "border-primary/50 bg-primary/[0.04]" : "border-border/50 bg-background/40"
      }`}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground/60">{demandas}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}

export default function Producao() {
  const { user, role } = useAuth();
  const podeEditar = role !== "viewer";

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [demandas, setDemandas] = useState<Demanda[]>([]);
  const [loading, setLoading] = useState(true);
  const [semTabela, setSemTabela] = useState(false);
  const [arrastando, setArrastando] = useState<Demanda | null>(null);

  const [filtroCliente, setFiltroCliente] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroResponsavel, setFiltroResponsavel] = useState("todos");

  const [aberta, setAberta] = useState<(Omit<Demanda, "id"> & { id?: string }) | null>(null);
  const [salvando, setSalvando] = useState(false);

  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setLoading(true);
    const [clientesRes, pessoasRes, demandasRes] = await Promise.all([
      supabase.from("clients").select("id, name, logo_url").eq("status", "active").order("name"),
      supabase.from("profiles").select("id, full_name, email"),
      supabase.from("creative_tasks").select("*").order("posicao"),
    ]);

    if (demandasRes.error?.code === "42P01") {
      setSemTabela(true);
      setLoading(false);
      return;
    }

    setClientes((clientesRes.data as Cliente[]) ?? []);
    setPessoas((pessoasRes.data as Pessoa[]) ?? []);
    setDemandas((demandasRes.data as Demanda[]) ?? []);
    setLoading(false);
  }

  const clientesPorId = useMemo(() => Object.fromEntries(clientes.map((c) => [c.id, c])), [clientes]);
  const pessoasPorId = useMemo(() => Object.fromEntries(pessoas.map((p) => [p.id, p])), [pessoas]);

  const visiveis = useMemo(
    () =>
      demandas.filter((d) => {
        if (filtroCliente !== "todos" && d.client_id !== filtroCliente) return false;
        if (filtroTipo !== "todos" && d.tipo !== filtroTipo) return false;
        if (filtroResponsavel === "minhas" && d.responsavel_id !== user?.id) return false;
        if (filtroResponsavel === "sem" && d.responsavel_id) return false;
        if (!["todos", "minhas", "sem"].includes(filtroResponsavel) && d.responsavel_id !== filtroResponsavel)
          return false;
        return true;
      }),
    [demandas, filtroCliente, filtroTipo, filtroResponsavel, user?.id]
  );

  const atrasadas = useMemo(
    () =>
      demandas.filter(
        (d) =>
          d.prazo &&
          d.status !== "publicado" &&
          differenceInCalendarDays(new Date(`${d.prazo}T00:00:00`), new Date()) < 0
      ).length,
    [demandas]
  );

  async function moverPara(id: string, status: Demanda["status"]) {
    const anterior = demandas;
    setDemandas((atual) => atual.map((d) => (d.id === id ? { ...d, status } : d)));
    const { error } = await supabase.from("creative_tasks").update({ status }).eq("id", id);
    if (error) {
      setDemandas(anterior);
      toast.error(error.message);
    }
  }

  function aoSoltar(evento: DragEndEvent) {
    setArrastando(null);
    const destino = evento.over?.id as Demanda["status"] | undefined;
    const id = evento.active.id as string;
    if (!destino) return;
    const demanda = demandas.find((d) => d.id === id);
    if (!demanda || demanda.status === destino) return;
    if (!podeEditar) return toast.error("Seu perfil é somente leitura");
    moverPara(id, destino);
  }

  function aoPegar(evento: DragStartEvent) {
    setArrastando(demandas.find((d) => d.id === evento.active.id) ?? null);
  }

  async function salvar() {
    if (!aberta) return;
    if (!aberta.client_id) return toast.error("Escolha o cliente");
    if (!aberta.titulo.trim()) return toast.error("Dê um título para a demanda");

    setSalvando(true);
    const payload = {
      client_id: aberta.client_id,
      tipo: aberta.tipo,
      titulo: aberta.titulo.trim(),
      briefing: aberta.briefing || null,
      status: aberta.status,
      prioridade: aberta.prioridade,
      responsavel_id: aberta.responsavel_id,
      prazo: aberta.prazo || null,
      link_arquivo: aberta.link_arquivo || null,
      link_referencia: aberta.link_referencia || null,
    };

    const { error } = aberta.id
      ? await supabase.from("creative_tasks").update(payload).eq("id", aberta.id)
      : await supabase.from("creative_tasks").insert(payload);

    setSalvando(false);
    if (error) return toast.error(error.message);
    setAberta(null);
    carregar();
  }

  async function excluir() {
    if (!aberta?.id) return;
    const { error } = await supabase.from("creative_tasks").delete().eq("id", aberta.id);
    if (error) return toast.error(error.message);
    setAberta(null);
    carregar();
  }

  if (semTabela) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <Database className="h-8 w-8 text-muted-foreground" />
          <h2 className="text-base font-semibold">Produção ainda não instalada no banco</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Rode a migration <code className="text-primary">20260812000009_producao_criativa.sql</code> e recarregue.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Cabeçalho ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
            <Clapperboard className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Produção</h1>
            <p className="text-sm text-muted-foreground">
              Fila de vídeo e design da equipe, por cliente.
              {atrasadas > 0 && (
                <span className="ml-1 font-medium text-rose-400">{atrasadas} com prazo estourado.</span>
              )}
            </p>
          </div>
        </div>

        {podeEditar && (
          <Button onClick={() => setAberta({ ...VAZIA })}>
            <Plus className="mr-2 h-4 w-4" />
            Nova demanda
          </Button>
        )}
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={filtroCliente} onValueChange={setFiltroCliente}>
          <SelectTrigger className="sm:w-56"><SelectValue placeholder="Cliente" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os clientes</SelectItem>
            {clientes.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Vídeo e design</SelectItem>
            <SelectItem value="video">Só vídeo</SelectItem>
            <SelectItem value="design">Só design</SelectItem>
            <SelectItem value="copy">Só copy</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filtroResponsavel} onValueChange={setFiltroResponsavel}>
          <SelectTrigger className="sm:w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Toda a equipe</SelectItem>
            <SelectItem value="minhas">Só as minhas</SelectItem>
            <SelectItem value="sem">Sem responsável</SelectItem>
            {pessoas.map((p) => (
              <SelectItem key={p.id} value={p.id}>{nomeCurto(p)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Quadro ──────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex gap-3 overflow-x-auto">
          {COLUNAS.map((c) => (
            <Skeleton key={c.id} className="h-64 min-w-[260px] flex-1 rounded-2xl" />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensores} onDragStart={aoPegar} onDragEnd={aoSoltar}>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {COLUNAS.map((coluna) => {
              const itens = visiveis.filter((d) => d.status === coluna.id);
              return (
                <Coluna key={coluna.id} id={coluna.id} label={coluna.label} demandas={itens.length}>
                  {itens.map((demanda) => (
                    <Cartao
                      key={demanda.id}
                      demanda={demanda}
                      clientes={clientesPorId}
                      pessoas={pessoasPorId}
                      onAbrir={() => podeEditar && setAberta({ ...demanda })}
                    />
                  ))}
                  {itens.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border/50 px-3 py-6 text-center text-[11px] text-muted-foreground/50">
                      arraste um cartão para cá
                    </div>
                  )}
                </Coluna>
              );
            })}
          </div>

          <DragOverlay>
            {arrastando && (
              <div className="rounded-xl border border-primary/40 bg-card p-3 shadow-glow">
                <p className="text-sm font-medium">{arrastando.titulo}</p>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* ── Dialogo ─────────────────────────────────────────────────────── */}
      <Dialog open={Boolean(aberta)} onOpenChange={(v) => !v && setAberta(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{aberta?.id ? "Editar demanda" : "Nova demanda"}</DialogTitle>
          </DialogHeader>

          {aberta && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Cliente</Label>
                  <Select value={aberta.client_id} onValueChange={(v) => setAberta({ ...aberta, client_id: v })}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Escolha" /></SelectTrigger>
                    <SelectContent>
                      {clientes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={aberta.tipo} onValueChange={(v) => setAberta({ ...aberta, tipo: v as Demanda["tipo"] })}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="video">Vídeo</SelectItem>
                      <SelectItem value="design">Design</SelectItem>
                      <SelectItem value="copy">Copy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Título</Label>
                <Input
                  className="mt-1.5"
                  value={aberta.titulo}
                  onChange={(e) => setAberta({ ...aberta, titulo: e.target.value })}
                  placeholder="Ex: 3 reels de oferta da semana"
                />
              </div>

              <div>
                <Label>Briefing</Label>
                <Textarea
                  className="mt-1.5 min-h-24"
                  value={aberta.briefing ?? ""}
                  onChange={(e) => setAberta({ ...aberta, briefing: e.target.value })}
                  placeholder="Formato, duração, oferta, tom, o que não pode faltar..."
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Responsável</Label>
                  <Select
                    value={aberta.responsavel_id ?? "ninguem"}
                    onValueChange={(v) => setAberta({ ...aberta, responsavel_id: v === "ninguem" ? null : v })}
                  >
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ninguem">Sem responsável</SelectItem>
                      {pessoas.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{nomeCurto(p)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Prazo</Label>
                  <Input
                    type="date"
                    className="mt-1.5"
                    value={aberta.prazo ?? ""}
                    onChange={(e) => setAberta({ ...aberta, prazo: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Prioridade</Label>
                  <Select
                    value={aberta.prioridade}
                    onValueChange={(v) => setAberta({ ...aberta, prioridade: v as Demanda["prioridade"] })}
                  >
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baixa">Baixa</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Link da entrega</Label>
                  <Input
                    className="mt-1.5"
                    value={aberta.link_arquivo ?? ""}
                    onChange={(e) => setAberta({ ...aberta, link_arquivo: e.target.value })}
                    placeholder="Drive, Frame.io..."
                  />
                </div>
                <div>
                  <Label>Referência</Label>
                  <Input
                    className="mt-1.5"
                    value={aberta.link_referencia ?? ""}
                    onChange={(e) => setAberta({ ...aberta, link_referencia: e.target.value })}
                    placeholder="Link de inspiração"
                  />
                </div>
              </div>

              {aberta.id && aberta.link_arquivo && (
                <a
                  href={aberta.link_arquivo}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir entrega
                </a>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            {aberta?.id ? (
              <Button variant="ghost" onClick={excluir} className="text-destructive hover:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setAberta(null)}>Cancelar</Button>
              <Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
