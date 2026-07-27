-- Link publico e permanente por cliente pra ele ver o dashboard ao vivo
-- (dados sempre atuais, ao contrario do /share/reports/:token que e um
-- snapshot fixo do momento em que o relatorio foi gerado).
alter table public.clients
  add column if not exists dashboard_share_token uuid not null default gen_random_uuid() unique;
