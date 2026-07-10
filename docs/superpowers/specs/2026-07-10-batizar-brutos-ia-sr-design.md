# Batizar brutos + IA propõe card SR — Design

**Data:** 2026-07-10

**Goal:** Ao ligar um bruto a um card, renomear o arquivo no Google Drive pra ficar de fácil identificação. E, pros brutos "sem roteiro", a IA propõe um card sozinha (nome gerado da transcrição), que o humano aprova no Catálogo — aprovado, o card vai pra "A editar" (gravados) e o bruto é batizado.

**Arquitetura:** Duas partes que compartilham a lógica de nome. (1) Um endpoint server-side "batizar" que renomeia o bruto no Drive conforme o card ligado. (2) O pipeline de classificação gera um título curto por bruto "boa"; o Catálogo mostra a sugestão de card SR dos "boa" sem card, com Aprovar/Rejeitar inline. Aprovar = criar card + ligar + batizar (reusa funções existentes + o endpoint novo).

**Tech stack:** React+TS (Catalogo.tsx), Cloudflare Pages Functions (`functions/api/*.js`, motor de Workers, Web Crypto + conta de serviço via `_util.js`), Groq (llama-3.3-70b) no pipeline, Supabase (tabela `brutos`, cards via `store`), scripts Node no GitHub Actions (`classificar-brutos.mjs`).

**Host:** o site vivo é o Cloudflare Pages (`audiovisual.alascasa.com.br`). As funções novas vão em `functions/api/`. O Netlify está congelado (deploys pausados por crédito) — NÃO espelhar em `netlify/functions/` (código morto lá).

---

## Parte 1 — Batizar ao ligar

**Gatilho:** automático, logo após ligar um bruto a um card. Vale nos dois caminhos do player do Catálogo: "ligar a tarefa existente" e "criar e ligar". Feedback: toast curto com o novo nome (reusa o padrão de feedback já existente).

**Regra do nome:**
- Card **com roteiro** (`card.semRoteiro` falso) → nome = `título do card`.
- Card **sem roteiro** (`card.semRoteiro` verdadeiro) → nome = `SR - {título curto da IA}` (usa `sugestao_titulo` do bruto se existir; senão, chamada Groq na hora a partir da transcrição; se nem transcrição → fallback `SR - {título do card}`).
- **Sanitização:** tira `/ \ : * ? " < > |` e quebras de linha; corta em ~120 chars.
- **Múltiplas tomadas no mesmo card:** se já há outro(s) bruto(s) ligado(s) ao card cujo nome começa com o mesmo base, anexa ` (2)`, ` (3)`… ao base (o 1º fica sem sufixo).

**Preservar o original:** na 1ª vez que um bruto é renomeado, salva o `nome` atual em `nome_original` (só se ainda vazio). Isso não perde o `Cxxxx` da câmera.

**Ao desligar** (`card_id` vira null): reverte o nome no Drive pra `nome_original` (se houver).

**Endpoint `/api/bruto-batizar` (POST `{ drive_id }`):**
1. Lê o bruto no banco (`card_id`, `nome`, `nome_original`, `transcricao`, `sugestao_titulo`).
2. Se `card_id` null → nome-alvo = `nome_original` (reverter). Se não houver `nome_original`, não faz nada.
3. Se `card_id` presente → lê o card (título, sem_roteiro). Monta o nome-alvo pela regra acima (Groq só no caso SR sem `sugestao_titulo`).
4. Calcula sufixo de múltiplas tomadas (conta brutos do mesmo `card_id` com nome começando pelo base).
5. Se `nome_original` vazio, grava o `nome` atual nele.
6. Renomeia no Drive (`files/{drive_id}` PATCH name, conta de serviço — mesma auth do `bruto-rename`) e atualiza `brutos.nome`.
7. Retorna `{ ok, nome }`. Erros não quebram o link (o vínculo no banco já aconteceu antes); o toast mostra o erro.

**Fluxo no client:** as funções `ligar`, `desligar` e `criarELigar` (Catalogo.tsx), depois do `ligarBruto(...)` existente, chamam `POST /api/bruto-batizar { drive_id }` e atualizam o `nome` local + toast.

---

## Parte 2 — IA propõe card SR (aprovação no Catálogo)

**Detecção:** bruto com `ia_tipo = 'boa'` (ou `tipo` confirmado = 'boa') **e** `card_id` null **e** `sugestao_rejeitada` falso **e** `sugestao_titulo` presente → mostra proposta de card SR.

**Título da sugestão (no pipeline):** o passo de classificação (`classificar-brutos.mjs`) já chama o Groq com a transcrição. Estende-se o JSON de resposta pra incluir também `titulo` (3–6 palavras, descritivo). Grava em `brutos.sugestao_titulo`. Sem chamada Groq extra.

**UI no Catálogo:** no player (e um selinho no card da grade), o bruto elegível mostra:
> IA sugeriu card: **SR - {sugestao_titulo}** — [Aprovar] [Rejeitar]

- **Aprovar** →
  1. `store.createCard({ semRoteiro: true, titulo: sugestao_titulo, fase: 'A editar', categoria?, semana: semanaDeGravacao(bruto.criado) })`.
  2. `ligarBruto(drive_id, card.id, ...)`.
  3. `POST /api/bruto-batizar { drive_id }` (batiza `SR - {titulo}`).
  4. O selo some (agora o bruto tem card).
- **Rejeitar** → `upsert brutos { drive_id, sugestao_rejeitada: true }` (client, como `comentarBruto`). O selo some. (O humano liga no card certo manualmente se era de roteiro.)

---

## Mudanças no banco (1 SQL, o usuário roda)

```sql
alter table brutos add column if not exists nome_original text;
alter table brutos add column if not exists sugestao_titulo text;
alter table brutos add column if not exists sugestao_rejeitada boolean default false;
```

As colunas novas chegam ao Catálogo pelo `listarClassificacoes` (supabase direto, em `catalogoBrutos.ts`): adiciona `sugestao_titulo` e `sugestao_rejeitada` ao `select` e à interface `Classificacao`. `ia_tipo`/`tipo`/`card_id` já vêm por ali. `/api/brutos` não precisa mudar.

---

## Arquivos afetados

- **`functions/api/bruto-batizar.js`** (novo) — endpoint batizar (usa `googleToken` + `SUPA` do `_util.js`).
- **`scripts/classificar-brutos.mjs`** — prompt retorna também `titulo`; grava `sugestao_titulo`.
- **`src/components/Catalogo.tsx`** — chama batizar nos fluxos de ligar/desligar/criar-e-ligar; mostra a proposta SR com Aprovar/Rejeitar.
- **`src/data/catalogoBrutos.ts`** — helper `rejeitarSugestao(drive_id)` e (se preciso) `batizar(drive_id)` que chama o endpoint; campos novos na interface `Classificacao`.
- **`src/data/brutos.ts`** — (se `/api/brutos` passar os campos) tipo `Bruto` ganha o que for exibido na grade.

---

## Casos de borda

- **SR sem transcrição** no batizar → fallback `SR - {título do card}`.
- **Rename falha no Drive** (403 permissão / rede) → o link já está salvo; toast mostra o erro, nome fica o antigo.
- **Reprocessamento** → `sugestao_titulo` só é (re)gravado pelo pipeline; aprovar/rejeitar não é sobrescrito por reprocessar (o pipeline não mexe em `card_id`/`sugestao_rejeitada`).
- **Bruto já ligado** não mostra proposta (tem `card_id`).
- **Título com caracteres inválidos** → sanitizado antes de ir pro Drive.

## Fora de escopo (YAGNI)

- Fila/aba separada de sugestões (escolhido: inline no Catálogo).
- IA distinguir "espontâneo vs. leitura de roteiro" (escolhido: todo "boa" sem card propõe).
- Espelhar as funções no Netlify (host congelado).
- Aprovar/rejeitar em lote.
