-- Habilita Realtime na tabela public.pedidos (postgres_changes no painel admin).
-- Aplique no SQL Editor ou via Supabase CLI. Requer políticas RLS que permitam SELECT ao dono.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'pedidos'
     ) then
    execute 'alter publication supabase_realtime add table public.pedidos';
  end if;
end $$;
