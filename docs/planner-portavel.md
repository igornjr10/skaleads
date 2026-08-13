# Planner de onboarding — pacote portátil

Tudo que é preciso para reconstruir a aba Planner em outro projeto: o prompt
pronto para colar, o SQL da infraestrutura e o código da tela.

**O que é:** um checklist de onboarding por cliente. Cliente novo nasce com a
lista montada; a equipe vai marcando; a tela mostra progresso e quem ainda tem
pendência.

---

## 1. Pré-requisitos do projeto destino

| Precisa ter | Por quê |
|---|---|
| Supabase (Postgres + RLS + Auth) | tabela, políticas e triggers |
| Uma tabela de clientes com `id uuid` | as tarefas penduram nela |
| React + react-router | a página |
| Tailwind + shadcn/ui | `Card`, `Checkbox`, `Progress`, `Input`, `Select`, `Skeleton`, `Avatar` |
| `sonner` | toasts de erro |
| `lucide-react` | ícones |

Se o destino não tem shadcn, o único componente que precisa de substituto real é
o `Checkbox`; o resto é `div` com classe.

---

## 2. O prompt

Cole isto inteiro no Claude Code / Cursor / Lovable do outro projeto. Ele foi
escrito para ser autossuficiente — não depende de você explicar o contexto antes.

````text
Preciso de uma aba "Planner" no meu app: um checklist de onboarding por cliente.

CONTEXTO DO MEU PROJETO
- Stack: React + TypeScript + Vite, Supabase (Postgres com RLS), Tailwind, shadcn/ui,
  react-router, sonner para toast, lucide-react para ícones.
- Já existe uma tabela `clients` com `id uuid primary key`, `name text` e `logo_url text`.
- A regra de acesso aos clientes hoje é: <DESCREVA AQUI — ex.: "cada usuário só vê
  clientes onde owner_id = auth.uid()" ou "todos os autenticados veem tudo">.

O QUE CONSTRUIR

1. Tabela `client_tasks` no Supabase:
   - id uuid pk, client_id uuid fk -> clients(id) on delete cascade
   - fase text (default 'geral'), titulo text, descricao text
   - done boolean default false, done_at timestamptz, done_by uuid -> auth.users
   - posicao int default 0, created_at timestamptz default now()
   - RLS ligada, com política que espelhe EXATAMENTE a regra de acesso de `clients`
     que descrevi acima. Não invente uma regra nova: se um usuário não pode ver o
     cliente, não pode ver as tarefas dele.
   - Índices em (client_id, posicao) e um parcial em client_id where not done.

2. Função `seed_client_tasks(_client_id uuid)` que insere o checklist padrão,
   e não faz nada se o cliente já tiver tarefas (idempotente).
   O checklist padrão tem 22 itens em 4 fases, nesta ordem — a ordem importa
   porque reflete a dependência real: sem acesso à BM não dá para instalar pixel,
   e sem pixel não adianta subir verba.

   acessos:      contrato assinado / acesso de parceiro no Business Manager /
                 conta de anúncios compartilhada / forma de pagamento ativa /
                 página do Facebook e Instagram vinculados
   rastreamento: pixel disparando / Conversions API / domínio verificado /
                 eventos priorizados (pós iOS 14) / públicos personalizados
   estrategia:   briefing preenchido / materiais recebidos / verba definida /
                 objetivo acordado / reunião de kickoff
   operacao:     conta conectada no sistema / primeira sincronização /
                 primeira auditoria / alertas configurados / modelo de relatório /
                 WhatsApp do cliente cadastrado / primeira campanha no ar

   ATENÇÃO DE SEGURANÇA: no Postgres, função nova nasce com EXECUTE para PUBLIC.
   `grant execute ... to authenticated` NÃO restringe — só soma. Como a função é
   SECURITY DEFINER (o insert dela ignora RLS), é obrigatório:
     revoke execute on function seed_client_tasks(uuid) from public, anon;
     grant execute on function seed_client_tasks(uuid) to authenticated;
   E dentro da função, recusar cliente fora do escopo de quem chama.

3. Trigger AFTER INSERT em `clients` chamando a função: cliente novo já nasce
   com o checklist.

4. Trigger BEFORE UPDATE em `client_tasks` que preenche done_at/done_by quando
   done vira true, e limpa quando volta para false. Não confie no frontend para isso.

5. Página React `/planner`, protegida por login, com:
   - Cabeçalho com três contadores: em onboarding, pendentes, concluídas
   - Busca por nome + filtro (com pendências / concluído / todos)
   - Um card por cliente: avatar, nome, barra de progresso e "feitas/total"
   - Ordenação com quem tem mais pendência primeiro
   - Card expande ao clicar, mostrando os itens agrupados por fase, com contador
     por fase
   - Checkbox com atualização otimista (marca na hora, reverte se o banco recusar)
   - Campo para adicionar item avulso ao cliente, com seletor de fase
   - Botão "Gerar checklist" no card de cliente que ainda não tem tarefas
   - Se a tabela não existir ainda (migration não rodada), mostrar um card
     explicando isso em vez de estourar erro

6. Avatar do cliente que cai para as iniciais quando a imagem não carrega.
   Não use <img> direto: URL de foto de Página do Facebook expira e recusa
   hotlink, e <img> puro vira ícone de imagem quebrada. Use o Avatar do Radix
   (AvatarImage + AvatarFallback), que só mostra a imagem depois que ela carrega,
   e passe referrerPolicy="no-referrer".

7. Ligar a rota, o item no menu lateral (ícone ClipboardList) e o título da página.

Escreva o SQL como migration versionada e me diga em que ordem rodar.
````

---

## 3. Infraestrutura (SQL)

Rode como uma migration. O único ponto que muda de projeto para projeto está
marcado com `ADAPTE`.

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- ADAPTE: a função de acesso. Escolha UMA das três e use o nome dela nas
-- políticas mais abaixo.
-- ─────────────────────────────────────────────────────────────────────────────

-- (a) Dono por cliente: clients.owner_id = auth.uid()
create or replace function public.pode_ver_cliente(_client_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clients c
    where c.id = _client_id and c.owner_id = auth.uid()
  )
$$;

-- (b) Por time: exige profiles.team_id e clients.team_id
-- create or replace function public.pode_ver_cliente(_client_id uuid)
-- returns boolean language sql stable security definer set search_path = public as $$
--   select exists (
--     select 1 from public.clients c
--     join public.profiles p on p.id = auth.uid()
--     where c.id = _client_id and c.team_id = p.team_id
--   )
-- $$;

-- (c) Workspace único (todo autenticado vê tudo)
-- create or replace function public.pode_ver_cliente(_client_id uuid)
-- returns boolean language sql stable as $$ select auth.uid() is not null $$;


-- ── Tabela ───────────────────────────────────────────────────────────────────
create table if not exists public.client_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  fase text not null default 'geral',
  titulo text not null,
  descricao text,
  done boolean not null default false,
  done_at timestamptz,
  done_by uuid references auth.users(id) on delete set null,
  posicao int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_client_tasks_client on public.client_tasks(client_id, posicao);
create index if not exists idx_client_tasks_pendentes on public.client_tasks(client_id) where not done;

alter table public.client_tasks enable row level security;

drop policy if exists "client_tasks_acesso" on public.client_tasks;
create policy "client_tasks_acesso" on public.client_tasks
  for all to authenticated
  using (public.pode_ver_cliente(client_id))
  with check (public.pode_ver_cliente(client_id));

grant select, insert, update, delete on public.client_tasks to authenticated;


-- ── Checklist padrão ─────────────────────────────────────────────────────────
create or replace function public.seed_client_tasks(_client_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  inseridas int;
begin
  -- Recusa cliente fora do escopo de quem chama. A condição sobre auth.uid()
  -- preserva o caminho do trigger, que roda sem usuário em inserção via service_role.
  if auth.uid() is not null and not public.pode_ver_cliente(_client_id) then
    raise exception 'Cliente fora do seu escopo';
  end if;

  if exists (select 1 from public.client_tasks where client_id = _client_id) then
    return 0;
  end if;

  insert into public.client_tasks (client_id, fase, titulo, posicao)
  select _client_id, fase, titulo, posicao
  from (values
    ('acessos',       'Contrato assinado e escopo combinado',                      10),
    ('acessos',       'Acesso de parceiro no Business Manager do cliente',          20),
    ('acessos',       'Conta de anuncios compartilhada com a agencia',              30),
    ('acessos',       'Forma de pagamento ativa e limite conferido',                40),
    ('acessos',       'Pagina do Facebook e perfil do Instagram vinculados',        50),
    ('rastreamento',  'Pixel instalado e disparando no site',                       60),
    ('rastreamento',  'Conversions API (CAPI) configurada',                         70),
    ('rastreamento',  'Dominio verificado no Business Manager',                     80),
    ('rastreamento',  'Eventos priorizados definidos (pos iOS 14)',                 90),
    ('rastreamento',  'Publicos personalizados criados',                           100),
    ('estrategia',    'Briefing preenchido: publico, oferta e diferenciais',       110),
    ('estrategia',    'Materiais recebidos (logo, fotos, videos)',                 120),
    ('estrategia',    'Verba mensal definida e cadastrada',                        130),
    ('estrategia',    'Objetivo principal acordado com o cliente',                 140),
    ('estrategia',    'Reuniao de kickoff realizada',                              150),
    ('operacao',      'Cliente cadastrado e conta Meta conectada',                 160),
    ('operacao',      'Primeira sincronizacao concluida',                          170),
    ('operacao',      'Primeira auditoria rodada e pontos criticos tratados',      180),
    ('operacao',      'Alertas configurados para a conta',                         190),
    ('operacao',      'Modelo de relatorio definido',                              200),
    ('operacao',      'Grupo ou numero de WhatsApp do cliente cadastrado',         210),
    ('operacao',      'Primeira campanha no ar',                                   220)
  ) as t(fase, titulo, posicao);

  get diagnostics inseridas = row_count;
  return inseridas;
end;
$$;

-- OBRIGATÓRIO: função nova nasce com EXECUTE para PUBLIC. Sem o revoke, um
-- chamador anônimo com a chave pública executa a função — e como ela é
-- SECURITY DEFINER, o insert dela não passa pela RLS.
revoke execute on function public.seed_client_tasks(uuid) from public;
revoke execute on function public.seed_client_tasks(uuid) from anon;
grant  execute on function public.seed_client_tasks(uuid) to authenticated;


-- ── Cliente novo já nasce com o checklist ────────────────────────────────────
create or replace function public.trg_seed_client_tasks()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_client_tasks(new.id);
  return new;
end;
$$;

drop trigger if exists trg_clients_seed_tasks on public.clients;
create trigger trg_clients_seed_tasks
  after insert on public.clients
  for each row execute function public.trg_seed_client_tasks();


-- ── Quem concluiu e quando, sem depender do frontend ─────────────────────────
create or replace function public.touch_client_task_done()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.done and not old.done then
    new.done_at := now();
    new.done_by := auth.uid();
  elsif not new.done and old.done then
    new.done_at := null;
    new.done_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_client_tasks_done on public.client_tasks;
create trigger trg_client_tasks_done
  before update on public.client_tasks
  for each row execute function public.touch_client_task_done();
```

### Como verificar que ficou seguro

Com a **chave anônima** (a pública, do bundle), as três chamadas abaixo têm que
ser recusadas:

```bash
# tabela → esperado: 42501 permission denied for table client_tasks
curl -s "$URL/rest/v1/client_tasks?select=id&limit=1" -H "apikey: $ANON"

# função → esperado: 42501 permission denied for function seed_client_tasks
curl -s -X POST "$URL/rest/v1/rpc/seed_client_tasks" -H "apikey: $ANON" \
  -H "Content-Type: application/json" \
  -d '{"_client_id":"00000000-0000-0000-0000-000000000000"}'
```

Se a segunda devolver **23503 (foreign key violation)** em vez de 42501, o
`revoke` não foi aplicado: a função executou. Esse foi exatamente o erro que
cometi na primeira versão aqui.

---

## 4. Ligação na aplicação

```tsx
// App.tsx — dentro do bloco de rotas protegidas
const Planner = lazy(() => import("./pages/Planner"));
<Route path="/planner" element={<Planner />} />

// Sidebar
import { ClipboardList } from "lucide-react";
{ title: "Planner", url: "/planner", icon: ClipboardList }
```

Se o projeto usa tipos gerados do Supabase (`types.ts`), regenere depois da
migration — ou adicione `client_tasks` à mão em `Tables` e `seed_client_tasks`
em `Functions`, senão o TypeScript recusa `from("client_tasks")` e
`rpc("seed_client_tasks")`.

---

## 5. Armadilhas que custaram tempo aqui

**1. `grant execute to authenticated` não restringe nada.** No Postgres a função
já nasce com EXECUTE para PUBLIC; o grant só soma. Em função `SECURITY DEFINER`
que escreve, isso é uma porta aberta — o insert dela ignora a RLS. Sempre
`revoke ... from public` antes.

**2. `<img src={logo}>` vira ícone quebrado.** Fallback com `logoUrl ? <img> :
<iniciais>` só cobre URL vazia. Quando a URL existe e falha (foto de Página do
Facebook expira e recusa hotlink), o `<img>` já renderizou. Use `AvatarImage` +
`AvatarFallback` do Radix, que só exibe depois do carregamento.

**3. Cor hardcoded escapa de rebrand.** Os gráficos aqui continuaram laranja
depois da troca de tema porque a cor estava escrita direto (`hsl(24 95% 55%)`)
em vez de token. Se o destino tem tema, use variável.

**4. Atualização otimista precisa de reversão.** Marcar o checkbox e só depois
mandar para o banco deixa a tela mentindo quando a RLS recusa. Guarde o estado
anterior e reverta no erro.

---

## 6. Código da tela

Os dois arquivos, na íntegra, estão logo abaixo — `ClientAvatar.tsx` primeiro
porque a página depende dele.

### `src/components/ClientAvatar.tsx`

```tsx
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}

/**
 * Logo do cliente com queda para as iniciais.
 *
 * Boa parte dos logo_url vem da foto da Pagina do Facebook, e essa URL do
 * scontent.*.fbcdn.net e assinada: expira com o tempo e costuma recusar
 * hotlink de origem desconhecida. Com <img> puro isso vira o icone de imagem
 * quebrada; o AvatarImage do Radix so aparece quando a imagem carrega de fato,
 * entao o fallback assume sozinho. O referrerPolicy evita parte das recusas.
 */
export function ClientAvatar({
  name,
  logoUrl,
  className = "h-10 w-10",
}: {
  name: string;
  logoUrl?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={`${className} shrink-0 border border-border/60`}>
      {logoUrl && <AvatarImage src={logoUrl} alt={name} referrerPolicy="no-referrer" />}
      <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
        {iniciais(name)}
      </AvatarFallback>
    </Avatar>
  );
}
```

### `src/pages/Planner.tsx`

```tsx
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Database,
  KeyRound,
  ListChecks,
  Plus,
  Rocket,
  Search,
  Target,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientAvatar } from "@/components/ClientAvatar";

interface Cliente {
  id: string;
  name: string;
  logo_url: string | null;
  status: string;
  created_at: string;
}

interface Tarefa {
  id: string;
  client_id: string;
  fase: string;
  titulo: string;
  done: boolean;
  done_at: string | null;
  posicao: number;
}

const FASES = [
  { id: "acessos", label: "Acessos", icon: KeyRound },
  { id: "rastreamento", label: "Rastreamento", icon: Target },
  { id: "estrategia", label: "Estratégia", icon: ListChecks },
  { id: "operacao", label: "Operação", icon: Rocket },
  { id: "geral", label: "Geral", icon: ClipboardList },
] as const;

function faseMeta(id: string) {
  return FASES.find((f) => f.id === id) ?? FASES[FASES.length - 1];
}

export default function Planner() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [loading, setLoading] = useState(true);
  const [semTabela, setSemTabela] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"onboarding" | "todos" | "prontos">("onboarding");
  const [aberto, setAberto] = useState<Set<string>>(new Set());
  const [novoTitulo, setNovoTitulo] = useState<Record<string, string>>({});
  const [novaFase, setNovaFase] = useState<Record<string, string>>({});

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setLoading(true);

    const [clientesRes, tarefasRes] = await Promise.all([
      supabase.from("clients").select("id, name, logo_url, status, created_at").order("created_at", { ascending: false }),
      supabase.from("client_tasks").select("id, client_id, fase, titulo, done, done_at, posicao").order("posicao"),
    ]);

    // A migration do planner pode nao ter rodado ainda neste ambiente.
    if (tarefasRes.error?.code === "42P01") {
      setSemTabela(true);
      setLoading(false);
      return;
    }

    setClientes((clientesRes.data as Cliente[]) ?? []);
    setTarefas((tarefasRes.data as Tarefa[]) ?? []);
    setLoading(false);
  }

  const porCliente = useMemo(() => {
    const mapa = new Map<string, Tarefa[]>();
    for (const t of tarefas) {
      const lista = mapa.get(t.client_id) ?? [];
      lista.push(t);
      mapa.set(t.client_id, lista);
    }
    return mapa;
  }, [tarefas]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return clientes
      .filter((c) => (termo ? c.name.toLowerCase().includes(termo) : true))
      .filter((c) => {
        const lista = porCliente.get(c.id) ?? [];
        const pendentes = lista.filter((t) => !t.done).length;
        if (filtro === "onboarding") return lista.length === 0 || pendentes > 0;
        if (filtro === "prontos") return lista.length > 0 && pendentes === 0;
        return true;
      })
      .sort((a, b) => {
        const pa = (porCliente.get(a.id) ?? []).filter((t) => !t.done).length;
        const pb = (porCliente.get(b.id) ?? []).filter((t) => !t.done).length;
        return pb - pa;
      });
  }, [clientes, porCliente, busca, filtro]);

  const resumo = useMemo(() => {
    const emOnboarding = clientes.filter((c) => {
      const lista = porCliente.get(c.id) ?? [];
      return lista.length > 0 && lista.some((t) => !t.done);
    }).length;
    return {
      emOnboarding,
      pendentes: tarefas.filter((t) => !t.done).length,
      concluidas: tarefas.filter((t) => t.done).length,
    };
  }, [clientes, porCliente, tarefas]);

  async function alternar(tarefa: Tarefa) {
    const novo = !tarefa.done;
    setTarefas((atual) => atual.map((t) => (t.id === tarefa.id ? { ...t, done: novo } : t)));

    const { error } = await supabase.from("client_tasks").update({ done: novo }).eq("id", tarefa.id);
    if (error) {
      setTarefas((atual) => atual.map((t) => (t.id === tarefa.id ? { ...t, done: tarefa.done } : t)));
      toast.error(error.message);
    }
  }

  async function gerarChecklist(clienteId: string) {
    const { error } = await supabase.rpc("seed_client_tasks", { _client_id: clienteId });
    if (error) return toast.error(error.message);
    toast.success("Checklist padrão aplicado");
    carregar();
  }

  async function adicionar(clienteId: string) {
    const titulo = (novoTitulo[clienteId] ?? "").trim();
    if (!titulo) return;
    const fase = novaFase[clienteId] ?? "geral";
    const lista = porCliente.get(clienteId) ?? [];
    const posicao = Math.max(0, ...lista.map((t) => t.posicao)) + 10;

    const { data, error } = await supabase
      .from("client_tasks")
      .insert({ client_id: clienteId, titulo, fase, posicao })
      .select("id, client_id, fase, titulo, done, done_at, posicao")
      .single();

    if (error) return toast.error(error.message);
    setTarefas((atual) => [...atual, data as Tarefa]);
    setNovoTitulo((atual) => ({ ...atual, [clienteId]: "" }));
  }

  async function remover(tarefa: Tarefa) {
    const backup = tarefas;
    setTarefas((atual) => atual.filter((t) => t.id !== tarefa.id));
    const { error } = await supabase.from("client_tasks").delete().eq("id", tarefa.id);
    if (error) {
      setTarefas(backup);
      toast.error(error.message);
    }
  }

  function alternarAberto(id: string) {
    setAberto((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  if (semTabela) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <Database className="h-8 w-8 text-muted-foreground" />
          <h2 className="text-base font-semibold">Planner ainda não instalado no banco</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Rode a migration <code className="text-primary">20260812000006_client_tasks.sql</code> no SQL Editor do
            Supabase e recarregue esta página.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Cabeçalho ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Planner</h1>
            <p className="text-sm text-muted-foreground">
              O que precisa acontecer quando um cliente novo entra na carteira.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Em onboarding", valor: resumo.emOnboarding },
            { label: "Pendentes", valor: resumo.pendentes },
            { label: "Concluídas", valor: resumo.concluidas },
          ].map(({ label, valor }) => (
            <div key={label} className="rounded-2xl border border-border/60 bg-card/60 px-4 py-3 text-center">
              <div className="text-2xl font-semibold tabular-nums">{valor}</div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente..."
            className="pl-9"
          />
        </div>
        <Select value={filtro} onValueChange={(v) => setFiltro(v as typeof filtro)}>
          <SelectTrigger className="sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="onboarding">Com pendências</SelectItem>
            <SelectItem value="prontos">Onboarding concluído</SelectItem>
            <SelectItem value="todos">Todos os clientes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Lista ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : visiveis.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            <p className="text-sm font-medium">Nada pendente por aqui</p>
            <p className="text-xs text-muted-foreground">
              {filtro === "onboarding" ? "Todo cliente com checklist está em dia." : "Nenhum cliente neste filtro."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visiveis.map((cliente) => {
            const lista = porCliente.get(cliente.id) ?? [];
            const feitas = lista.filter((t) => t.done).length;
            const pct = lista.length ? Math.round((feitas / lista.length) * 100) : 0;
            const expandido = aberto.has(cliente.id);

            return (
              <Card key={cliente.id} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => alternarAberto(cliente.id)}
                  className="flex w-full items-center gap-4 p-5 text-left transition-colors hover:bg-white/[0.02]"
                >
                  <ClientAvatar name={cliente.name} logoUrl={cliente.logo_url} />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold">{cliente.name}</h3>
                      {lista.length > 0 && pct === 100 && (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      )}
                    </div>
                    {lista.length > 0 ? (
                      <div className="mt-2 flex items-center gap-3">
                        <Progress value={pct} className="h-1.5 max-w-xs" />
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {feitas}/{lista.length}
                        </span>
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">Sem checklist ainda</p>
                    )}
                  </div>

                  {lista.length === 0 ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        gerarChecklist(cliente.id);
                      }}
                    >
                      Gerar checklist
                    </Button>
                  ) : (
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expandido ? "rotate-180" : ""}`}
                    />
                  )}
                </button>

                {expandido && lista.length > 0 && (
                  <div className="border-t border-border/60 bg-background/40 p-5">
                    <div className="space-y-5">
                      {FASES.filter((f) => lista.some((t) => t.fase === f.id)).map((fase) => {
                        const itens = lista.filter((t) => t.fase === fase.id);
                        const Icone = fase.icon;
                        return (
                          <div key={fase.id}>
                            <div className="flex items-center gap-2">
                              <Icone className="h-3.5 w-3.5 text-emerald-400" />
                              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {fase.label}
                              </span>
                              <span className="text-[11px] tabular-nums text-muted-foreground/60">
                                {itens.filter((t) => t.done).length}/{itens.length}
                              </span>
                            </div>

                            <div className="mt-2 space-y-1">
                              {itens.map((tarefa) => (
                                <div
                                  key={tarefa.id}
                                  className="group flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/[0.03]"
                                >
                                  <Checkbox
                                    checked={tarefa.done}
                                    onCheckedChange={() => alternar(tarefa)}
                                    className="shrink-0"
                                  />
                                  <span
                                    className={`flex-1 text-sm ${
                                      tarefa.done ? "text-muted-foreground line-through" : "text-foreground"
                                    }`}
                                  >
                                    {tarefa.titulo}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => remover(tarefa)}
                                    className="shrink-0 text-muted-foreground/0 transition-colors hover:text-destructive group-hover:text-muted-foreground/60"
                                    title="Remover item"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Item avulso: cada cliente tem uma exigencia que o padrao nao cobre */}
                    <div className="mt-5 flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row">
                      <Input
                        value={novoTitulo[cliente.id] ?? ""}
                        onChange={(e) => setNovoTitulo((a) => ({ ...a, [cliente.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && adicionar(cliente.id)}
                        placeholder="Adicionar item para este cliente..."
                        className="flex-1"
                      />
                      <Select
                        value={novaFase[cliente.id] ?? "geral"}
                        onValueChange={(v) => setNovaFase((a) => ({ ...a, [cliente.id]: v }))}
                      >
                        <SelectTrigger className="sm:w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FASES.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button onClick={() => adicionar(cliente.id)} className="shrink-0">
                        <Plus className="mr-1.5 h-4 w-4" />
                        Adicionar
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
```
