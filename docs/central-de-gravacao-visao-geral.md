# Central de Gravação — Visão Geral

Ferramenta web própria da Alasca que **concentra todo o ciclo de produção de vídeo** — do roteiro à gravação, edição, finalização e tráfego — substituindo a planilha "Gravações Semanais". Um quadro Kanban único + um catálogo inteligente dos vídeos brutos do Drive, com IA cuidando da parte chata (transcrever, classificar, nomear).

**No ar em:** https://audiovisual.alascasa.com.br

---

## Arquitetura (visão de cima)

```
Navegador (React)
   │
   ├─ site + funções /api ......... Cloudflare Pages (audiovisual.alascasa.com.br)
   ├─ dados (cards, brutos) ....... Supabase (Postgres + Storage das capas)
   ├─ download / preview de vídeo . Cloudflare Worker (link assinado, streaming do Drive)
   └─ vídeos brutos + proxies ..... Google Drive (Shared Drive)

Processamento pesado (sob demanda, botão "Processar novos")
   └─ GitHub Actions ............. varre o Drive → gera capa + proxy 720p → IA classifica + nomeia
```

- **Frontend:** React + TypeScript + Vite + Tailwind + dnd-kit.
- **Funções `/api`:** Cloudflare Pages Functions (motor de Workers). Assinaturas HMAC e JWT do Google via Web Crypto; leitura/escrita no Supabase; disparo do GitHub Actions.
- **Banco:** Supabase — tabela `cards` (o quadro) e `brutos` (o catálogo + classificação).
- **IA:** Groq (Whisper `whisper-large-v3-turbo` pra transcrever, `openai/gpt-oss-120b` pra classificar/nomear).
- **Conta de serviço Google** (`brutos-reader@baixa-gravacoes`) com acesso ao Shared Drive dos brutos (ler + renomear + subir proxies).

---

## 1. O Quadro (Kanban)

Um quadro só, com colunas = fases da produção:

**A gravar → para Jaylton gravar → A editar → Em edição → Finalizado → No tráfego**

- **Cards** = um vídeo cada. Carregam documentos (roteiro), copy responsável, categoria (Conteúdo/Anúncio/Institucional/Captação), produto, urgência, comentário/aviso e as tomadas (brutos) ligadas.
- **Filtros:** por copy (Andressa/Sofia/Thayná + Sem roteiro), categoria e urgência.
- **Semanas com rollover:** o quadro abre na semana atual. O que **não foi concluído** (A gravar/Jaylton/A editar/Em edição) de semanas passadas **rola sozinho** pra semana atual, com uma **etiqueta mostrando a semana de origem** (↩ DD/MM). O concluído (Finalizado/No tráfego) fica na semana dele. Assim você abre e já vê tudo pendente, sem ficar voltando.
- **Arraste** entre colunas muda a fase. Cards finalizados vão pro Arquivo por mês.
- **Subir roteiros (IA):** a copy sobe um `.docx`/`.pdf` com vários vídeos e a IA (Groq) **destrincha em vários cards** automaticamente, cada um com o roteiro anexado.
- **Baixar vídeos em lote:** seleção de cards → baixa os brutos ligados de uma vez.
- **Links de card no ClickUp:** cada card tem link direto (`?card=id`); a origem é o domínio próprio, então os links novos já saem certos.

---

## 2. O Catálogo de brutos

Os vídeos brutos do Drive, organizados e navegáveis.

- **Fonte:** lê da tabela `brutos` (preenchida pelo processamento) — instantâneo, sem varrer o Drive ao vivo.
- **Organização tipo Finder:** pastas **mês → dia** derivadas da **pasta real do Drive** (Brutos > tipo > mês > dia).
- **Ordem pela sequência do clipe:** dentro de cada dia, ordena pelo **número do arquivo** (C0106, C0107, C0108…), não pela data do upload (que vem embaralhada em upload em lote).
- **Capa** por vídeo (frame extraído por ffmpeg, guardado no Supabase Storage).
- **Filtros:** por tipo (boa/erro/gancho/complemento), produto e semana.
- **Renomear** edita o arquivo **no próprio Drive** (conta de serviço com permissão de Editor).
- **Baixar** o original em lote (link assinado, sem aviso de vírus).

---

## 3. Player + versão leve (proxy 720p)

Vídeos 4K crus travam e o player do Drive às vezes mostra "ainda processando".

- Para cada bruto, o pipeline gera uma **versão leve 720p** (H.264 faststart) e guarda numa pasta `__proxies__` no Drive.
- O player toca esse **proxy via `<video>`** (servido pelo Cloudflare Worker, com suporte a seek e cache) — **instantâneo, com áudio, sem "processando"**.
- Se um bruto ainda não tem proxy, cai no **iframe do Drive** como fallback.

---

## 4. IA — classifica, nomeia e propõe cards

Roda no pipeline, em cima da transcrição de cada bruto.

- **Transcrição:** Groq Whisper (só o áudio, 16kHz mono).
- **Classificação:** `openai/gpt-oss-120b` vendo o clipe **anterior e o próximo** (na ordem do número) pra pegar **regravação** — se o próximo refaz a mesma fala, o atual = erro. Tipos: **boa / erro / gancho / complemento**. É proposta; o humano confirma/corrige no player (e a correção vira exemplo few-shot).
- **Título automático:** a IA gera um título curto de cada bruto (`sugestao_titulo`).
- **Proposta de card SR:** todo bruto **"boa" sem card** vira uma **sugestão de card "sem roteiro"** no Catálogo — com o título **editável** e botões **Aprovar/Rejeitar**. Aprovar cria o card em "A editar", liga o bruto e o batiza. O card leva o título limpo (já tem o selo "sem roteiro").

---

## 5. Batizar (renomear no Drive ao ligar)

Quando um bruto é ligado a um card, o arquivo no Drive é **renomeado automaticamente** pra ficar fácil de achar:

- **Com roteiro** → `Título do card`.
- **Sem roteiro** → `SR - {título do card}` (o "SR" fica **só no nome do arquivo**, não no card).
- **Várias tomadas do mesmo card** → sufixo ` (2)`, ` (3)`…
- **Preserva o original:** guarda `nome_original` (o `Cxxxx` da câmera) na 1ª vez; ao desligar, **reverte**.

---

## 6. Download seguro (Cloudflare Worker)

- Worker próprio faz **streaming do Drive** (via conta de serviço) — sem aviso de vírus, qualquer tamanho, **egress grátis**.
- Só serve com **link assinado (HMAC)** de curta validade e só arquivos do **Shared Drive dos brutos**.
- Dois modos: **download** (attachment) e **inline** (pro player tocar, com Range + cache).

---

## 7. Pipeline de processamento (GitHub Actions)

Disparado pelo botão **"Processar novos"** (sob demanda, não automático). Passos:

1. **Capas + metadados:** varre o Drive recursivamente (nova estrutura Brutos > tipo > mês > dia, ignora "Editando"/"__proxies__"), gera 1 capa por bruto novo, sincroniza mês/dia, e faz *prune* dos que sumiram.
2. **Proxies 720p:** gera a versão leve dos que ainda não têm.
3. **IA:** transcreve + classifica (na ordem do número) + gera os títulos. Flag `reclassificar` re-classifica tudo mantendo a transcrição.

Scripts: `scripts/gerar-capas.mjs`, `scripts/gerar-proxies.mjs`, `scripts/classificar-brutos.mjs`.

---

## 8. Hospedagem, domínio e histórico

- **Host atual: Cloudflare Pages** (`central-gravacao.pages.dev`), com **domínio próprio `audiovisual.alascasa.com.br`** (CNAME na Cloudflare do `alascasa.com.br`, gerido pelo Caio).
- **Deploy:** via `wrangler pages deploy` (upload direto) — não consome os 500 builds/mês.
- **Por que Cloudflare:** Vercel pausou por banda; Netlify pausou por crédito (~20 deploys/mês). Cloudflare Pages tem free bem mais generoso (500 builds/mês, banda/requests ilimitados). Com domínio próprio, o link é **fixo pra sempre** — trocar de host por baixo não muda o endereço.

---

## 9. Limites e custos (tudo no free)

| Recurso | Papel | Teto grátis | Situação |
|---|---|---|---|
| **GitHub Actions** | processamento (capa/proxy/IA) | 2000 min/mês (repo privado) | o único a acompanhar; ~12% em julho |
| **Cloudflare Pages** | site + funções /api | 500 builds/mês (deploy direto não conta) + banda ilimitada | folgado |
| **Cloudflare Worker** | download/preview | egress grátis | folgado |
| **Supabase** | banco + capas | 1 GB storage / 5 GB egress | bem abaixo |
| **Groq** | IA | rate limit (retry pra 429) | não trava |
| **Google Drive** | vídeos + proxies | storage Workspace | amplo |

O gastão de Actions são os **backfills de proxy** (one-time); o dia a dia é barato.

---

## 10. Como operar (fluxos do dia a dia)

- **Subiu vídeos novos no Drive?** → botão **"Processar novos"** no Catálogo. Em uns minutos eles entram com capa, proxy e classificação.
- **Vídeo sem roteiro?** → a IA propõe o card no Catálogo; você edita o título e **Aprova** (vai pra "A editar").
- **Vídeo de um roteiro?** → abre o card, liga o bruto (o arquivo é renomeado sozinho pro título do card).
- **Copy tem roteiros novos?** → **"Subir roteiros"** no quadro; a IA cria os cards.
- **Semana virou?** → é só abrir; o pendente rola sozinho com a etiqueta de origem.

---

## Stack / arquivos-chave

- **Front:** `src/` (App.tsx, components/Board, Column, CardItem, Catalogo, QuadroToolbar, …); dados em `src/data/` (store/supabaseStore, brutos, catalogoBrutos).
- **Funções:** `functions/api/*.js` (brutos, processar, processar-brutos, download-url, preview-url, bruto-rename, bruto-batizar) + `_util.js`.
- **Worker:** `worker/index.js`.
- **Pipeline:** `.github/workflows/processar.yml` + `scripts/*.mjs`.
- **Specs/planos:** `docs/superpowers/`.
