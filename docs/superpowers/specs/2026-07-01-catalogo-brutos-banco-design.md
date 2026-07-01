# Catálogo de brutos por banco (escalável) + capa própria + player do Drive

Data: 2026-07-01

## Contexto e objetivo

O Catálogo de brutos hoje **varre o Google Drive ao vivo** a cada abertura (`/api/brutos` faz varredura recursiva da pasta Brutos). Isso:
- Fica mais lento a cada mês (mais pastas/vídeos) e pode estourar o timeout da função.
- Re-varre tudo sempre, sem o usuário controlar.
- Depende de miniatura do Drive (assíncrona; vídeo novo fica sem capa).
- Ainda tem a lógica de "versão leve" (proxy Supabase) que **não é mais usada** — o player que roda é o do próprio Drive (iframe).

Objetivo: Catálogo **instantâneo e escalável**, lendo de um **banco** que é preenchido por um **processamento sob demanda**, com **capa gerada por nós** e **player sempre do Drive**.

## Decisões (aprovadas)

1. **Capa: gerada na hora.** Um passo leve extrai **1 frame** de cada vídeo novo (ffmpeg) e salva como capa. Não gera mais a versão-leve completa.
2. **Player: sempre o iframe do Drive.** Remove a lógica de proxy/`fonte` e a mensagem "gerando versão leve".
3. **Lista vem do banco.** O Catálogo lê a lista de brutos do Supabase (não varre o Drive ao vivo).
4. **Scan sob demanda, com 2 gatilhos:**
   - "Processar novos": varre a raiz de Brutos e processa **só o que ainda não está salvo** (incremental).
   - Campo pra **colar o link de uma pasta** e escanear **só ela**.
5. **Mês/dia pela pasta real** do Drive (não pela data de upload), capturado na varredura e salvo no banco.
6. **Classificação por IA (Groq)** continua, como parte do processamento.

## Arquitetura

```
Drive (Brutos/tipo/mês/dia/vídeos)
   │  (varredura sob demanda: botão ou link de pasta)
   ▼
GitHub Actions (processar.yml)
   ├─ varre recursivo (ignora "Editando"), pega mês/dia da pasta
   ├─ p/ cada vídeo NÃO salvo: extrai 1 frame → capa no Supabase Storage
   ├─ classifica por IA (Groq)
   └─ UPSERT na tabela `brutos` (id, nome, mês, dia, capa, mb, seg, criado, tipo/ia_tipo)
   ▼
Supabase (tabela `brutos` = catálogo)
   ▼
/api/brutos  → lê do banco (instantâneo)
   ▼
Catálogo (app): lista do banco, agrupada por mês/dia; player = iframe Drive; capa = imagem gerada
```

## Modelo de dados

A tabela `brutos` (hoje guarda classificação/vínculo) passa a ser o **catálogo completo**. Colunas necessárias (adicionar as que faltarem):
- `drive_id` (PK), `nome`
- `mes` (ex: "Julho 2026"), `dia` (ex: "01") — da pasta real
- `capa_url` (Supabase Storage) — null enquanto não processado
- `mb`, `seg`, `criado` (metadados)
- `ia_tipo` / `tipo` (classificação — já existem), `comentario`, `card_id` (vínculo — já existem)
- `pasta_id` (id da pasta-dia no Drive, pra reprocessar/rastrear)

## Componentes e mudanças

**Processamento (GitHub Actions):**
- `scripts/gerar-proxies.mjs` → **`gerar-capas.mjs`**: varredura recursiva nova (reusa a lógica de `brutos.mjs`), extrai 1 frame por vídeo novo, sobe capa, faz UPSERT dos metadados (incl. mês/dia). Não gera mais proxy de vídeo.
- `scripts/classificar-brutos.mjs`: usa a mesma varredura nova; classifica só os não classificados.
- `.github/workflows/processar.yml`: aceita `workflow_dispatch` com **input opcional `pasta`** (link/id) — quando vier, escaneia só ela.

**API:**
- `/api/brutos`: passa a **ler da tabela `brutos`** (SELECT), não varrer o Drive.
- `/api/processar-brutos`: aceita o link de pasta e repassa como input do dispatch.

**App (Catálogo):**
- Lista do banco (via `/api/brutos`).
- Remove `fonte`/proxy do player → sempre `<iframe>` do Drive. Remove a nota "gerando versão leve".
- Capa = `capa_url`; sem capa = placeholder. Agrupamento por `mes`/`dia`.
- UI: campo pra colar link de pasta + botão "Processar novos".

## Tratamento de erros / bordas
- Vídeo sem capa ainda (não processado) → placeholder limpo, não quebra.
- ffmpeg falha num vídeo → registra sem capa, segue os outros.
- Download continua pelo worker (link assinado + Shared Drive) — inalterado.

## Trade-offs
- **Vídeo novo só aparece após "Processar novos"** (ou colar a pasta) — não aparece sozinho no upload. É o preço do controle pedido e de não re-varrer sempre.
- Processamento roda no GitHub Actions (usa secrets já lá: GOOGLE_SERVICE_ACCOUNT_KEY, GROQ_KEY, SUPA_SECRET).

## Fora de escopo (YAGNI)
- Agendamento automático do scan (pode entrar depois se o usuário quiser).
- Migrar armazenamento dos brutos (segue no Drive).
- Mexer no player de tomada do CardDetail (avaliar depois se também tira o proxy).
