import type { Tables } from "@/integrations/supabase/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Library, Plus, RefreshCw, Search, Star, User as UserIcon, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchableSelect } from "@/components/SearchableSelect";
import { IdeiaCard, type ClienteResumo } from "@/components/biblioteca/IdeiaCard";
import { IdeiaDetalhe } from "@/components/biblioteca/IdeiaDetalhe";
import { IdeiaFormDialog } from "@/components/biblioteca/IdeiaFormDialog";
import type { Ideia } from "@/components/biblioteca/comum";
import { useUrlsAssinadas } from "@/components/biblioteca/useUrlsAssinadas";
import { useAuth } from "@/hooks/useAuth";
import { useEstadoDaTela } from "@/hooks/useEstadoDaTela";
import { buscarTudo } from "@/lib/buscar-tudo";
import {
  CATEGORIAS_IDEIA, FILTROS_INICIAIS, PLATAFORMAS, SEM_CLIENTE, TIPOS_CRIATIVO, TODOS,
  contarPorCategoria, faltaMigration, filtrarIdeias, filtrosAtivos, tipoDoArquivo, type FiltrosIdeia,
} from "@/lib/biblioteca";
import { veTodosOsClientes } from "@/lib/permissoes";
import { cn, errorMessage } from "@/lib/utils";

const POR_PAGINA = 60;

type Estado = "carregando" | "pronto" | "erro" | "sem_tabela";

export default function Biblioteca() {
  const { user, role } = useAuth();
  const isAdmin = veTodosOsClientes(role);

  const [ideias, setIdeias] = useState<Ideia[]>([]);
  const [clientes, setClientes] = useState<ClienteResumo[]>([]);
  const [autores, setAutores] = useState<Map<string, string>>(new Map());
  const [estado, setEstado] = useState<Estado>("carregando");
  const [erro, setErro] = useState("");

  const [salvos, setFiltros] = useEstadoDaTela<FiltrosIdeia>("biblioteca:filtros", FILTROS_INICIAIS);
  const filtros = useMemo(() => ({ ...FILTROS_INICIAIS, ...salvos }), [salvos]);
  const mudar = (parcial: Partial<FiltrosIdeia>) => setFiltros(atual => ({ ...FILTROS_INICIAIS, ...atual, ...parcial }));

  const [limite, setLimite] = useState(POR_PAGINA);
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<Ideia | null>(null);

  const carregar = useCallback(async () => {
    setEstado("carregando");
    try {
      const [lista, clientesRes, perfisRes, favRes] = await Promise.all([
        buscarTudo<Tables<"ideias">>((de, ate) =>
          supabase.from("ideias").select("*").order("created_at", { ascending: false }).range(de, ate)),
        supabase.from("clients").select("id, name, logo_url").neq("status", "archived").order("name"),
        supabase.from("profiles").select("id, full_name, email"),
        // Favorita e de cada pessoa: a RLS so devolve as de quem esta logado.
        supabase.from("ideia_favoritas").select("ideia_id"),
      ]);
      const minhas = new Set((favRes.data ?? []).map(f => f.ideia_id));
      setIdeias(lista.map(i => ({ ...i, favorita: minhas.has(i.id) })));
      setClientes(clientesRes.data ?? []);
      setAutores(new Map((perfisRes.data ?? []).map(p => [p.id, p.full_name || p.email || "Alguém da equipe"])));
      setEstado("pronto");
    } catch (e) {
      if (faltaMigration(e)) {
        setEstado("sem_tabela");
        return;
      }
      setErro(errorMessage(e, "Não foi possível carregar a biblioteca"));
      setEstado("erro");
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const clientePorId = useMemo(() => new Map(clientes.map(c => [c.id, c])), [clientes]);

  const visiveis = useMemo(
    () => filtrarIdeias(ideias, filtros, { usuarioId: user?.id, nomeDoCliente: id => clientePorId.get(id)?.name }),
    [ideias, filtros, user?.id, clientePorId],
  );

  useEffect(() => {
    setLimite(POR_PAGINA);
  }, [filtros]);

  const naTela = visiveis.slice(0, limite);
  const caminhosComPrevia = naTela
    .filter(i => i.arquivo_caminho && tipoDoArquivo(i.arquivo_tipo, i.arquivo_nome) !== "outro")
    .map(i => i.arquivo_caminho!);
  const urlsAssinadas = useUrlsAssinadas(caminhosComPrevia);

  const porCategoria = useMemo(() => contarPorCategoria(ideias), [ideias]);
  const favoritas = useMemo(() => ideias.filter(i => i.favorita).length, [ideias]);

  const aberta = abertaId ? ideias.find(i => i.id === abertaId) ?? null : null;
  const podeEditar = (i: Ideia) => isAdmin || (!!user && i.created_by === user.id);

  function substituir(nova: Ideia) {
    setIdeias(atual => {
      const existe = atual.some(i => i.id === nova.id);
      return existe ? atual.map(i => (i.id === nova.id ? nova : i)) : [nova, ...atual];
    });
  }

  async function alternarFavorita(i: Ideia) {
    const favorita = !i.favorita;
    substituir({ ...i, favorita });
    const { error } = favorita
      ? await supabase.from("ideia_favoritas").insert({ ideia_id: i.id })
      : await supabase.from("ideia_favoritas").delete().eq("ideia_id", i.id).eq("user_id", user?.id ?? "");
    if (error) {
      substituir(i);
      toast.error(errorMessage(error, "Não foi possível marcar a favorita"));
    }
  }

  function abrirNova() {
    setEditando(null);
    setFormAberto(true);
  }

  function abrirEdicao(i: Ideia) {
    setEditando(i);
    setAbertaId(null);
    setFormAberto(true);
  }

  const ativos = filtrosAtivos(filtros);
  const opcoesClientes = [
    { value: TODOS, label: "Todos os clientes" },
    { value: SEM_CLIENTE, label: "Sem cliente (geral)" },
    ...clientes.map(c => ({ value: c.id, label: c.name })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Library className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Biblioteca de ideias</h1>
            <p className="text-sm text-muted-foreground">
              Referências e inspirações para campanhas e conteúdo, num lugar só para a equipe.
            </p>
          </div>
        </div>
        {estado !== "sem_tabela" && (
          <Button onClick={abrirNova} className="w-full shrink-0 sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Nova ideia
          </Button>
        )}
      </div>

      {estado === "sem_tabela" && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div className="min-w-0">
            <p className="font-semibold">A Biblioteca ainda não foi ativada: falta aplicar a migration</p>
            <p className="mt-1 break-words text-muted-foreground">
              Peça para quem administra o banco rodar <code className="rounded bg-muted px-1">20261012120000_biblioteca_de_ideias.sql</code> no Supabase. Depois disso, recarregue esta página.
            </p>
          </div>
        </div>
      )}

      {estado === "erro" && (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <p className="min-w-0 break-words">{erro}</p>
          </div>
          <Button variant="outline" size="sm" onClick={carregar} className="shrink-0">
            <RefreshCw className="mr-2 h-4 w-4" />
            Tentar de novo
          </Button>
        </div>
      )}

      {(estado === "pronto" || estado === "carregando") && (
        <>
          {estado === "pronto" && ideias.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => mudar({ categoria: TODOS })}
                className={cn(
                  "rounded-full border px-2.5 py-1 transition",
                  filtros.categoria === TODOS ? "border-primary/40 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground",
                )}
              >
                {ideias.length} {ideias.length === 1 ? "ideia" : "ideias"}
              </button>
              {porCategoria.map(c => (
                <button
                  key={c.valor}
                  type="button"
                  onClick={() => mudar({ categoria: filtros.categoria === c.valor ? TODOS : c.valor })}
                  className={cn(
                    "rounded-full border px-2.5 py-1 transition",
                    filtros.categoria === c.valor ? "border-primary/40 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {c.rotulo} · {c.total}
                </button>
              ))}
              {favoritas > 0 && (
                <span className="flex items-center gap-1 px-1.5 text-muted-foreground">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  {favoritas}
                </span>
              )}
            </div>
          )}

          <div className="space-y-3 rounded-2xl border border-border/60 bg-card/60 p-3 shadow-card sm:p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filtros.busca}
                onChange={e => mudar({ busca: e.target.value })}
                placeholder="Buscar por título, descrição, tag ou cliente"
                className="pl-9"
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <SearchableSelect
                options={opcoesClientes}
                value={filtros.cliente}
                onChange={v => mudar({ cliente: v || TODOS })}
                searchPlaceholder="Buscar cliente..."
              />
              <Select value={filtros.plataforma} onValueChange={v => mudar({ plataforma: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todas as plataformas</SelectItem>
                  {PLATAFORMAS.map(p => <SelectItem key={p.valor} value={p.valor}>{p.rotulo}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filtros.tipo} onValueChange={v => mudar({ tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos os tipos</SelectItem>
                  {TIPOS_CRIATIVO.map(t => <SelectItem key={t.valor} value={t.valor}>{t.rotulo}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filtros.categoria} onValueChange={v => mudar({ categoria: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todas as categorias</SelectItem>
                  {CATEGORIAS_IDEIA.map(c => <SelectItem key={c.valor} value={c.valor}>{c.rotulo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={filtros.soFavoritas ? "default" : "outline"}
                onClick={() => mudar({ soFavoritas: !filtros.soFavoritas })}
                aria-pressed={filtros.soFavoritas}
              >
                <Star className={cn("mr-1.5 h-3.5 w-3.5", filtros.soFavoritas && "fill-current")} />
                Só favoritas
              </Button>
              <Button
                type="button"
                size="sm"
                variant={filtros.soMinhas ? "default" : "outline"}
                onClick={() => mudar({ soMinhas: !filtros.soMinhas })}
                aria-pressed={filtros.soMinhas}
              >
                <UserIcon className="mr-1.5 h-3.5 w-3.5" />
                Só minhas
              </Button>
              {ativos && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setFiltros(FILTROS_INICIAIS)}>
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  Limpar filtros
                </Button>
              )}
              {estado === "pronto" && ativos && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {visiveis.length} de {ideias.length}
                </span>
              )}
            </div>
          </div>

          {estado === "carregando" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="overflow-hidden rounded-2xl border border-border/60 bg-card/60">
                  <Skeleton className="aspect-video w-full rounded-none" />
                  <div className="space-y-2 p-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : ideias.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/70 bg-card/40 px-4 py-14 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
                <Library className="h-7 w-7" />
              </span>
              <div className="max-w-md space-y-1">
                <p className="font-semibold">A biblioteca está vazia</p>
                <p className="text-sm text-muted-foreground">
                  Viu um anúncio, reels ou página que vale guardar? Cole o link (Instagram, TikTok, YouTube, Drive...) ou envie o arquivo.
                </p>
              </div>
              <Button onClick={abrirNova}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar a primeira ideia
              </Button>
            </div>
          ) : visiveis.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/70 bg-card/40 px-4 py-12 text-center">
              <p className="font-semibold">Nenhuma ideia com esses filtros</p>
              <p className="text-sm text-muted-foreground">Tente outra busca ou limpe os filtros.</p>
              <Button variant="outline" onClick={() => setFiltros(FILTROS_INICIAIS)}>Limpar filtros</Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {naTela.map(i => (
                  <IdeiaCard
                    key={i.id}
                    ideia={i}
                    cliente={i.client_id ? clientePorId.get(i.client_id) : undefined}
                    urlArquivo={i.arquivo_caminho ? urlsAssinadas.get(i.arquivo_caminho) : undefined}
                    onAbrir={() => setAbertaId(i.id)}
                    onFavoritar={() => alternarFavorita(i)}
                  />
                ))}
              </div>
              {visiveis.length > limite && (
                <div className="flex justify-center">
                  <Button variant="outline" onClick={() => setLimite(l => l + POR_PAGINA)}>
                    Mostrar mais ({visiveis.length - limite})
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      <IdeiaDetalhe
        ideia={aberta}
        cliente={aberta?.client_id ? clientePorId.get(aberta.client_id) : undefined}
        autor={aberta?.created_by ? autores.get(aberta.created_by) : undefined}
        podeEditar={!!aberta && podeEditar(aberta)}
        onFechar={() => setAbertaId(null)}
        onEditar={() => aberta && abrirEdicao(aberta)}
        onFavoritar={() => aberta && alternarFavorita(aberta)}
        onExcluida={id => {
          setAbertaId(null);
          setIdeias(atual => atual.filter(i => i.id !== id));
        }}
      />

      <IdeiaFormDialog
        open={formAberto}
        onOpenChange={setFormAberto}
        ideia={editando}
        clientes={clientes}
        onSalvo={substituir}
      />
    </div>
  );
}
