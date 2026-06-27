-- Central de Gravação — schema do Supabase
-- Rode isto no SQL Editor do seu projeto Supabase (uma vez).

-- 1) Tabela de cards (1 linha = 1 vídeo)
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  copy text not null,
  fase text not null default 'A gravar',
  semana date,
  titulo text not null,
  campanha text default '',
  urgencia text default 'média',
  resp_gravacao text,
  resp_edicao text,
  prazo text,
  documentos jsonb not null default '[]'::jsonb,
  observacoes text,
  arquivado boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  finalizado_em timestamptz
);

-- 2) RLS — ferramenta interna, acesso pelo link/anon key: liberar tudo pro papel anon
alter table public.cards enable row level security;
drop policy if exists "anon full access cards" on public.cards;
create policy "anon full access cards" on public.cards
  for all to anon using (true) with check (true);

-- 3) Realtime (quadro atualiza ao vivo). Se reclamar "already member", pode ignorar.
do $$
begin
  alter publication supabase_realtime add table public.cards;
exception when duplicate_object then null;
end $$;

-- 4) Storage — bucket público pros documentos das copys
insert into storage.buckets (id, name, public)
  values ('documentos', 'documentos', true)
  on conflict (id) do nothing;

drop policy if exists "anon upload docs" on storage.objects;
create policy "anon upload docs" on storage.objects
  for insert to anon with check (bucket_id = 'documentos');

drop policy if exists "anon read docs" on storage.objects;
create policy "anon read docs" on storage.objects
  for select to anon using (bucket_id = 'documentos');
