# "Para postar" + "Postados" — Design

**Data:** 2026-07-10

**Goal:** Duas abas novas com os vídeos **editados** (prontos): uma galeria "Para postar" onde o Jaylton acha pelo nome (definido pela IA), assiste e baixa pra postar, e marca como postado; e uma aba "Postados" com os que já foram. Layout de galeria limpa (capa + nome da IA + descrição breve).

**Arquitetura:** Um script no pipeline varre a pasta Editados do Drive (só mês ≥ Julho/2026 + Cortes), a IA gera um nome limpo + 1 frase de descrição a partir do nome do arquivo (só texto — sem transcrever), e guarda numa tabela `editados`. As abas leem a tabela. Marcar postado = flag no banco. Baixar reusa o worker (os editados estão no mesmo Shared Drive dos brutos).

**Tech Stack:** React+TS, Cloudflare Pages Functions, Supabase (`editados`), Groq (llama, texto), conta de serviço (Drive), GitHub Actions.

**Descobertas da exploração (confirmadas):**
- Pasta Editados: `1F_9Qd3yDQI-pnWmrxsyDe5a-Z-LJ8N_C`. Subpastas: meses ("Julho | 2026", "Junho | 2026"…), "Cortes de caixinha - 2026", "Já postados", "Para programar - PDI" etc.
- Os vídeos estão no **mesmo Shared Drive dos brutos** (`0ANh1nYBAOuTbUk9PVA`) → o worker já baixa; a conta de serviço já tem acesso.
- Todos têm **thumbnail** do Drive.
- Nomes crus têm código/prefixo, ex.: `CONTEÚDO - 01 - 2026 - VIZINHO MURO.mp4`, `[SHORT] CONTEÚDO [VÍDEO] - 05 - 2026 - FILHO QUE SE APROPRIA.mp4`.

---

## Escopo (o que entra agora)

- Meses **≥ Julho/2026** (pastas "Mês | Ano") + a pasta **"Cortes de caixinha - 2026"** (seção à parte).
- FORA por agora: meses antigos, "Já postados", "Para programar - PDI".

## Fora de escopo (futuro)

- Integração com Instagram (descartada).
- Agrupar vídeos de **várias partes** (pendente da convenção de nome que o usuário vai definir) — deixar um gancho, não implementar.
- Filtro/refino de "postado" além da flag manual.

---

## Banco — tabela `editados` (1 SQL, o usuário roda)

```sql
create table if not exists editados (
  drive_id text primary key,
  nome_arquivo text,
  nome_ia text,
  descricao text,
  secao text,               -- 'video' (mês) ou 'corte'
  thumb text,               -- thumbnailLink do Drive
  criado timestamptz,
  postado boolean default false,
  postado_em timestamptz,
  atualizado_em timestamptz
);
alter table editados enable row level security;
create policy "editados anon" on editados for all to anon using (true) with check (true);
```

---

## Pipeline — `scripts/gerar-editados.mjs` (novo)

Roda como passo no `processar.yml` (o botão "Processar novos" passa a atualizar os editados também). Idempotente.

1. Conta de serviço lista a pasta Editados (`supportsAllDrives`).
2. Seleciona: subpastas cujo nome casa `^(mês) \| (ano)` com (ano, mês) ≥ (2026, Julho) → `secao='video'`; a pasta "Cortes de caixinha - 2026" → `secao='corte'`. Varre recursivamente cada uma pegando os vídeos (id, nome, thumbnailLink, createdTime).
3. Pros vídeos **novos** (não estão na tabela) OU sem `nome_ia`: 1 chamada Groq (texto) que recebe o nome do arquivo e devolve `{ nome, descricao }` (nome limpo curto + 1 frase). Grava `nome_ia`, `descricao`, `nome_arquivo`, `secao`, `thumb`, `criado`.
4. Não mexe em `postado`/`postado_em` (isso é do humano).

Prompt (sistema): "Você recebe o nome de um arquivo de vídeo jurídico já editado (Direito Empresarial/Sucessório). Devolva SÓ JSON {nome (título curto e limpo, sem códigos/prefixos como [SHORT], CONTEÚDO, números, ano), descricao (1 frase do que o vídeo trata)}."

Envs do passo: `GROQ_KEY`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `SUPA_SECRET`.

---

## Funções `/api`

- **`functions/api/editados.js`** (novo, GET): lê `editados` do banco (chave anon), devolve `{ videos }` com `{ id, nome, descricao, secao, thumb, postado, postado_em, nomeArquivo }` ordenado por `criado desc`. O front separa por `postado` e `secao`.
- **`functions/api/download-url.js`** (modificar): hoje valida que o `id` está na tabela `brutos`. Passar a aceitar também `id` que está em **`editados`** (valida em `brutos` OU `editados` antes de assinar). O resto igual (mesmo Shared Drive, mesmo worker).

## Dados no front — `src/data/editados.ts` (novo)

```ts
export interface Editado {
  id: string; nome: string; descricao: string | null; secao: 'video' | 'corte'
  thumb: string | null; postado: boolean; postado_em: string | null; nomeArquivo: string
}
export async function listarEditados(): Promise<Editado[]>  // GET /api/editados
export async function marcarPostado(id: string, postado: boolean): Promise<void> // supabase upsert {postado, postado_em}
```

## Frontend

- **`src/components/Editados.tsx`** (novo) — galeria reutilizável, recebe prop `modo: 'postar' | 'postados'`.
  - Filtra `postado === (modo==='postados')`.
  - **Modo "postar":** duas seções — "Vídeos" (`secao==='video'`) e "Cortes" (`secao==='corte'`).
  - **Modo "postados":** lista simples (com data em `postado_em`).
  - **Card (limpo):** capa (thumb) + **nome (IA)** em destaque + **descrição** (1 linha, `line-clamp`). Clica → abre player (iframe do Drive `…/preview` ou `<video>` inline via worker) com **Baixar** (`/api/download-url?id=…`) e **Marcar como postado** (no modo postar) / **Desmarcar** (no modo postados).
- **`src/components/Header.tsx` + `src/App.tsx`** — adiciona as abas **"Para postar"** e **"Postados"** (roteia pra `<Editados modo=…>`).

---

## Limites (impacto)

Mínimo. A IA de nome/descrição é **só texto** (1 chamada Groq curta por vídeo, sem transcrição e sem proxy). ~28 vídeos hoje = alguns segundos de Actions + poucas chamadas Groq. Sem novos custos de storage/egress relevantes (capa vem do thumbnailLink do Drive). Continua ~12% do Actions.

## Casos de borda

- Vídeo sem thumbnailLink → card com placeholder (ícone de play).
- Nome de mês fora do padrão "Mês | Ano" → ignora (não vira seção de vídeo), a menos que seja a pasta de Cortes.
- `download-url` só assina id que está em `brutos` OU `editados` (mantém a trava de segurança).
- Reprocessar não sobrescreve `postado` (flag do humano).
