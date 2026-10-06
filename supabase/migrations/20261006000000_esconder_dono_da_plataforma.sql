-- O dono da plataforma fica vinculado as empresas para dar suporte, e por
-- shares_company aparecia para o ADM e a equipe como mais um membro.

drop policy if exists "Profiles da mesma empresa" on public.profiles;
create policy "Profiles da mesma empresa" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.has_role(auth.uid(), 'owner')
    or (public.shares_company(id) and not public.has_role(id, 'owner'))
  );

drop policy if exists "Roles da mesma empresa" on public.user_roles;
create policy "Roles da mesma empresa" on public.user_roles
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_role(auth.uid(), 'owner')
    or (public.shares_company(user_id) and not public.has_role(user_id, 'owner'))
  );
