# Batizar brutos + IA propõe card SR — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) para implementar tarefa a tarefa. Passos usam checkbox (`- [ ]`).
>
> **Nota de verificação:** o projeto não tem testes unitários. A verificação de cada tarefa é: compilar (`npm run build` = tsc+vite; `node --check` pros scripts), deployar no Cloudflare Pages e conferir por `curl`/consulta ao Supabase — o mesmo fluxo usado no resto do projeto. Deploy: `cd <projeto> && CLOUDFLARE_API_TOKEN=<tok> CLOUDFLARE_ACCOUNT_ID=9c13fe3e5915ab63f379b644613ed261 npx wrangler pages deploy dist --project-name=central-gravacao --branch=main`.

**Goal:** Renomear o bruto no Drive ao ligar num card (título do card, ou `SR - {título da IA}` no sem-roteiro), e deixar a IA propor cards SR pros brutos "boa" sem card, com aprovação inline no Catálogo.

**Architecture:** Endpoint server-side `functions/api/bruto-batizar.js` (Cloudflare Pages, conta de serviço via `_util.js`) decide/aplica o nome no Drive. O pipeline `classificar-brutos.mjs` gera um título curto por bruto e grava em `sugestao_titulo`. O Catálogo mostra a proposta SR (Aprovar/Rejeitar) e chama batizar nos fluxos de ligar/desligar/criar-e-ligar.

**Tech Stack:** React+TS (Vite), Cloudflare Pages Functions (Workers), Supabase (`brutos`, `cards`), Groq (llama-3.3-70b), Node no GitHub Actions.

---

## Estrutura de arquivos

- **Supabase (SQL manual)** — 3 colunas em `brutos`.
- **`functions/api/bruto-batizar.js`** (novo) — endpoint que renomeia o bruto no Drive conforme o card ligado (ou reverte ao desligar).
- **`scripts/classificar-brutos.mjs`** (modificar) — o prompt de classificação passa a devolver também `titulo`; grava em `sugestao_titulo`.
- **`src/data/catalogoBrutos.ts`** (modificar) — campos novos na interface `Classificacao` + `select`; helpers `batizar()` e `rejeitarSugestao()`.
- **`src/components/Catalogo.tsx`** (modificar) — chama `batizar` em ligar/desligar/criarELigar; mostra a proposta SR com Aprovar/Rejeitar.

---

### Task 1: Colunas no banco

**Files:**
- Supabase SQL editor (manual, pelo usuário)

- [ ] **Step 1: Rodar o SQL**

```sql
alter table brutos add column if not exists nome_original text;
alter table brutos add column if not exists sugestao_titulo text;
alter table brutos add column if not exists sugestao_rejeitada boolean default false;
```

- [ ] **Step 2: Verificar as colunas**

Run:
```bash
SUPA="https://kkvuioyferqbilfwdkqa.supabase.co"; SECRET="<sb_secret>"
curl -s "$SUPA/rest/v1/brutos?select=drive_id,nome_original,sugestao_titulo,sugestao_rejeitada&limit=1" -H "apikey: $SECRET" -H "Authorization: Bearer $SECRET"
```
Expected: JSON com os campos (valores null) — sem erro de coluna inexistente.

---

### Task 2: Endpoint `bruto-batizar`

**Files:**
- Create: `functions/api/bruto-batizar.js`

Regras: card com roteiro → `título do card`; sem roteiro → `SR - {sugestao_titulo | Groq da transcrição | título do card}`; sufixo `(N)` por tomada extra do mesmo card; preserva `nome_original` e a extensão; sem card → reverte pro `nome_original`. DB via chave anon (RLS de `brutos` libera anon; `cards` é lida por anon).

- [ ] **Step 1: Criar o arquivo**

```js
import { googleToken } from './_util.js'

const SUPA = (env) => env.VITE_SUPABASE_URL || 'https://kkvuioyferqbilfwdkqa.supabase.co'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

function sanitizar(nome) {
  return (nome || '').replace(/[\/\\:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
}

// título curto via Groq (fallback do SR quando não há sugestao_titulo)
async function tituloDaTranscricao(env, transc) {
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.GROQ_API_KEY },
      body: JSON.stringify({
        model: GROQ_MODEL, temperature: 0.2, response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Gere um título curto (3 a 6 palavras) que resuma o assunto do vídeo, pra nomear o arquivo. Responda só JSON {"titulo":"..."}.' },
          { role: 'user', content: String(transc || '').slice(0, 4000) },
        ],
      }),
    })
    if (!r.ok) return ''
    const d = await r.json()
    return JSON.parse(d.choices[0].message.content).titulo || ''
  } catch { return '' }
}

export async function onRequest({ request, env }) {
  try {
    if (request.method !== 'POST') return Response.json({ error: 'método inválido' }, { status: 405 })
    const { drive_id } = await request.json().catch(() => ({}))
    if (!drive_id) return Response.json({ error: 'falta drive_id' }, { status: 400 })
    const S = SUPA(env), KEY = env.VITE_SUPABASE_ANON_KEY
    const hdr = { apikey: KEY, Authorization: 'Bearer ' + KEY }
    const idq = encodeURIComponent(drive_id)

    const b = (await (await fetch(`${S}/rest/v1/brutos?select=drive_id,card_id,nome,nome_original,transcricao,sugestao_titulo&drive_id=eq.${idq}`, { headers: hdr })).json())[0]
    if (!b) return Response.json({ error: 'bruto não encontrado' }, { status: 404 })

    let alvo
    if (!b.card_id) {
      if (!b.nome_original) return Response.json({ ok: true, nome: b.nome }) // nada pra reverter
      alvo = b.nome_original
    } else {
      const card = (await (await fetch(`${S}/rest/v1/cards?select=titulo,sem_roteiro&id=eq.${encodeURIComponent(b.card_id)}`, { headers: hdr })).json())[0]
      if (!card) return Response.json({ error: 'card não encontrado' }, { status: 404 })
      let base
      if (card.sem_roteiro) {
        let t = b.sugestao_titulo || ''
        if (!t && b.transcricao) t = await tituloDaTranscricao(env, b.transcricao)
        base = 'SR - ' + sanitizar(t || card.titulo || 'video')
      } else {
        base = sanitizar(card.titulo || 'video')
      }
      // sufixo: quantas OUTRAS tomadas já estão ligadas a este card (todas compartilham o base)
      const irmaos = await (await fetch(`${S}/rest/v1/brutos?select=drive_id&card_id=eq.${encodeURIComponent(b.card_id)}&drive_id=neq.${idq}`, { headers: hdr })).json()
      const n = Array.isArray(irmaos) ? irmaos.length : 0
      alvo = n > 0 ? `${base} (${n + 1})` : base
    }
    // preserva a extensão original
    const m = b.nome && b.nome.match(/\.[a-z0-9]{2,4}$/i)
    const ext = m ? m[0] : ''
    const nomeFinal = ext && !alvo.toLowerCase().endsWith(ext.toLowerCase()) ? alvo + ext : alvo

    // renomeia no Drive
    const token = await googleToken(env)
    const dr = await fetch(`https://www.googleapis.com/drive/v3/files/${drive_id}?supportsAllDrives=true&fields=id,name`, {
      method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nomeFinal }),
    })
    if (!dr.ok) {
      const msg = dr.status === 403 ? 'Conta de serviço sem permissão de edição no Drive.' : 'Drive ' + dr.status
      return Response.json({ error: msg }, { status: dr.status })
    }

    // atualiza o banco (nome; nome_original só na 1ª renomeação com card)
    const patch = { nome: nomeFinal }
    if (b.card_id && !b.nome_original) patch.nome_original = b.nome
    await fetch(`${S}/rest/v1/brutos?drive_id=eq.${idq}`, {
      method: 'PATCH',
      headers: { ...hdr, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    })
    return Response.json({ ok: true, nome: nomeFinal })
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Compilar as functions (valida imports/formato Workers)**

Run: `npx wrangler pages functions build --outdir=/tmp/pfb --compatibility-flags=nodejs_compat --compatibility-date=2024-11-01`
Expected: `✨ Compiled Worker successfully`.

- [ ] **Step 3: Build + deploy**

Run: `npm run build && CLOUDFLARE_API_TOKEN=<tok> CLOUDFLARE_ACCOUNT_ID=9c13fe3e5915ab63f379b644613ed261 npx wrangler pages deploy dist --project-name=central-gravacao --branch=main`
Expected: `Deployment complete`.

- [ ] **Step 4: Testar ao vivo com um bruto ligado a um card real**

Pegue um `drive_id` de bruto que já esteja ligado a um card com roteiro (via Supabase). Rode:
```bash
curl -s -X POST "https://audiovisual.alascasa.com.br/api/bruto-batizar" -H "Content-Type: application/json" -d '{"drive_id":"<ID>"}'
```
Expected: `{"ok":true,"nome":"<título do card>.MP4"}`. Confirme no Drive/Supabase que o `nome` mudou e `nome_original` guardou o antigo.

- [ ] **Step 5: Commit**

```bash
git add functions/api/bruto-batizar.js
git commit -m "feat: endpoint bruto-batizar (renomeia o bruto no Drive pelo card)"
```

---

### Task 3: Pipeline gera `sugestao_titulo`

**Files:**
- Modify: `scripts/classificar-brutos.mjs`

O classificador já chama o Groq com a transcrição e faz `upsert` com `ia_tipo/ia_tema/...`. Adiciona `titulo` ao JSON pedido e grava em `sugestao_titulo`.

- [ ] **Step 1: Pedir `titulo` no prompt de classificação**

Em `scripts/classificar-brutos.mjs`, na função `classificar`, a linha do `sys` termina com:
`... Responda SÓ JSON: {tipo, tema, tags (array curto), resumo (1 frase), confianca (0-1), motivo (curto)}.`

Trocar por:
```js
  const sys = `Você classifica brutos de vídeo de um criador jurídico (Direito Empresarial), na ordem de gravação. ${REGRAS} Responda SÓ JSON: {tipo, tema, tags (array curto), resumo (1 frase), confianca (0-1), motivo (curto), titulo (título curto de 3 a 6 palavras que resuma o assunto pra nomear o arquivo)}.`
```

- [ ] **Step 2: Gravar `sugestao_titulo` no upsert da PASSA 2**

No bloco da PASSA 2 (`await upsert({ drive_id: b.id, nome: b.nome, ... ia_motivo: c.motivo || null, atualizado_em: ... })`), adicionar o campo:
```js
    await upsert({
      drive_id: b.id, nome: b.nome, duracao: b.seg, transcricao: transc,
      ia_tipo: tipos.includes(c.tipo) ? c.tipo : 'erro', ia_tema: c.tema || null,
      ia_tags: Array.isArray(c.tags) ? c.tags : null, ia_resumo: c.resumo || null,
      ia_confianca: typeof c.confianca === 'number' ? c.confianca : null, ia_motivo: c.motivo || null,
      sugestao_titulo: (c.titulo && String(c.titulo).trim()) || null,
      atualizado_em: new Date().toISOString(),
    })
```

- [ ] **Step 3: Checar sintaxe**

Run: `node --check scripts/classificar-brutos.mjs`
Expected: sem saída (ok).

- [ ] **Step 4: Commit + rodar o pipeline**

```bash
git add scripts/classificar-brutos.mjs
git commit -m "feat: classificação também gera sugestao_titulo do bruto"
git push origin main
```
Dispara o processamento e confirme que `sugestao_titulo` preenche:
```bash
curl -s -X POST "https://audiovisual.alascasa.com.br/api/processar-brutos"
# depois de ~alguns min:
curl -s "https://kkvuioyferqbilfwdkqa.supabase.co/rest/v1/brutos?select=nome,ia_tipo,sugestao_titulo&ia_tipo=eq.boa&limit=5" -H "apikey: <secret>" -H "Authorization: Bearer <secret>"
```
Expected: os "boa" com `sugestao_titulo` preenchido.

---

### Task 4: Helpers e tipos em `catalogoBrutos.ts`

**Files:**
- Modify: `src/data/catalogoBrutos.ts`

- [ ] **Step 1: Campos novos na interface `Classificacao` + no `select`**

Na interface `Classificacao`, depois de `card_id: string | null`, adicionar:
```ts
  sugestao_titulo: string | null
  sugestao_rejeitada: boolean | null
```
No `select` de `listarClassificacoes`, trocar a string por:
```ts
    .select('drive_id,transcricao,ia_tipo,ia_tema,ia_resumo,ia_confianca,ia_motivo,tipo,confirmado,card_id,sugestao_titulo,sugestao_rejeitada')
```

- [ ] **Step 2: Helpers `batizar` e `rejeitarSugestao`**

No fim do arquivo, adicionar:
```ts
// Renomeia o bruto no Drive conforme o card ligado (ou reverte ao desligar). Server-side.
export async function batizar(drive_id: string): Promise<string | null> {
  try {
    const r = await fetch('/api/bruto-batizar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drive_id }),
    })
    const d = await r.json().catch(() => ({}))
    return r.ok ? (d.nome ?? null) : null
  } catch { return null }
}

// Rejeita a sugestão de card SR da IA (some do Catálogo).
export async function rejeitarSugestao(drive_id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('brutos').upsert({ drive_id, sugestao_rejeitada: true }, { onConflict: 'drive_id' })
}
```

- [ ] **Step 3: Compilar**

Run: `npm run build`
Expected: `built in ...` sem erro de tipo.

- [ ] **Step 4: Commit**

```bash
git add src/data/catalogoBrutos.ts
git commit -m "feat: catalogoBrutos ganha batizar/rejeitarSugestao e campos de sugestão"
```

---

### Task 5: Catálogo — batizar ao ligar + proposta SR

**Files:**
- Modify: `src/components/Catalogo.tsx`

- [ ] **Step 1: Importar os helpers**

Na linha de import de `catalogoBrutos`, adicionar `batizar` e `rejeitarSugestao`:
```ts
import { listarClassificacoes, confirmarTipo, ligarBruto, batizar, rejeitarSugestao, type Classificacao, type TipoBruto } from '../data/catalogoBrutos'
```

- [ ] **Step 2: Estado de feedback do nome**

Perto dos outros `useState` do componente, adicionar:
```ts
  const [avisoNome, setAvisoNome] = useState('')
```

- [ ] **Step 3: Chamar batizar em `ligar` e `desligar`**

Na função `ligar(cardId)`, depois de `await ligarBruto(id, cardId, nome).catch(() => {})`, adicionar:
```ts
    const novo = await batizar(id)
    if (novo) {
      setBrutos((bs) => (bs ? bs.map((b) => (b.id === id ? { ...b, nome: novo } : b)) : bs))
      setAvisoNome('Renomeado: ' + novo)
      setTimeout(() => setAvisoNome(''), 4000)
    }
```
Na função `desligar()`, depois de `await ligarBruto(id, null).catch(() => {})`, adicionar:
```ts
    const novo = await batizar(id)
    if (novo) setBrutos((bs) => (bs ? bs.map((b) => (b.id === id ? { ...b, nome: novo } : b)) : bs))
```

- [ ] **Step 4: Chamar batizar no `criarELigar`**

Em `criarELigar`, depois de `await ligar(card.id)`, a renomeação já acontece dentro de `ligar` (Step 3) — não repetir. Confirmar que `ligar(card.id)` é chamado (já é).

- [ ] **Step 5: Handlers da proposta SR**

Adicionar dentro do componente:
```ts
  async function aprovarSugestao(b: Bruto, titulo: string) {
    setLigando(true)
    try {
      const semana = b.criado ? semanaDeGravacao(new Date(b.criado)) : undefined
      const card = await store.createCard({ semRoteiro: true, titulo, categoria: 'Conteúdo', fase: 'A editar', semana })
      setCards((cs) => [card, ...cs])
      await ligar(card.id) // liga + batiza (SR - titulo)
    } finally { setLigando(false) }
  }
  async function rejeitar(b: Bruto) {
    setClassif((m) => ({ ...m, [b.id]: { ...(m[b.id] || { drive_id: b.id }), sugestao_rejeitada: true } as Classificacao }))
    await rejeitarSugestao(b.id).catch(() => {})
  }
```

- [ ] **Step 6: Bloco da proposta no player**

Na seção "Tarefa ligada" do player, ANTES do `if (!linkOpen) { ... + Ligar a uma tarefa }`, inserir a proposta quando elegível. Localizar o trecho que renderiza a tarefa ligada e, no ramo em que NÃO há card ligado (`!cardLig`), adicionar antes do botão "+ Ligar a uma tarefa":
```tsx
                      {(() => {
                        const c = classif[aberto.id]
                        const ehBoa = (c?.tipo || c?.ia_tipo) === 'boa'
                        const sugere = ehBoa && !c?.card_id && !c?.sugestao_rejeitada && c?.sugestao_titulo
                        if (!sugere) return null
                        return (
                          <div className="mb-2 rounded-lg border border-brand/30 bg-brand/8 p-2.5">
                            <div className="text-[11px] font-bold uppercase tracking-wide text-brand-2 mb-1">IA sugeriu um card</div>
                            <div className="text-[13px] font-semibold mb-2">SR - {c!.sugestao_titulo}</div>
                            <div className="flex items-center gap-2">
                              <button disabled={ligando} onClick={() => aprovarSugestao(aberto, c!.sugestao_titulo!)} className="text-[12px] font-semibold text-white bg-brand rounded-lg px-3 py-1.5 disabled:opacity-50">Aprovar</button>
                              <button onClick={() => rejeitar(aberto)} className="text-[12px] font-medium text-muted hover:text-rose-300 px-2">Rejeitar</button>
                            </div>
                          </div>
                        )
                      })()}
```

- [ ] **Step 7: Toast do nome**

No JSX do modal do player (dentro do container do player, perto do cabeçalho), adicionar o aviso:
```tsx
            {avisoNome && <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 text-[12px] font-semibold text-emerald-300 bg-black/70 rounded-full px-3 py-1">{avisoNome}</div>}
```
(colocar dentro do `<div className="relative flex-1 min-h-0">` do player, como primeiro filho.)

- [ ] **Step 8: Compilar + deploy + verificar ao vivo**

Run: `npm run build && CLOUDFLARE_API_TOKEN=<tok> CLOUDFLARE_ACCOUNT_ID=9c13... npx wrangler pages deploy dist --project-name=central-gravacao --branch=main`
Verificar no `audiovisual.alascasa.com.br`: abrir um bruto "boa" sem card → aparece "IA sugeriu: SR - ...". Aprovar → cria card em "A editar", liga, e o nome do bruto vira `SR - ...`. Abrir um bruto e ligar a um card com roteiro → nome vira o título do card + toast.

- [ ] **Step 9: Commit**

```bash
git add src/components/Catalogo.tsx
git commit -m "feat: Catálogo batiza ao ligar e mostra proposta de card SR da IA"
git push origin main
```

---

## Self-review (feito)

- **Cobertura do spec:** Parte 1 (batizar) = Tasks 2 + 5; regra de nome/sufixo/original/reverter = Task 2; Parte 2 (proposta SR) = Tasks 3 (título) + 5 (UI); colunas = Task 1; helpers/tipos = Task 4. Tudo coberto.
- **Consistência de tipos:** `batizar(drive_id): Promise<string|null>` e `rejeitarSugestao(drive_id): Promise<void>` (Task 4) usados igual na Task 5. `Classificacao.sugestao_titulo/sugestao_rejeitada` (Task 4) usados na Task 5. Endpoint recebe `{drive_id}` (Task 2) = o que `batizar` envia (Task 4).
- **DB por anon:** o endpoint escreve em `brutos` com a chave anon (RLS libera) e lê `cards` (anon lê). Sem `SUPA_SECRET` (não está nas envs do Pages).
- **Sem placeholders:** código completo em cada passo.
