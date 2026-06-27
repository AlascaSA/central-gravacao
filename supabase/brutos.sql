-- Catálogo de brutos: classificação da IA + confirmação humana.
-- Rode no SQL Editor do Supabase (uma vez).

create table if not exists brutos (
  drive_id       text primary key,
  nome           text,
  duracao        int,
  transcricao    text,
  -- proposta da IA
  ia_tipo        text,        -- boa | erro | gancho | complemento
  ia_tema        text,
  ia_tags        text[],
  ia_resumo      text,
  ia_confianca   real,
  ia_motivo      text,
  ia_card        uuid,        -- card sugerido pela IA (pode ser null)
  -- confirmação humana
  tipo           text,        -- preenchido quando o humano confirma/corrige
  card_id        uuid references cards(id) on delete set null,
  confirmado     boolean default false,
  confirmado_em  timestamptz,
  criado_em      timestamptz default now(),
  atualizado_em  timestamptz default now()
);

alter table brutos enable row level security;
drop policy if exists "brutos anon all" on brutos;
create policy "brutos anon all" on brutos for all to anon using (true) with check (true);

-- exemplos confirmados pelo humano (few-shot pra treinar as próximas classificações)
create table if not exists brutos_exemplos (
  id           bigserial primary key,
  transcricao  text,
  duracao      int,
  tipo         text,
  criado_em    timestamptz default now()
);

alter table brutos_exemplos enable row level security;
drop policy if exists "brutos_exemplos anon all" on brutos_exemplos;
create policy "brutos_exemplos anon all" on brutos_exemplos for all to anon using (true) with check (true);

-- realtime (opcional; se der erro de "já existe", ignore)
alter publication supabase_realtime add table brutos;
