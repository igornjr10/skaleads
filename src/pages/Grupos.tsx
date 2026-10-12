import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, LayoutGrid, List, Loader2, MessagesSquare, RefreshCw, Search, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/SearchableSelect";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEstadoDaTela } from "@/hooks/useEstadoDaTela";
import { veTodosOsClientes } from "@/lib/permissoes";
import { cn } from "@/lib/utils";
import {
  FILTROS_PADRAO,
  SEM_RESPONSAVEL,
  contar,
  filtrarLinhas,
  filtrosAtivos,
  montarLinhas,
  ordenarLinhas,
  triagemMaisRecente,
  type ClienteGrupo,
  type FiltroAtividade,
  type FiltroSituacao,
  type FiltrosGrupos,
  type GrupoWhatsapp,
  type Pessoa,
  type Triagem,
} from "@/components/grupos/grupos-logica";
import { GrupoCard, type AcoesGrupoProps } from "@/components/grupos/GrupoCard";
import { GruposTabela } from "@/components/grupos/GruposTabela";

type Visao = "cards" | "lista";

export default function Grupos() {
  const { role } = useAuth();
  const ehAdm = veTodosOsClientes(role);

  const [clientes, setClientes] = useState<ClienteGrupo[]>([]);
  const [triagens, setTriagens] = useState<Map<string, Triagem>>(new Map());
  const [responsaveis, setResponsaveis] = useState<Map<string, Pessoa[]>>(new Map());
  const [grupos, setGrupos] = useState<GrupoWhatsapp[] | null>(null);
  const [carregandoGrupos, setCarregandoGrupos] = useState(false);
  const [erroGrupos, setErroGrupos] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [erroTriagem, setErroTriagem] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState<string | null>(null);
  const [vinculando, setVinculando] = useState<string | null>(null);

  const [filtros, setFiltros] = useEstadoDaTela<FiltrosGrupos>("grupos:filtros", FILTROS_PADRAO);
  const [visao, setVisao] = useEstadoDaTela<Visao>("grupos:visao", "cards");
  const mudar = <K extends keyof FiltrosGrupos>(campo: K, valor: FiltrosGrupos[K]) =>
    setFiltros(f => ({ ...f, [campo]: valor }));

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    const [c, t, a, p] = await Promise.all([
      supabase.from("clients").select("id, name, logo_url, whatsapp_group_jid").eq("status", "active").order("name"),
      supabase.from("grupo_resumos").select("*").order("dia", { ascending: false }),
      supabase.from("client_assignments").select("client_id, user_id"),
      supabase.from("profiles").select("id, full_name, email"),
    ]);

    if (c.error) {
      setErro(c.error.message);
      setCarregando(false);
      return;
    }
    setClientes((c.data as ClienteGrupo[]) ?? []);
    setErroTriagem(t.error ? t.error.message : null);
    setTriagens(triagemMaisRecente((t.data as unknown as Triagem[]) ?? []));

    // Responsavel do grupo = quem tem o cliente na carteira. Sem acesso a
    // essas tabelas a tela segue, so sem os nomes.
    const nomes = new Map(
      ((p.data ?? []) as { id: string; full_name: string | null; email: string | null }[])
        .map(pr => [pr.id, pr.full_name || pr.email || "Sem nome"]),
    );
    const porCliente = new Map<string, Pessoa[]>();
    for (const linha of ((a.data ?? []) as { client_id: string; user_id: string }[])) {
      const lista = porCliente.get(linha.client_id) ?? [];
      if (!lista.some(x => x.id === linha.user_id)) {
        lista.push({ id: linha.user_id, nome: nomes.get(linha.user_id) ?? "Membro da equipe" });
      }
      porCliente.set(linha.client_id, lista);
    }
    porCliente.forEach(l => l.sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR")));
    setResponsaveis(porCliente);
    setCarregando(false);
  }, []);

  const carregarGrupos = useCallback(async () => {
    setCarregandoGrupos(true);
    setErroGrupos(null);
    const { data, error } = await supabase.functions.invoke("list-whatsapp-groups");
    setCarregandoGrupos(false);
    if (error || data?.error) {
      setErroGrupos("Não consegui listar os grupos do WhatsApp");
      toast.error("Não consegui listar os grupos");
      return;
    }
    setGrupos(data?.groups ?? []);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);
  // So ADM lista os grupos do numero (a function recusa os demais); sem a
  // lista a tela mostra os vinculados, so que sem o nome do grupo.
  useEffect(() => { if (ehAdm) carregarGrupos(); }, [ehAdm, carregarGrupos]);

  async function vincular(clientId: string, jid: string, chave: string) {
    setVinculando(chave);
    const { error } = await supabase.from("clients").update({ whatsapp_group_jid: jid }).eq("id", clientId);
    setVinculando(null);
    if (error) { toast.error(error.message); return; }
    setClientes(prev => prev.map(c => (c.id === clientId ? { ...c, whatsapp_group_jid: jid } : c)));
    toast.success("Grupo vinculado");
  }

  async function atualizar(clientId?: string) {
    setAtualizando(clientId ?? "todos");
    try {
      const { data, error } = await supabase.functions.invoke("resumir-grupos", {
        body: clientId ? { clientId } : {},
      });
      if (error) throw new Error(error.message);
      if (data?.erros?.length) throw new Error(data.erros[0]);
      toast.success(clientId ? "Grupo atualizado" : `${data?.analisados ?? 0} grupo(s) atualizados`);
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
    } finally {
      setAtualizando(null);
    }
  }

  const linhas = useMemo(
    () => montarLinhas(clientes, triagens, grupos, responsaveis),
    [clientes, triagens, grupos, responsaveis],
  );
  const contagem = useMemo(() => contar(linhas, grupos !== null), [linhas, grupos]);
  const visiveis = useMemo(() => ordenarLinhas(filtrarLinhas(linhas, filtros)), [linhas, filtros]);
  const clientesSemGrupo = useMemo(() => clientes.filter(c => !c.whatsapp_group_jid), [clientes]);
  const pessoas = useMemo(() => {
    const m = new Map<string, Pessoa>();
    responsaveis.forEach(lista => lista.forEach(pe => m.set(pe.id, pe)));
    return [...m.values()].sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR"));
  }, [responsaveis]);
  const temFiltro = filtrosAtivos(filtros);

  const acoes: AcoesGrupoProps = {
    atualizando,
    vinculando,
    grupos,
    carregandoGrupos,
    clientesSemGrupo,
    onAtualizar: id => atualizar(id),
    onVincular: vincular,
    onCarregarGrupos: carregarGrupos,
  };

  const contadores: { rotulo: string; valor: number | null; ativo: boolean; aplicar: () => void; dica: string }[] = [
    {
      rotulo: "Total", valor: contagem.total, dica: "Grupos do número da agência",
      ativo: filtros.situacao === "todas" && filtros.atividade === "todas",
      aplicar: () => setFiltros(f => ({ ...f, situacao: "todas", atividade: "todas" })),
    },
    {
      rotulo: "Com cliente", valor: contagem.vinculados, dica: "Grupos vinculados a um cliente",
      ativo: filtros.situacao === "vinculado" && filtros.atividade === "todas",
      aplicar: () => setFiltros(f => ({ ...f, situacao: "vinculado", atividade: "todas" })),
    },
    {
      rotulo: "Sem cliente", valor: contagem.semCliente, dica: "Grupos que nenhum cliente usa",
      ativo: filtros.situacao === "sem_cliente",
      aplicar: () => setFiltros(f => ({ ...f, situacao: "sem_cliente", atividade: "todas" })),
    },
    {
      rotulo: "Ativos 24h", valor: contagem.recentes, dica: "Mensagem nas últimas 24 horas",
      ativo: filtros.atividade === "recente",
      aplicar: () => setFiltros(f => ({ ...f, situacao: "vinculado", atividade: "recente" })),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <MessagesSquare className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Grupos</h1>
            <p className="text-sm text-muted-foreground">
              {carregando
                ? "Lendo os grupos dos clientes..."
                : contagem.esperando > 0
                  ? `${contagem.esperando} cliente(s) esperando resposta`
                  : "Nenhum cliente esperando resposta"}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => atualizar()}
          disabled={!!atualizando || carregando}
        >
          {atualizando === "todos"
            ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
          Atualizar tudo
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {contadores.map(k => (
          <button
            key={k.rotulo}
            type="button"
            onClick={k.aplicar}
            title={k.dica}
            className={cn(
              "min-w-0 rounded-xl border px-3 py-2 text-left transition-colors",
              k.ativo
                ? "border-primary/40 bg-primary/10"
                : "border-border/60 bg-card/40 hover:border-border hover:bg-card/70",
            )}
          >
            <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{k.rotulo}</p>
            <div className={cn("text-lg font-semibold tabular-nums", k.ativo && "text-primary")}>
              {carregando ? <Skeleton className="mt-1 h-5 w-8" /> : k.valor ?? "—"}
            </div>
          </button>
        ))}
      </div>

      <div className="space-y-3 rounded-2xl border border-border/60 bg-card/40 p-3 sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filtros.busca}
              onChange={e => mudar("busca", e.target.value)}
              placeholder="Buscar grupo, cliente ou responsável"
              className="h-9 pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            {temFiltro && (
              <Button variant="ghost" size="sm" className="h-9" onClick={() => setFiltros(FILTROS_PADRAO)}>
                <X className="mr-1.5 h-3.5 w-3.5" /> Limpar
              </Button>
            )}
            <ToggleGroup
              type="single"
              value={visao}
              onValueChange={v => v && setVisao(v as Visao)}
              className="ml-auto hidden rounded-lg border border-border/60 p-0.5 md:flex"
            >
              <ToggleGroupItem value="cards" size="sm" className="h-8 px-2.5" aria-label="Ver em cards">
                <LayoutGrid className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="lista" size="sm" className="h-8 px-2.5" aria-label="Ver em lista">
                <List className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-4">
          <SearchableSelect
            className="h-9 min-w-0 text-sm"
            options={[
              { value: "todos", label: "Todos os clientes" },
              ...clientes.map(c => ({ value: c.id, label: c.name })),
            ]}
            value={filtros.clienteId}
            onChange={v => mudar("clienteId", v || "todos")}
            placeholder="Cliente"
            searchPlaceholder="Buscar cliente"
          />
          <Select value={filtros.responsavelId} onValueChange={v => mudar("responsavelId", v)}>
            <SelectTrigger className="h-9 min-w-0 text-sm"><SelectValue placeholder="Responsável" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os responsáveis</SelectItem>
              <SelectItem value={SEM_RESPONSAVEL}>Sem responsável</SelectItem>
              {pessoas.map(pe => <SelectItem key={pe.id} value={pe.id}>{pe.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtros.situacao} onValueChange={v => mudar("situacao", v as FiltroSituacao)}>
            <SelectTrigger className="h-9 min-w-0 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="vinculado">Com cliente</SelectItem>
              <SelectItem value="sem_grupo">Cliente sem grupo</SelectItem>
              <SelectItem value="sem_cliente">Grupo sem cliente</SelectItem>
              <SelectItem value="todas">Todas as situações</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtros.atividade} onValueChange={v => mudar("atividade", v as FiltroAtividade)}>
            <SelectTrigger className="h-9 min-w-0 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Qualquer atividade</SelectItem>
              <SelectItem value="esperando">Esperando resposta</SelectItem>
              <SelectItem value="urgente">Urgentes</SelectItem>
              <SelectItem value="recente">Ativos nas últimas 24h</SelectItem>
              <SelectItem value="sem_leitura">Ainda sem leitura</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {erroTriagem && !erro && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 break-words">
            A leitura dos grupos não carregou agora; os vínculos aparecem, mas sem o status das conversas.
          </span>
        </div>
      )}

      {(filtros.situacao === "sem_grupo" || filtros.situacao === "sem_cliente") && !erro && (
        <p className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
          O vínculo automático só casa nome idêntico. Estes precisam da sua escolha —
          chutar por semelhança já mandou dois clientes para o mesmo grupo.
          {filtros.situacao === "sem_cliente" && contagem.semCliente === null && (
            <> {erroGrupos ?? (carregandoGrupos ? "Carregando grupos do WhatsApp..." : "Só administradores veem os grupos do número da agência.")}</>
          )}
        </p>
      )}

      {carregando ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-2xl border border-border/60 bg-card/60 p-4">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-7 w-1/2" />
              <Skeleton className="h-16 w-full" />
            </div>
          ))}
        </div>
      ) : erro ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 py-12 text-center">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
          <div>
            <p className="font-medium">Não deu para carregar os grupos</p>
            <p className="break-words text-sm text-muted-foreground">{erro}</p>
          </div>
          <Button variant="outline" size="sm" onClick={carregar}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Tentar de novo
          </Button>
        </div>
      ) : visiveis.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/70 px-4 py-12 text-center">
          <MessagesSquare className="h-6 w-6 text-muted-foreground" />
          {temFiltro && linhas.length > 0 ? (
            <>
              <div>
                <p className="font-medium">Nenhum grupo com esses filtros</p>
                <p className="text-sm text-muted-foreground">Tente outra busca ou volte ao padrão.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setFiltros(FILTROS_PADRAO)}>
                <X className="mr-1.5 h-3.5 w-3.5" /> Limpar filtros
              </Button>
            </>
          ) : (
            <>
              <div>
                <p className="font-medium">Nenhum grupo vinculado ainda</p>
                <p className="text-sm text-muted-foreground">
                  Vincule o grupo do WhatsApp de cada cliente para acompanhar quem está esperando resposta.
                </p>
              </div>
              {contagem.semGrupo > 0 && (
                <Button variant="outline" size="sm" onClick={() => mudar("situacao", "sem_grupo")}>
                  Ver {contagem.semGrupo} cliente(s) sem grupo
                </Button>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3", visao === "lista" && "md:hidden")}>
            {visiveis.map(l => <GrupoCard key={l.chave} linha={l} acoes={acoes} />)}
          </div>
          {visao === "lista" && (
            <div className="hidden md:block">
              <GruposTabela linhas={visiveis} acoes={acoes} />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {visiveis.length} de {linhas.length} item(ns)
            {filtros.situacao === "vinculado" && contagem.semGrupo > 0 && (
              <>
                {" · "}
                <button type="button" className="underline-offset-2 hover:underline" onClick={() => mudar("situacao", "sem_grupo")}>
                  {contagem.semGrupo} cliente(s) sem grupo
                </button>
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}
