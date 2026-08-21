# Multi-time (Jaylton, Pablo, André) — Plano de Implementação

> **Para quem executa:** SUB-SKILL: use superpowers:executing-plans (ou subagent-driven-development). Passos com `- [ ]`.

**Goal:** Isolar todo o conteúdo por professor (`team`) e adicionar um seletor de time no topo; Jaylton continua idêntico, Pablo/André entram vazios.

**Architecture:** Coluna `team` em todas as tabelas + tabela `teams` de config. `getTeam()` central (URL+localStorage) alimenta o escopo de toda leitura/escrita. Worker de editados e ingestão de brutos rodam por time. Download worker inalterado (mesmo Shared Drive `0ANh...`).

**Tech Stack:** React+Vite+TS, Supabase (anon), Cloudflare Pages Functions + Workers.

Spec: `docs/superpowers/specs/2026-07-16-multi-time-professores-design.md`.

---

## File Structure

- **Novo:** `src/data/team.ts` — time ativo (get/set, URL+localStorage) + `listarTimes()`.
- **Modificar:** `src/components/Header.tsx` (seletor), `src/data/store.ts` (cards por team), `src/data/catalogoBrutos.ts` (brutos por team), `src/data/editados.ts` (editados por team), `src/data/brutos.ts` (listarBrutos por team), `src/data/links` + `Links.tsx`, `ProdutoPicker.tsx`/store (produtos por team), `src/components/Catalogo.tsx` ("Processar novos" com pasta do time), `functions/api/editados.js` (`?team=`), `functions/api/processar-brutos.js` (`&team=`), `worker-editados/index.js` (loop por time), `.github/workflows/processar.yml` (input team).
- **SQL manual:** colunas `team` + tabela `teams`.

---

### Task 1 — SQL: colunas `team` + tabela `teams` (usuário roda)

- [ ] **Passo 1:** rodar no Supabase SQL editor (CONFIRMADO: `documentos` NÃO é tabela — é jsonb em `cards`; `produtos` tem PK em `nome` → vira `(nome, team)`):
```sql
alter table cards    add column if not exists team text not null default 'jaylton';
alter table brutos   add column if not exists team text not null default 'jaylton';
alter table editados add column if not exists team text not null default 'jaylton';
alter table links    add column if not exists team text not null default 'jaylton';
alter table produtos add column if not exists team text not null default 'jaylton';

do $$
declare pk text;
begin
  select conname into pk from pg_constraint where conrelid='produtos'::regclass and contype='p';
  if pk is not null then execute 'alter table produtos drop constraint '||quote_ident(pk); end if;
  alter table produtos add primary key (nome, team);
end $$;

create table if not exists teams (
  id text primary key, nome text not null, cor text, ordem int default 0,
  brutos_folder_id text, editados_folder_id text, ativo boolean default true
);
alter table teams enable row level security;
drop policy if exists teams_anon on teams;
create policy teams_anon on teams for all to anon using (true) with check (true);
grant select, insert, update, delete on teams to anon;

insert into teams (id,nome,cor,ordem,editados_folder_id) values
 ('jaylton','Jaylton','#14a8f5',0,'1F_9Qd3yDQI-pnWmrxsyDe5a-Z-LJ8N_C'),
 ('pablo','Pablo','#a855f7',1,null),
 ('andre','André','#22c55e',2,null)
on conflict (id) do nothing;
```
NOTA: `produtos.salvarProduto` (Task 4) passa a usar `onConflict: 'nome,team'`.
- [ ] **Passo 2:** verificar `select * from teams;` → 3 linhas; `select team, count(*) from cards group by team;` → tudo `jaylton`.
- [ ] **Passo 3 (setup, quando tiver):** `update teams set brutos_folder_id='<Captação Pablo>' where id='pablo';` (idem André; e editados quando criarem).

### Task 2 — `src/data/team.ts` (time ativo + lista)

- [ ] **Passo 1:** criar o arquivo:
```ts
import { supabase } from './supabase'
export interface Time { id: string; nome: string; cor: string | null; brutosFolderId: string | null; editadosFolderId: string | null }
const KEY = 'time_ativo'
function daUrl(): string | null { const t = new URLSearchParams(location.search).get('t'); return t || null }
let ativo = daUrl() || localStorage.getItem(KEY) || 'jaylton'
export function getTeam(): string { return ativo }
export function setTeam(id: string) {
  ativo = id; localStorage.setItem(KEY, id)
  const u = new URL(location.href); u.searchParams.set('t', id); location.href = u.toString() // recarrega tudo no time novo
}
export async function listarTimes(): Promise<Time[]> {
  if (!supabase) return [{ id: 'jaylton', nome: 'Jaylton', cor: '#14a8f5', brutosFolderId: null, editadosFolderId: null }]
  const { data } = await supabase.from('teams').select('id,nome,cor,brutos_folder_id,editados_folder_id,ordem,ativo').eq('ativo', true).order('ordem')
  return (data || []).map((t: any) => ({ id: t.id, nome: t.nome, cor: t.cor, brutosFolderId: t.brutos_folder_id, editadosFolderId: t.editados_folder_id }))
}
```
- [ ] **Passo 2:** garantir que `?t=` na URL, se presente, persista (o `daUrl()` já cobre; `setTeam` grava). Deep-link `/v/<id>` continua abrindo (independe de time — o editado tem team próprio).

### Task 3 — Seletor de time no Header

- [ ] **Passo 1:** em `Header.tsx`, importar `getTeam, setTeam, listarTimes, type Time`; `useState`/`useEffect` pra carregar `listarTimes()`; achar o time ativo (`getTeam()`).
- [ ] **Passo 2:** ao lado do logo, um dropdown (chip com `cor` + nome). Ao escolher outro → `setTeam(id)`. Estilo no padrão do app (bg-surface, border, rounded-xl). Só mostra o seletor se houver >1 time.
- [ ] **Passo 3:** verificar visual (build + browser): seletor aparece, troca recarrega com `?t=`.

### Task 4 — Escopar leituras/escritas por `team` no data-layer

Em cada função, importar `getTeam` e aplicar. Padrão: leitura `.eq('team', getTeam())`; escrita adiciona `team: getTeam()` no objeto.

- [ ] **cards** (`src/data/store.ts`): `listCards` → `.eq('team', getTeam())`; `createCard` → grava `team: getTeam()`. (As demais mutações são por `id`, não precisam.)
- [ ] **brutos** (`src/data/brutos.ts` `listarBrutos` e `src/data/catalogoBrutos.ts`): `listarBrutos`/`listarClassificacoes` → `.eq('team', getTeam())`; `ligarBruto`/`definirProdutoBruto`/`comentarBruto`/`confirmarTipo` upserts → incluir `team: getTeam()` (pra bruto novo nascer no time certo; em bruto já existente o upsert por `drive_id` só atualiza).
- [ ] **editados** (`src/data/editados.ts`): `listarEditados` → `fetch('/api/editados?team=' + getTeam())`. `arquivarCardVinculado`/`marcar*` são por id, ok. `listarEditadosDoCard` → `.eq('team', getTeam())` (opcional; card_id já é único).
- [ ] **links** (`src/data/*links*`): listar → `.eq('team', getTeam())`; criar → `team: getTeam()`.
- [ ] **produtos** (`store.listarProdutos`/`salvarProduto`): listar → `.eq('team', getTeam())`; salvar → `team: getTeam()`. (`ProdutoPicker` já usa essas.)
- [ ] **Verificação:** com Pablo ativo, todas as telas vazias; Jaylton intacto.

### Task 5 — `/api/editados` filtra por team

- [ ] **Passo 1:** em `functions/api/editados.js`, ler `const team = new URL(request.url).searchParams.get('team') || 'jaylton'` e no select adicionar `&team=eq.${encodeURIComponent(team)}`.
- [ ] **Passo 2:** verificar `/api/editados?team=jaylton` (traz) vs `?team=pablo` (vazio até sync).

### Task 6 — `worker-editados` sincroniza por time

- [ ] **Passo 1:** no `sincronizar`, buscar os times: `const times = await sbGet(env, 'teams?select=id,editados_folder_id&ativo=eq.true')`.
- [ ] **Passo 2:** transformar a varredura numa função `varrerTime(token, editadosFolderId)` que devolve `todos` (como hoje, com secao). Pular time com `editados_folder_id` null.
- [ ] **Passo 3:** pra cada time, ao montar `novosRows`/`existRows`, incluir `team: t.id`. O vínculo editado→bruto→card: buscar brutos só do time (`brutos?select=nome,card_id&card_id=not.is.null&team=eq.${t.id}`).
- [ ] **Passo 4:** o prune passa a ser POR TIME (só apaga órfãos daquele time: `editados?select=...&team=eq.${t.id}` e remove os que sumiram da varredura DAQUELE time). Cuidado: não apagar editados de outro time.
- [ ] **Passo 5:** deploy worker + sync; verificar `editados` do Jaylton seguem `team='jaylton'`; Pablo/André pulados.

### Task 7 — Ingestão de brutos por time

- [ ] **Passo 1:** `functions/api/processar-brutos.js` aceita `&team=` e repassa no `inputs` do dispatch.
- [ ] **Passo 2:** `.github/workflows/processar.yml` ganha input `team` (default jaylton); o script de scan (`scripts/…`) grava `team` nos brutos do lote.
- [ ] **Passo 3:** `Catalogo.tsx` "Processar novos": manda `team=getTeam()` e pré-preenche o campo de pasta com a `brutosFolderId` do time ativo (de `listarTimes()`).
- [ ] **Passo 4:** verificar (quando houver brutos do Pablo) que entram com `team='pablo'`.

### Task 8 — Config final + verificação de isolamento

- [ ] **Passo 1:** preencher `teams.brutos_folder_id`/`editados_folder_id` do Pablo/André quando existirem (Task 1 passo 3).
- [ ] **Passo 2:** verificação de ponta a ponta: Jaylton = igual a antes (contagens); trocar pra Pablo → tudo vazio, criar card grava `team='pablo'`; voltar Jaylton → intacto. Deep-link `/v/<id>` do Jaylton abre normal.
- [ ] **Passo 3:** revisão adversarial (workflow) focada em vazamento entre times (alguma query sem `.eq('team')`).

---

## Ordem de deploy
SQL (Task 1) ANTES do worker (Task 6) e do frontend que grava `team` — senão upsert com coluna inexistente quebra. Frontend de leitura tolera (filtro por coluna existente após SQL).
