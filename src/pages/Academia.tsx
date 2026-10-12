import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, BookOpen, CheckCircle2, ChevronRight, Circle, Clock, FileText,
  GraduationCap, Link2, Pencil, Plus, PlayCircle, RefreshCw, Trash2, Type, Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AulaDialog } from "@/components/academia/AulaDialog";
import { AulaViewer } from "@/components/academia/AulaViewer";
import { ModuloDialog } from "@/components/academia/ModuloDialog";
import { type PessoaAcademia, ProgressoEquipe } from "@/components/academia/ProgressoEquipe";
import { useAuth } from "@/hooks/useAuth";
import { useEstadoDaTela } from "@/hooks/useEstadoDaTela";
import { buscarTudo } from "@/lib/buscar-tudo";
import { veTodosOsClientes } from "@/lib/permissoes";
import { errorMessage } from "@/lib/utils";
import {
  type AulaAcademia, type CategoriaAcademia, type ModuloAcademia, type ProgressoAula, type TipoAula,
  CATEGORIAS, alternarIndice, aulasDoModulo, concluidasDe, formatarDuracao, mover, ordenarPorOrdem, paraAula, paraModulo,
  paraProgresso, progressoDoModulo, progressoGeral, proximaOrdem, tabelaAusente, tipoLabel, vizinhas,
} from "@/lib/academia";

type Aba = "trilha" | "equipe";
type Exclusao = { tipo: "modulo"; item: ModuloAcademia } | { tipo: "aula"; item: AulaAcademia };

const ICONE_TIPO: Record<TipoAula, typeof PlayCircle> = {
  video: PlayCircle,
  pdf: FileText,
  link: Link2,
  texto: Type,
};

function Cabecalho({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <GraduationCap className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Academia</h1>
          <p className="text-sm text-muted-foreground">Aulas, materiais e procedimentos da agência, no padrão do time.</p>
        </div>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

function BarraProgresso({ pct, concluidas, total }: { pct: number; concluidas: number; total: number }) {
  return (
    <div className="space-y-1">
      <Progress value={pct} className="h-1.5" />
      <div className="flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
        <span>{concluidas}/{total} aulas</span>
        <span className={pct >= 100 ? "font-semibold text-primary" : ""}>{pct}%</span>
      </div>
    </div>
  );
}

function BotoesOrdem({ onSubir, onDescer, podeSubir, podeDescer }: { onSubir: () => void; onDescer: () => void; podeSubir: boolean; podeDescer: boolean }) {
  return (
    <div className="flex shrink-0">
      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!podeSubir} onClick={onSubir} aria-label="Mover para cima">
        <ArrowUp className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!podeDescer} onClick={onDescer} aria-label="Mover para baixo">
        <ArrowDown className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default function Academia() {
  const { user, role } = useAuth();
  const isAdmin = veTodosOsClientes(role);
  const userId = user?.id ?? "";

  const [modulos, setModulos] = useState<ModuloAcademia[]>([]);
  const [aulas, setAulas] = useState<AulaAcademia[]>([]);
  const [progresso, setProgresso] = useState<ProgressoAula[]>([]);
  const [pessoas, setPessoas] = useState<PessoaAcademia[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [semTabela, setSemTabela] = useState(false);
  const garantiu = useRef(false);

  const [aba, setAba] = useEstadoDaTela<Aba>("academia:aba", "trilha");
  const [categoria, setCategoria] = useEstadoDaTela<CategoriaAcademia | "todas">("academia:categoria", "todas");
  const [moduloId, setModuloId] = useEstadoDaTela<string | null>("academia:modulo", null);
  const [aulaId, setAulaId] = useEstadoDaTela<string | null>("academia:aula", null);
  const [editando, setEditando] = useState(false);

  const [moduloDialog, setModuloDialog] = useState<{ open: boolean; modulo: ModuloAcademia | null }>({ open: false, modulo: null });
  const [aulaDialog, setAulaDialog] = useState<{ open: boolean; aula: AulaAcademia | null; moduloId: string }>({ open: false, aula: null, moduloId: "" });
  const [exclusao, setExclusao] = useState<Exclusao | null>(null);
  const [salvandoAula, setSalvandoAula] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setErro(null);
    try {
      let modRes = await supabase.from("academia_modulos").select("id, titulo, descricao, categoria, ordem, created_at").order("ordem");
      if (tabelaAusente(modRes.error)) {
        setSemTabela(true);
        return;
      }
      if (modRes.error) throw modRes.error;

      // A trilha padrao nasce na 1a visita de um ADM; o RPC e idempotente.
      if (isAdmin && !modRes.data.length && !garantiu.current) {
        garantiu.current = true;
        const { error } = await supabase.rpc("garantir_academia");
        if (!error) modRes = await supabase.from("academia_modulos").select("id, titulo, descricao, categoria, ordem, created_at").order("ordem");
        if (modRes.error) throw modRes.error;
      }

      const [aulasRes, progressoRows, papeisRes, perfisRes] = await Promise.all([
        supabase.from("academia_aulas").select("id, modulo_id, titulo, descricao, tipo, url, conteudo, duracao_min, checklist, ordem, created_at").order("ordem"),
        buscarTudo<{ aula_id: string; user_id: string; concluida_em: string | null; checklist_feitos: unknown; updated_at: string }>((de, ate) => {
          const q = supabase.from("academia_progresso").select("aula_id, user_id, concluida_em, checklist_feitos, updated_at");
          return (isAdmin ? q : q.eq("user_id", userId)).order("aula_id").order("user_id").range(de, ate);
        }),
        isAdmin ? supabase.from("user_roles").select("user_id, role") : Promise.resolve({ data: [], error: null }),
        isAdmin ? supabase.from("profiles").select("id, full_name, email") : Promise.resolve({ data: [], error: null }),
      ]);
      if (aulasRes.error) throw aulasRes.error;

      const papeis = new Map(((papeisRes.data ?? []) as { user_id: string; role: string }[]).map(r => [r.user_id, r.role]));
      const equipe = ((perfisRes.data ?? []) as { id: string; full_name: string | null; email: string | null }[])
        .map(p => ({ id: p.id, nome: p.full_name || p.email || p.id.slice(0, 8), role: papeis.get(p.id) ?? "viewer" }))
        .sort((a, b) => a.nome.localeCompare(b.nome));

      setModulos((modRes.data ?? []).map(paraModulo));
      setAulas((aulasRes.data ?? []).map(paraAula));
      setProgresso(progressoRows.map(paraProgresso));
      setPessoas(equipe);
      setSemTabela(false);
    } catch (e) {
      if (tabelaAusente(e)) setSemTabela(true);
      else setErro(errorMessage(e, "Não foi possível carregar a Academia"));
    } finally {
      setLoading(false);
    }
  }, [userId, isAdmin]);

  useEffect(() => { carregar(); }, [carregar]);

  const meuProgresso = useMemo(
    () => new Map(progresso.filter(p => p.user_id === userId).map(p => [p.aula_id, p])),
    [progresso, userId]
  );
  const minhasConcluidas = useMemo(() => concluidasDe(progresso, userId), [progresso, userId]);
  const geral = useMemo(() => progressoGeral(aulas, minhasConcluidas), [aulas, minhasConcluidas]);
  const modulosOrdenados = useMemo(() => ordenarPorOrdem(modulos), [modulos]);

  const moduloAtual = moduloId ? modulos.find(m => m.id === moduloId) ?? null : null;
  const aulaAtual = aulaId ? aulas.find(a => a.id === aulaId) ?? null : null;

  // Item apagado (ou de outra empresa no sessionStorage) nao pode prender a tela.
  useEffect(() => {
    if (loading) return;
    if (moduloId && !moduloAtual) setModuloId(null);
    if (aulaId && !aulaAtual) setAulaId(null);
  }, [loading, moduloId, moduloAtual, aulaId, aulaAtual, setModuloId, setAulaId]);

  useEffect(() => {
    if (!isAdmin && aba === "equipe") setAba("trilha");
  }, [isAdmin, aba, setAba]);

  async function salvarProgresso(aulaIdAlvo: string, mudanca: { concluida_em?: string | null; checklist_feitos?: number[] }) {
    const atual = meuProgresso.get(aulaIdAlvo);
    const novo: ProgressoAula = {
      aula_id: aulaIdAlvo,
      user_id: userId,
      concluida_em: mudanca.concluida_em !== undefined ? mudanca.concluida_em : atual?.concluida_em ?? null,
      checklist_feitos: mudanca.checklist_feitos ?? atual?.checklist_feitos ?? [],
      updated_at: new Date().toISOString(),
    };
    const anterior = progresso;
    setProgresso(lista => [...lista.filter(p => !(p.aula_id === aulaIdAlvo && p.user_id === userId)), novo]);
    setSalvandoAula(aulaIdAlvo);
    const { error } = await supabase.from("academia_progresso").upsert(
      { aula_id: novo.aula_id, user_id: novo.user_id, concluida_em: novo.concluida_em, checklist_feitos: novo.checklist_feitos },
      { onConflict: "aula_id,user_id" }
    );
    setSalvandoAula(null);
    if (error) {
      setProgresso(anterior);
      toast.error(errorMessage(error, "Não foi possível salvar seu progresso"));
      return false;
    }
    return true;
  }

  async function alternarConcluida(aula: AulaAcademia) {
    const concluida = minhasConcluidas.has(aula.id);
    const ok = await salvarProgresso(aula.id, { concluida_em: concluida ? null : new Date().toISOString() });
    if (ok && !concluida) {
      const { proxima } = vizinhas(aulas, aula.id);
      toast.success("Aula concluída", proxima ? { action: { label: "Próxima aula", onClick: () => setAulaId(proxima.id) } } : undefined);
    }
  }

  async function reordenar(tabela: "academia_modulos" | "academia_aulas", grupo: { id: string; ordem: number; titulo: string; created_at: string }[], id: string, direcao: -1 | 1) {
    const mudancas = mover(grupo, id, direcao);
    if (!mudancas.length) return;
    const novaOrdem = new Map(mudancas.map(m => [m.id, m.ordem]));
    const aplicar = <T extends { id: string; ordem: number }>(lista: T[]) => lista.map(x => (novaOrdem.has(x.id) ? { ...x, ordem: novaOrdem.get(x.id)! } : x));
    if (tabela === "academia_modulos") setModulos(aplicar);
    else setAulas(aplicar);
    const resultados = await Promise.all(mudancas.map(m => supabase.from(tabela).update({ ordem: m.ordem }).eq("id", m.id)));
    const falha = resultados.find(r => r.error);
    if (falha) {
      toast.error(errorMessage(falha.error, "Não foi possível reordenar"));
      carregar();
    }
  }

  async function confirmarExclusao() {
    if (!exclusao) return;
    const { tipo, item } = exclusao;
    const { error } = tipo === "modulo"
      ? await supabase.from("academia_modulos").delete().eq("id", item.id)
      : await supabase.from("academia_aulas").delete().eq("id", item.id);
    setExclusao(null);
    if (error) {
      toast.error(errorMessage(error, "Não foi possível excluir"));
      return;
    }
    if (tipo === "modulo") {
      setModulos(l => l.filter(m => m.id !== item.id));
      setAulas(l => l.filter(a => a.modulo_id !== item.id));
      if (moduloId === item.id) setModuloId(null);
    } else {
      setAulas(l => l.filter(a => a.id !== item.id));
      if (aulaId === item.id) setAulaId(null);
    }
    toast.success(tipo === "modulo" ? "Módulo excluído" : "Aula excluída");
  }

  function abrirModulo(id: string) {
    setModuloId(id);
    setAulaId(null);
    window.scrollTo({ top: 0 });
  }

  function abrirAula(id: string) {
    const aula = aulas.find(a => a.id === id);
    if (aula) setModuloId(aula.modulo_id);
    setAulaId(id);
    window.scrollTo({ top: 0 });
  }

  if (semTabela) {
    return (
      <div className="space-y-6">
        <Cabecalho />
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-8 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <div className="font-semibold">A Academia ainda não foi ativada: falta aplicar a migration</div>
          <p className="max-w-md text-sm text-muted-foreground">
            Peça ao responsável técnico para rodar <code className="break-all rounded bg-muted px-1">20261012130000_academia.sql</code> no banco.
          </p>
          <Button variant="outline" onClick={carregar}><RefreshCw className="mr-2 h-4 w-4" /> Verificar de novo</Button>
        </div>
      </div>
    );
  }

  if (loading && !modulos.length) {
    return (
      <div className="space-y-6">
        <Cabecalho />
        <Skeleton className="h-24 rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="space-y-6">
        <Cabecalho />
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <p className="max-w-md break-words text-sm">{erro}</p>
          <Button variant="outline" onClick={carregar}><RefreshCw className="mr-2 h-4 w-4" /> Tentar de novo</Button>
        </div>
      </div>
    );
  }

  const acoesCabecalho = isAdmin && aba === "trilha" && (
    <>
      <Button variant={editando ? "default" : "outline"} onClick={() => setEditando(v => !v)}>
        <Pencil className="mr-2 h-4 w-4" /> {editando ? "Concluir edição" : "Editar conteúdo"}
      </Button>
      {editando && !moduloAtual && (
        <Button variant="outline" onClick={() => setModuloDialog({ open: true, modulo: null })}>
          <Plus className="mr-2 h-4 w-4" /> Novo módulo
        </Button>
      )}
    </>
  );

  function renderTrilha() {
    if (aulaAtual && moduloAtual) {
      const { anterior, proxima } = vizinhas(aulas, aulaAtual.id);
      const meu = meuProgresso.get(aulaAtual.id);
      return (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setAulaId(null)} className="-ml-2 max-w-full">
            <ArrowLeft className="mr-2 h-4 w-4 shrink-0" /> <span className="truncate">{moduloAtual.titulo}</span>
          </Button>
          <AulaViewer
            aula={aulaAtual}
            moduloTitulo={moduloAtual.titulo}
            concluida={minhasConcluidas.has(aulaAtual.id)}
            checklistFeitos={meu?.checklist_feitos ?? []}
            salvando={salvandoAula === aulaAtual.id}
            anterior={anterior}
            proxima={proxima}
            podeEditar={isAdmin}
            onAlternarItem={i => salvarProgresso(aulaAtual.id, { checklist_feitos: alternarIndice(meu?.checklist_feitos ?? [], i) })}
            onAlternarConcluida={() => alternarConcluida(aulaAtual)}
            onAbrir={abrirAula}
            onEditar={() => setAulaDialog({ open: true, aula: aulaAtual, moduloId: aulaAtual.modulo_id })}
          />
        </div>
      );
    }

    if (moduloAtual) {
      const lista = aulasDoModulo(aulas, moduloAtual.id);
      const prog = progressoDoModulo(aulas, moduloAtual.id, minhasConcluidas);
      const duracaoTotal = formatarDuracao(lista.reduce((s, a) => s + (a.duracao_min ?? 0), 0));
      const primeiraPendente = lista.find(a => !minhasConcluidas.has(a.id));
      return (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setModuloId(null)} className="-ml-2">
            <ArrowLeft className="mr-2 h-4 w-4" /> Todos os módulos
          </Button>
          <div className="space-y-3 rounded-2xl border border-border/60 bg-card/60 p-4 shadow-card sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <Badge variant="secondary" className="mb-2">{CATEGORIAS.find(c => c.id === moduloAtual.categoria)?.label}</Badge>
                <h2 className="break-words text-xl font-semibold sm:text-2xl">{moduloAtual.titulo}</h2>
                {moduloAtual.descricao && <p className="mt-1 break-words text-sm text-muted-foreground">{moduloAtual.descricao}</p>}
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>{lista.length} {lista.length === 1 ? "aula" : "aulas"}</span>
                  {duracaoTotal && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {duracaoTotal}</span>}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {editando && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setModuloDialog({ open: true, modulo: moduloAtual })}>
                      <Pencil className="mr-2 h-4 w-4" /> Editar módulo
                    </Button>
                    <Button size="sm" onClick={() => setAulaDialog({ open: true, aula: null, moduloId: moduloAtual.id })}>
                      <Plus className="mr-2 h-4 w-4" /> Nova aula
                    </Button>
                  </>
                )}
                {!editando && primeiraPendente && (
                  <Button size="sm" onClick={() => abrirAula(primeiraPendente.id)}>
                    <PlayCircle className="mr-2 h-4 w-4" /> {prog.concluidas ? "Continuar" : "Começar"}
                  </Button>
                )}
              </div>
            </div>
            {lista.length > 0 && <BarraProgresso {...prog} />}
          </div>

          {!lista.length ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
              <BookOpen className="h-6 w-6" />
              {isAdmin ? "Este módulo ainda não tem aulas. Adicione vídeos, PDFs ou textos com o link do Drive." : "Este módulo ainda não tem aulas. Em breve!"}
              {isAdmin && (
                <Button size="sm" onClick={() => setAulaDialog({ open: true, aula: null, moduloId: moduloAtual.id })}>
                  <Plus className="mr-2 h-4 w-4" /> Nova aula
                </Button>
              )}
            </div>
          ) : (
            <ol className="space-y-2">
              {lista.map((aula, i) => {
                const Icone = ICONE_TIPO[aula.tipo];
                const feita = minhasConcluidas.has(aula.id);
                const duracao = formatarDuracao(aula.duracao_min);
                return (
                  <li key={aula.id} className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card/60 p-2 pr-3 transition-colors hover:border-primary/40">
                    <button type="button" onClick={() => abrirAula(aula.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 text-left">
                      {feita
                        ? <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                        : <Circle className="h-5 w-5 shrink-0 text-muted-foreground/60" />}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium" title={aula.titulo}>
                          <span className="mr-1 tabular-nums text-muted-foreground">{i + 1}.</span>{aula.titulo}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><Icone className="h-3.5 w-3.5" /> {tipoLabel(aula.tipo)}</span>
                          {duracao && <span>{duracao}</span>}
                          {aula.checklist.length > 0 && <span>{aula.checklist.length} itens no checklist</span>}
                        </div>
                      </div>
                      {!editando && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    </button>
                    {editando && (
                      <div className="flex shrink-0 items-center">
                        <BotoesOrdem
                          podeSubir={i > 0}
                          podeDescer={i < lista.length - 1}
                          onSubir={() => reordenar("academia_aulas", lista, aula.id, -1)}
                          onDescer={() => reordenar("academia_aulas", lista, aula.id, 1)}
                        />
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Editar aula" onClick={() => setAulaDialog({ open: true, aula, moduloId: aula.modulo_id })}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label="Excluir aula" onClick={() => setExclusao({ tipo: "aula", item: aula })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      );
    }

    if (!modulos.length) {
      return (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
          <GraduationCap className="h-8 w-8" />
          {isAdmin
            ? "Nenhum módulo ainda. Crie o primeiro para começar a montar a trilha da equipe."
            : "A Academia ainda não tem conteúdo. Um administrador precisa cadastrar os módulos."}
          {isAdmin && (
            <Button size="sm" onClick={() => setModuloDialog({ open: true, modulo: null })}>
              <Plus className="mr-2 h-4 w-4" /> Novo módulo
            </Button>
          )}
        </div>
      );
    }

    const categoriasUsadas = CATEGORIAS.filter(c => modulos.some(m => m.categoria === c.id));
    const visiveis = categoriasUsadas.filter(c => categoria === "todas" || c.id === categoria);

    return (
      <div className="space-y-6">
        <div className="space-y-3 rounded-2xl border border-border/60 bg-card/60 p-4 shadow-card sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Seu progresso geral</div>
              <div className="text-2xl font-semibold tabular-nums">{geral.pct}%</div>
            </div>
            <div className="text-sm text-muted-foreground">{geral.concluidas} de {geral.total} aulas concluídas</div>
          </div>
          <Progress value={geral.pct} className="h-2" />
        </div>

        {categoriasUsadas.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={categoria === "todas" ? "default" : "outline"} className="rounded-full" onClick={() => setCategoria("todas")}>Todas</Button>
            {categoriasUsadas.map(c => (
              <Button key={c.id} size="sm" variant={categoria === c.id ? "default" : "outline"} className="rounded-full" onClick={() => setCategoria(c.id)}>
                {c.label}
              </Button>
            ))}
          </div>
        )}

        {(visiveis.length ? visiveis : categoriasUsadas).map(cat => {
          const doGrupo = modulosOrdenados.filter(m => m.categoria === cat.id);
          return (
            <section key={cat.id} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{cat.label}</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {doGrupo.map((m, i) => {
                  const prog = progressoDoModulo(aulas, m.id, minhasConcluidas);
                  return (
                    <div key={m.id} className="flex min-w-0 flex-col rounded-2xl border border-border/60 bg-card/60 shadow-card transition-colors hover:border-primary/40">
                      <button type="button" onClick={() => abrirModulo(m.id)} className="flex min-w-0 flex-1 flex-col gap-3 p-4 text-left">
                        <div className="flex items-start gap-3">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${prog.pct >= 100 && prog.total ? "bg-primary/15 text-primary ring-primary/30" : "bg-muted/50 text-muted-foreground ring-border/60"}`}>
                            {prog.pct >= 100 && prog.total ? <CheckCircle2 className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
                          </div>
                          <div className="min-w-0">
                            <div className="line-clamp-2 break-words font-semibold leading-snug" title={m.titulo}>{m.titulo}</div>
                            {m.descricao && <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">{m.descricao}</p>}
                          </div>
                        </div>
                        <div className="mt-auto">
                          {prog.total ? <BarraProgresso {...prog} /> : <div className="text-xs text-muted-foreground">Sem aulas ainda</div>}
                        </div>
                      </button>
                      {editando && (
                        <div className="flex items-center justify-between border-t border-border/60 px-2 py-1">
                          <BotoesOrdem
                            podeSubir={i > 0}
                            podeDescer={i < doGrupo.length - 1}
                            onSubir={() => reordenar("academia_modulos", doGrupo, m.id, -1)}
                            onDescer={() => reordenar("academia_modulos", doGrupo, m.id, 1)}
                          />
                          <div className="flex">
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Editar módulo" onClick={() => setModuloDialog({ open: true, modulo: m })}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label="Excluir módulo" onClick={() => setExclusao({ tipo: "modulo", item: m })}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  const aulasDaExclusao = exclusao?.tipo === "modulo" ? aulas.filter(a => a.modulo_id === exclusao.item.id).length : 0;

  return (
    <div className="space-y-6">
      <Cabecalho>{acoesCabecalho}</Cabecalho>

      {isAdmin ? (
        <Tabs value={aba} onValueChange={v => setAba(v as Aba)}>
          <TabsList>
            <TabsTrigger value="trilha"><BookOpen className="mr-2 h-4 w-4" /> Trilha</TabsTrigger>
            <TabsTrigger value="equipe"><Users className="mr-2 h-4 w-4" /> Progresso da equipe</TabsTrigger>
          </TabsList>
          <TabsContent value="trilha" className="mt-4">{renderTrilha()}</TabsContent>
          <TabsContent value="equipe" className="mt-4">
            <ProgressoEquipe pessoas={pessoas} modulos={modulos} aulas={aulas} progresso={progresso} />
          </TabsContent>
        </Tabs>
      ) : renderTrilha()}

      <ModuloDialog
        open={moduloDialog.open}
        onOpenChange={open => setModuloDialog(s => ({ ...s, open }))}
        modulo={moduloDialog.modulo}
        ordemSugerida={proximaOrdem(modulos)}
        onSalvo={carregar}
      />
      <AulaDialog
        open={aulaDialog.open}
        onOpenChange={open => setAulaDialog(s => ({ ...s, open }))}
        aula={aulaDialog.aula}
        moduloId={aulaDialog.moduloId}
        modulos={modulosOrdenados}
        ordemSugerida={proximaOrdem(aulas.filter(a => a.modulo_id === aulaDialog.moduloId))}
        onSalvo={carregar}
      />
      <AlertDialog open={!!exclusao} onOpenChange={open => !open && setExclusao(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{exclusao?.tipo === "modulo" ? "Excluir módulo?" : "Excluir aula?"}</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              "{exclusao?.item.titulo}" será {exclusao?.tipo === "modulo" ? "excluído" : "excluída"}
              {exclusao?.tipo === "modulo" && aulasDaExclusao > 0 && ` junto com ${aulasDaExclusao} ${aulasDaExclusao === 1 ? "aula" : "aulas"}`}
              {" "}e o progresso da equipe nele será perdido. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarExclusao} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
