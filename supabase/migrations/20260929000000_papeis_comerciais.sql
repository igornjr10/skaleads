-- Papeis do time comercial (prospeccao). Ficam num arquivo so deles porque
-- valor novo de enum nao pode ser usado na mesma transacao em que nasce, e a
-- migration seguinte ja os referencia.

alter type public.app_role add value if not exists 'sdr';
alter type public.app_role add value if not exists 'closer';
alter type public.app_role add value if not exists 'social_seller';
