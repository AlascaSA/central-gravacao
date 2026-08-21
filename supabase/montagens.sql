-- Fila de montagem das variações de anúncio (aba Multiplicar).
-- A Central grava o pedido, o GitHub Actions monta e escreve o progresso, e a
-- Central lê de volta pra desenhar a barra. Rode no SQL Editor do Supabase (uma vez).

create table if not exists montagens (
  id           uuid primary key default gen_random_uuid(),
  pasta        text not null,        -- pasta de origem no Drive
  pasta_saida  text,                 -- subpasta "Variações …" criada pelo serviço
  codigo       text,                 -- 2609-JL-IIP-PDS
  total        int  not null,
  feitas       int  default 0,
  enviadas     int  default 0,
  falhas       int  default 0,
  estado       text default 'fila',  -- fila | montando | pronta | erro
  erro         text,
  pecas        jsonb default '[]',   -- [{nome, estado, mb, erro}]
  pedido       jsonb,                -- o pedido inteiro; o workflow lê daqui
  criado_em    timestamptz default now(),
  fim_em       timestamptz
);

create index if not exists montagens_criado on montagens (criado_em desc);

alter table montagens enable row level security;
drop policy if exists "montagens anon all" on montagens;
create policy "montagens anon all" on montagens for all to anon using (true) with check (true);
