# Multi-time (Jaylton, Pablo, André) — Design

**Data:** 2026-07-16
**Status:** rumo aprovado em conversa; aguardando revisão do spec.

## Objetivo

Transformar a Central de Gravação (hoje só do Jaylton) num sistema **multi-time**: cada professor (Jaylton, Pablo, André) tem seu conteúdo **100% isolado** (cards, brutos, editados, links, produtos), e o app ganha um **seletor de time** no topo que troca qual professor você está vendo. Mesmo site, mesma infra.

## Contexto (o que hoje está preso a "um professor")

- Tabelas `cards`, `brutos`, `editados`, `links`, `produtos`, `documentos` não têm dimensão de professor.
- Pastas do Drive fixas no código: editados do Jaylton `1F_9Qd3yDQI-pnWmrxsyDe5a-Z-LJ8N_C`; download valida `driveId === '0ANh1nYBAOuTbUk9PVA'` (o Shared Drive).
- `worker-editados` varre uma pasta fixa; ingestão de brutos (`processar` → GitHub Actions) roda numa pasta passada à mão.
- **Achado bom:** as pastas do Pablo e do André já estão **no MESMO Shared Drive `0ANh...`** e a conta de serviço (`brutos-reader@baixa-gravacoes.iam.gserviceaccount.com`) já tem acesso. Cada uma é uma pasta-mãe ("Audiovisual") com subpasta "Captação" (brutos). Editados serão criados depois.

## Modelo de dados

### Coluna `team` em tudo
```sql
alter table cards      add column if not exists team text not null default 'jaylton';
alter table brutos     add column if not exists team text not null default 'jaylton';
alter table editados   add column if not exists team text not null default 'jaylton';
alter table links      add column if not exists team text not null default 'jaylton';
alter table produtos   add column if not exists team text not null default 'jaylton';
alter table documentos add column if not exists team text not null default 'jaylton';
```
O `default 'jaylton'` já faz a **migração**: tudo que existe vira do Jaylton, nada some. (Se `documentos`/`produtos` não tiverem `team`, degrada — checar quais existem.)

### Tabela `teams` (config de cada professor)
```sql
create table if not exists teams (
  id text primary key,            -- 'jaylton' | 'pablo' | 'andre'
  nome text not null,             -- 'Jaylton', 'Pablo', 'André'
  cor text,                       -- cor do chip do time
  ordem int default 0,
  brutos_folder_id text,          -- pasta de "Captação" no Shared Drive (null até ter)
  editados_folder_id text,        -- pasta de editados (null até criar)
  ativo boolean default true
);
```
Seeds: jaylton (editados `1F_9Qd...`), pablo (brutos = Captação do Pablo, editados null), andre (idem). RLS anon `select` liberado (`for all to anon using(true) with check(true)`), como as outras.

## Navegação por time (UI)

- **Time ativo** central em `src/data/team.ts`: `getTeam()`/`setTeam(id)` com persistência em `localStorage` e leitura de `?t=<id>` na URL (default `jaylton`). Todo o data-layer lê `getTeam()`.
- **Seletor** no `Header.tsx`, ao lado do logo Alasca: dropdown com os times de `teams` (chip colorido). Trocar → `setTeam` + recarrega os dados das telas (evento/`window.location` com `?t=`). Sem login — aberto.
- **Escopo em TODA leitura e escrita:**
  - Leituras filtram por `team=eq.<ativo>`: `store.listCards`, `listarBrutos`, `listarClassificacoes`, `listarEditados` (`/api/editados?team=`), `listarLinks`, `listarProdutos`.
  - Escritas gravam `team: <ativo>`: criar card, upsert bruto (produto/card_id/tipo), etc.
  - `/api/editados`, `/api/editado-stream`, `/api/download-url`, `/api/thumb`: os que operam por `drive_id` seguem iguais (id é único); `/api/editados` ganha `?team=` e filtra.

## Sync do Drive por time

- **Editados (`worker-editados`):** deixa de ter pasta fixa. No `sincronizar`, lê `teams` (id + `editados_folder_id`), e pra cada time com pasta faz a varredura de hoje (meses ≥ Julho + Cortes) **dentro da pasta daquele time**, gravando `team` em cada `editados`. Times sem `editados_folder_id` são pulados (Pablo/André até criarem). O vínculo editado→bruto→card também passa a considerar só brutos do mesmo time.
- **Brutos (ingestão):** o "Processar novos" do Catálogo passa a marcar `team = time ativo` nos brutos ingeridos. A pasta vem **pré-preenchida** da `teams.brutos_folder_id` do time ativo (ainda editável, pra colar outra à mão). `processar` recebe `&team=<id>` e a Action grava `team` no lote.
- **Download worker:** sem mudança — `driveId === '0ANh...'` já cobre os 3 (todas as pastas estão nesse Shared Drive).

## Escopo / não-objetivos

- **v1:** isolamento por `team` + seletor + sync de editados por time + brutos por time. Jaylton continua idêntico ao de hoje.
- **Fora:** login/controle de acesso por time (seletor é aberto); pastas de editados do Pablo/André (serão criadas depois — a config fica `null` e o sync deles liga quando preencher); um 4º professor (já suportado pela tabela `teams`, é só inserir linha).

## Pré-requisitos (setup, não bloqueiam o spec/plano)

1. Conta de serviço com acesso às pastas — **já feito** (Pablo/André no Shared Drive `0ANh...`, acesso confirmado).
2. IDs das pastas: `brutos_folder_id` (Captação) do Pablo e do André; `editados_folder_id` dos três (Jaylton = `1F_9Qd...`; Pablo/André quando criarem). Preenchidos na tabela `teams`.

## Verificação

- SQL roda; `teams` populada; migração deixa todo o legado como `jaylton` (contagens não mudam pro Jaylton).
- Trocar o seletor pra Pablo/André mostra telas **vazias** (sem vazamento do Jaylton) e o de volta pro Jaylton mostra tudo intacto.
- Criar um card com Pablo ativo → grava `team='pablo'` e só aparece no time do Pablo.
- Sync de editados: com `editados_folder_id` do Jaylton, os editados dele continuam vindo com `team='jaylton'`; Pablo/André pulados até terem pasta.

## Não-objetivos de refatoração

Não reescrever o data-layer inteiro — só injetar o filtro/escrita de `team` nos pontos de leitura/escrita já existentes, via `getTeam()` central.
