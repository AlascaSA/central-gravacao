# Catálogo de brutos por banco — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development ou superpowers:executing-plans pra implementar tarefa a tarefa. Steps usam checkbox (`- [ ]`).

**Goal:** Catálogo instantâneo lendo de um banco (Supabase), preenchido por um processamento sob demanda que gera capa própria e captura o mês/dia da pasta real; player sempre do Drive.

**Architecture:** O processamento (GitHub Actions) varre a pasta Brutos nova (recursivo), gera 1 capa por vídeo e faz UPSERT dos metadados na tabela `brutos`. `/api/brutos` passa a ler do banco. O Catálogo lê do banco e usa o iframe do Drive como player.

**Tech Stack:** Node (Netlify Functions v2 + scripts GitHub Actions), ffmpeg, Supabase REST/Storage, React/Vite.

**Nota sobre TDD:** este projeto não tem suíte de testes (build = `tsc -b && vite build`, sem runner). A verificação de cada tarefa é: **build passa → deploy Netlify → checagem via curl/`/api` ou navegador (Safari)**. Os scripts do GitHub Actions verificam-se disparando o workflow e conferindo o resultado no banco/Storage.

**Escopo:** capas + catálogo por banco + controle de scan (botão + link de pasta) + player Drive. **Fora deste plano (follow-up):** classificação por IA na estrutura nova — a marcação manual (Boa/Erro/Gancho/Compl.) continua funcionando; o `ia_tipo` só não é preenchido automaticamente nos novos até o follow-up.

---

## File Structure
- `src/components/Catalogo.tsx` — remove proxy/`fonte`, player = iframe; capa do banco; input de pasta + botão.
- `netlify/functions/brutos.mjs` — passa a ler da tabela `brutos` (SELECT), não varrer o Drive.
- `netlify/functions/processar-brutos.mjs` — aceita link de pasta e repassa no dispatch.
- `scripts/lib/scan.mjs` — **novo**: varredura recursiva compartilhada (mês/dia da pasta).
- `scripts/gerar-capas.mjs` — **novo** (substitui `gerar-proxies.mjs`): scan + 1 capa por vídeo novo + UPSERT metadados.
- `.github/workflows/processar.yml` — input opcional `pasta`.
- Supabase: tabela `brutos` ganha colunas de catálogo.

---

### Task 1: Player do Catálogo = sempre Drive (tira a versão leve)

**Files:** Modify: `src/components/Catalogo.tsx`

- [ ] **Step 1:** Remover o estado/efeito de `fonte` (o `useState<'checando'|'proxy'|'raw'>` e o `useEffect` que faz `fetch(proxyDe(...))`). O player passa a renderizar SEMPRE o `<iframe src={drivePreview(aberto.id)}>`. Remover o `<video>` do proxy, o overlay `fonte==='proxy'`, e a nota "Tocando o 4K direto do Drive…". Manter o `vidErro`? Não — o iframe não emite erro; remover o bloco `vidErro`. Os botões prev/próximo e o "Baixar" ficam.

- [ ] **Step 2:** Build: `npm run build` → esperar `✓ built`. Corrigir qualquer variável órfã (ex: `pronto/buff/vidErro/proxyDe` se ficarem sem uso — remover).

- [ ] **Step 3:** Commit: `git commit -am "Catálogo: player sempre do Drive (remove versão leve/proxy)"` e push.

- [ ] **Step 4:** Verificar: abrir um vídeo no Catálogo (Safari) — toca o iframe do Drive direto, sem a mensagem de "gerando versão leve".

---

### Task 2: Colunas de catálogo na tabela `brutos`

**Files:** Supabase (SQL via REST). Sem arquivo no repo (registrar o SQL no plano).

- [ ] **Step 1:** Rodar (via `curl` no endpoint SQL do Supabase, com `SUPA_SECRET`, ou pelo painel) o SQL:
```sql
alter table brutos
  add column if not exists nome text,
  add column if not exists mes text,
  add column if not exists dia text,
  add column if not exists capa_url text,
  add column if not exists mb int,
  add column if not exists seg int,
  add column if not exists criado timestamptz,
  add column if not exists pasta_id text;
```
(Já existem: `drive_id` PK, `ia_tipo`/`tipo`, `comentario`, `card_id`.)

- [ ] **Step 2:** Verificar: `select column_name from information_schema.columns where table_name='brutos'` inclui as novas.

---

### Task 3: Lib de varredura compartilhada

**Files:** Create: `scripts/lib/scan.mjs`

- [ ] **Step 1:** Extrair pra esse módulo a varredura recursiva (igual a de `netlify/functions/brutos.mjs`): `export async function listarVideos(driveToken)` que devolve `[{id, name, size, createdTime, mimeType, mes, dia, pastaId}]`, varrendo `BRUTOS_ROOTS`, ignorando `Editando`, e carregando o contexto de pasta (mês por nome, dia por número). Exportar também `BRUTOS_ROOTS`.

- [ ] **Step 2:** Verificar local: `node -e "import('./scripts/lib/scan.mjs').then(m=>console.log(Object.keys(m)))"` lista `listarVideos`, `BRUTOS_ROOTS`.

---

### Task 4: `scripts/gerar-capas.mjs` (capa + metadados no banco)

**Files:** Create: `scripts/gerar-capas.mjs` (novo; `gerar-proxies.mjs` pode ser removido depois)

- [ ] **Step 1:** Escrever o script: usa `scan.mjs` pra listar; pega do banco os `drive_id` que já têm `capa_url` (`GET /rest/v1/brutos?select=drive_id,capa_url`); pra cada vídeo NÃO processado:
  1. baixa só um prefixo do vídeo via **Range** (`bytes=0-15728639`, ~15MB) pra um arquivo temporário;
  2. `ffmpeg -y -ss 1 -i tmp -frames:v 1 -vf scale=640:-2 -q:v 4 capa.jpg` (se falhar por `-ss 1`, tenta `-ss 0`);
  3. sobe `POST {SUPA}/storage/v1/object/proxies/{id}.jpg` (bucket `proxies`, `x-upsert:true`);
  4. UPSERT em `brutos`: `{drive_id, nome, mes, dia, capa_url: '.../proxies/{id}.jpg', mb, seg?, criado, pasta_id}` (`POST /rest/v1/brutos` com `Prefer: resolution=merge-duplicates`).
- Aceita arg opcional `--pasta <id>` pra varrer só aquela subárvore.
- Env: `GOOGLE_SERVICE_ACCOUNT_KEY`, `SUPA_SECRET`.

- [ ] **Step 2:** Verificar local (uma pasta pequena): `SUPA_SECRET=... GOOGLE_SERVICE_ACCOUNT_KEY="$(cat ~/Downloads/baixa-*.json)" node scripts/gerar-capas.mjs --pasta 1ZfnkV-VzlKx_5Jf-kXKdxI4iCBtAC2q7` (Julho/01) → algumas capas sobem e linhas aparecem em `brutos`. Conferir `GET /rest/v1/brutos?select=drive_id,capa_url,mes,dia&limit=5`.

- [ ] **Step 3:** Commit.

---

### Task 5: `/api/brutos` lê do banco

**Files:** Modify: `netlify/functions/brutos.mjs`

- [ ] **Step 1:** Reescrever: `GET {SUPA}/rest/v1/brutos?select=drive_id,nome,mes,dia,capa_url,mb,seg,criado&order=criado.desc` (com `apikey`+`Authorization` = anon key OU service; usar a **anon key** já disponível `VITE_SUPABASE_ANON_KEY` se a RLS permitir leitura, senão o service secret). Mapear pra `{id:drive_id, nome, mb, seg, thumb:capa_url, criado, mes, dia}`. Remover a varredura do Drive (mantém `_google.mjs` só pro token do worker de download, que não usa esta função).

- [ ] **Step 2:** Verificar: `curl .../api/brutos` responde rápido (<1s) com os vídeos que estão no banco (os que já rodaram no Task 4).

- [ ] **Step 3:** Commit + deploy.

---

### Task 6: `processar.yml` aceita link de pasta + roda gerar-capas

**Files:** Modify: `.github/workflows/processar.yml`

- [ ] **Step 1:** Adicionar `inputs: { pasta: { required: false } }` no `workflow_dispatch`. Trocar o passo de proxies por `node scripts/gerar-capas.mjs ${{ inputs.pasta && format('--pasta {0}', inputs.pasta) || '' }}`. Manter env `GOOGLE_SERVICE_ACCOUNT_KEY`, `SUPA_SECRET`. (O passo de classificar fica como está por ora — follow-up.)

- [ ] **Step 2:** Commit + push.

- [ ] **Step 3:** Verificar: disparar o workflow (pelo GitHub ou `/api/processar-brutos`) e conferir que ele roda e popula `brutos`.

---

### Task 7: `/api/processar-brutos` aceita link de pasta

**Files:** Modify: `netlify/functions/processar-brutos.mjs`

- [ ] **Step 1:** Ler `?pasta=` da query (ou body); extrair o id do link (`/folders/<id>`); passar como `inputs.pasta` no `POST .../workflows/processar.yml/dispatches` (`{ref:'main', inputs:{pasta:<id>}}`).

- [ ] **Step 2:** Verificar: `curl -X POST '.../api/processar-brutos?pasta=<link>'` → 200 `{ok:true}` e o workflow dispara com o input.

- [ ] **Step 3:** Commit + deploy.

---

### Task 8: Catálogo — capa do banco + input de pasta + botão

**Files:** Modify: `src/components/Catalogo.tsx`

- [ ] **Step 1:** A capa já vem em `b.thumb` (agora = `capa_url`); o `onError` esconde se faltar (placeholder). Adicionar, perto do "Processar novos": um `<input>` pra colar o link da pasta + botão que chama `POST /api/processar-brutos?pasta=<link>`; feedback "disparado, roda em background".

- [ ] **Step 2:** Build + deploy + verificar no Safari: capas aparecem (dos processados), o campo de pasta dispara o processamento.

- [ ] **Step 3:** Commit.

---

## Self-Review
- **Cobertura do spec:** capa própria (T4), player Drive (T1), lista do banco (T5), scan sob demanda botão+pasta (T6/T7/T8), mês/dia da pasta (T3/T4). Classificação IA: explicitamente follow-up.
- **Placeholders:** nenhum passo vago; SQL e comandos concretos.
- **Consistência:** `capa_url`/`thumb`/`brutos.drive_id` usados igual em T4/T5/T8.
