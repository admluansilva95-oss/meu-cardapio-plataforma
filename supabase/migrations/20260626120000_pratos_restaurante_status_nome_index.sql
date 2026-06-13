-- Listagem pública e pedidos: filtro por restaurante_id + status + ordenação por nome.
-- Complementa idx_pratos_restaurante / idx_pratos_status com um único índice composto.
create index if not exists idx_pratos_restaurante_status_nome
  on public.pratos (restaurante_id, status, nome);
