-- Bucket das fotos de cliente.
--
-- Ate aqui o logo_url guardava a URL que a Meta devolve em `picture.data.url`,
-- que e um link assinado do scontent.*.fbcdn.net com prazo de validade: depois
-- de alguns dias a assinatura vence, a Meta responde 403 e a foto some da tela
-- sozinha. Guardando a imagem aqui ela para de depender da Meta.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-logos',
  'client-logos',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Leitura publica: o dashboard compartilhado com o cliente abre sem login.
drop policy if exists "Public read client logos" on storage.objects;
create policy "Public read client logos" on storage.objects
  for select to public
  using (bucket_id = 'client-logos');

-- Escrita restrita a admin/owner. A Edge Function sync-client-logo usa
-- service_role e passa por fora da RLS.
drop policy if exists "Admins manage client logos" on storage.objects;
create policy "Admins manage client logos" on storage.objects
  for all to authenticated
  using (bucket_id = 'client-logos' and public.is_admin_or_owner(auth.uid()))
  with check (bucket_id = 'client-logos' and public.is_admin_or_owner(auth.uid()));
