-- Reuniao e relatorio: o compromisso com o CLIENTE, por ciclo.
--
-- Nao cabe em `rotinas` (que se repete para a equipe e e marcada por dia) nem
-- em `tasks` (avulsa, com comeco e fim): aqui a pergunta e "este mes, este
-- cliente ja recebeu o relatorio e ja teve a reuniao?". Uma linha por
-- (cliente, tipo, ciclo, competencia).

create table if not exists public.client_compromissos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  tipo text not null check (tipo in ('relatorio', 'reuniao')),
  ciclo text not null check (ciclo in ('mensal', 'semanal')),

  -- Ancora do ciclo, nao a data do que aconteceu: dia 1 do mes no ciclo mensal,
  -- segunda-feira no semanal. E o que faz a marcacao cair sempre no mesmo
  -- balde, mesmo que o relatorio de setembro so tenha saido em 3 de outubro.
  competencia date not null,

  feito boolean not null default false,
  -- Quando de fato enviou / se reuniu. Costuma diferir da competencia.
  data_feito date,
  observacao text,

  registrado_por uuid references auth.users(id) on delete set null,
  registrado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (client_id, tipo, ciclo, competencia),

  -- Sem isto, uma competencia no meio do mes entraria como balde proprio e o
  -- mesmo mes apareceria duas vezes na tela.
  constraint client_compromissos_competencia_ancorada check (
    (ciclo = 'mensal'  and extract(day    from competencia) = 1)
    or (ciclo = 'semanal' and extract(isodow from competencia) = 1)
  )
);

create index if not exists idx_client_compromissos_ciclo
  on public.client_compromissos(ciclo, competencia);

alter table public.client_compromissos enable row level security;

-- Leitura liberada para autenticado, como em rotinas: a cobranca so funciona se
-- todo mundo enxergar o que falta em cada cliente.
drop policy if exists "Authenticated can view client_compromissos" on public.client_compromissos;
create policy "Authenticated can view client_compromissos" on public.client_compromissos
  for select to authenticated using (true);

-- Escrita para qualquer autenticado: quem envia o relatorio e quem senta na
-- reuniao nem sempre e o gestor cadastrado da conta, e `clients.manager_id`
-- aponta para `managers`, nao para um usuario — nao da para amarrar a policy
-- nele. Apagar continua sendo de admin/owner.
drop policy if exists "Authenticated registra compromisso" on public.client_compromissos;
create policy "Authenticated registra compromisso" on public.client_compromissos
  for insert to authenticated with check (true);

drop policy if exists "Authenticated corrige compromisso" on public.client_compromissos;
create policy "Authenticated corrige compromisso" on public.client_compromissos
  for update to authenticated using (true) with check (true);

drop policy if exists "Admin apaga compromisso" on public.client_compromissos;
create policy "Admin apaga compromisso" on public.client_compromissos
  for delete to authenticated using (public.is_admin_or_owner(auth.uid()));

grant select, insert, update, delete on public.client_compromissos to authenticated;
grant select, insert, update, delete on public.client_compromissos to service_role;


-- Quem marcou, quando, e a data do feito — sem depender do frontend mandar.
create or replace function public.touch_client_compromisso()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.feito then
    if tg_op = 'INSERT' or not old.feito then
      new.registrado_em := now();
      new.registrado_por := auth.uid();
    end if;
    -- Marcou sem dizer o dia: assume hoje, que e o caso comum de quem acabou de
    -- enviar o relatorio ou sair da reuniao.
    if new.data_feito is null then
      new.data_feito := current_date;
    end if;
  else
    new.data_feito := null;
    new.registrado_em := null;
    new.registrado_por := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_client_compromissos_touch on public.client_compromissos;
create trigger trg_client_compromissos_touch
  before insert or update on public.client_compromissos
  for each row execute function public.touch_client_compromisso();

notify pgrst, 'reload schema';
