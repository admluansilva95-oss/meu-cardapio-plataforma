-- Textos editáveis da vitrine pública (cardápio /{slug}) — boas-vindas e linhas de status.

alter table public.restaurantes
  add column if not exists mensagem_boas_vindas text null;

alter table public.restaurantes
  add column if not exists texto_vitrine_aberto text null;

alter table public.restaurantes
  add column if not exists texto_vitrine_fechado text null;

alter table public.restaurantes
  add column if not exists mensagem_fora_horario text null;

comment on column public.restaurantes.mensagem_boas_vindas is
  'Frase curta abaixo do status na vitrine pública (cardápio).';

comment on column public.restaurantes.texto_vitrine_aberto is
  'Linha ao lado do indicador “Aberto” quando o cardápio aceita pedidos.';

comment on column public.restaurantes.texto_vitrine_fechado is
  'Linha ao lado do indicador “Fechado” quando pedidos estão indisponíveis.';

comment on column public.restaurantes.mensagem_fora_horario is
  'Aviso opcional quando fora do horário (diferente da pausa manual / mensagem_fechado).';
