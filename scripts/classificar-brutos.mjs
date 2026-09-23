// Duas passadas: (1) transcreve o que falta (Whisper da Groq); (2) classifica em JANELAS da mesma
// gravação: a IA vê a sequência de tomadas do dia (começo e fim de cada fala, com a duração) e decide
// várias de uma vez — é assim que ela enxerga uma cadeia de regravações inteira, e não só o vizinho.
// Grava no Supabase (tabela brutos).
// Uso: GROQ_KEY=... SUPA_SECRET=... node scripts/classificar-brutos.mjs [--force] [--reclassificar]
//      --avaliar  → re-classifica os que uma pessoa já conferiu, SEM gravar, e mede o acerto
import { GoogleAuth } from 'google-auth-library'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { spawn } from 'node:child_process'

const GROQ = process.env.GROQ_KEY
const SECRET = process.env.SUPA_SECRET
const SUPA = 'https://kkvuioyferqbilfwdkqa.supabase.co'
const KEY_PATH = '/Users/gcosta/Downloads/baixa-gravacoes-04ae892ee0e9.json'
const FORCE = process.argv.includes('--force') // re-transcreve e re-classifica tudo
const SO_TRANSC = process.argv.includes('--so-transcrever')
const RECLASS = process.argv.includes('--reclassificar') // mantém transcrição, re-classifica tudo
const AVALIAR = process.argv.includes('--avaliar') // mede contra o que o humano conferiu; não grava nada
const TEAM = process.env.TEAM || 'jaylton'
const SO_SESSAO = (process.env.SO_SESSAO || '').split(',').map((x) => x.trim()).filter(Boolean) // ex.: "Agosto 2026 · dia 21"
const MODELO = 'openai/gpt-oss-120b'
const MODELO_LEVE = 'openai/gpt-oss-20b' // cota própria na Groq: o título não disputa com a classificação
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'classif-'))
if (!GROQ || !SECRET) { console.error('faltou GROQ_KEY ou SUPA_SECRET'); process.exit(1) }
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

const sb = (p, opts = {}) => fetch(`${SUPA}/rest/v1/${p}`, { ...opts, headers: { apikey: SECRET, Authorization: 'Bearer ' + SECRET, ...(opts.headers || {}) } })
const jsonOf = async (r) => { try { return await r.json() } catch { return [] } }

// frases-fantasma que o Whisper inventa em clipe silencioso/música → tratamos como silêncio
const LIXO = [/legenda[s]?\s+por/i, /subtitle[s]?\s+by/i, /amara\.org/i, /transcri(ç|c)[aã]o\s+por/i, /\bobrigado por assistir\b/i]
function limparTransc(t) {
  const s = (t || '').trim()
  if (!s) return ''
  if (/^[\s.,!?…♪\-]*$/.test(s)) return ''
  if (s.length < 70 && LIXO.some((re) => re.test(s))) return ''
  return s
}

// número do clipe da câmera (C0106 → 106, IMG_6532 → 6532, "04.MOV" → 4). Nome que não é de câmera
// (UUID do iPhone, "Janice Machado.mp4") fica sem número e vai pro fim, na ordem de upload.
// Antes o UUID "80658A95-..." virava o clipe 80658 e pulava pra longe da própria gravação.
function numDoNome(nome) {
  const s = (nome || '').trim().replace(/\.[a-z0-9]{2,4}$/i, '')
  const m = s.match(/^C0*(\d+)/i) || s.match(/^(?:IMG|DSC|DSCF|MVI|VID|DJI|GOPR|PXL)[_-]?0*(\d+)/i) || s.match(/^0*(\d+)$/)
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER
}
// A GRAVAÇÃO é o dia (mês + dia da pasta). "Parte 2" dentro do dia 21 continua sendo o dia 21.
// Vizinho de outro dia não é regravação de nada: a IA antes comparava o fim de uma gravação com o
// começo de outra porque ordenava o time inteiro por número.
const sessaoDe = (b) => (b.dia ? `${b.mes || '?'} · dia ${b.dia}` : b.pasta_id ? 'pasta ' + b.pasta_id : 'sem pasta')

async function listarBrutos() {
  const rows = await jsonOf(await sb(`brutos?select=drive_id,nome,nome_original,duracao,proxy_id,criado,mes,dia,pasta_id,transcricao,ia_tipo,ia_motivo,tipo&team=eq.${TEAM}`))
  const arr = (Array.isArray(rows) ? rows : []).map((b) => ({
    id: b.drive_id, nome: b.nome, seg: b.duracao, proxyId: b.proxy_id,
    num: numDoNome(b.nome_original || b.nome), criado: b.criado || '', sessao: sessaoDe(b),
    transcricao: b.transcricao, ia_tipo: b.ia_tipo, ia_motivo: b.ia_motivo, tipo: b.tipo,
  }))
  const porSessao = new Map()
  for (const b of arr) { if (!porSessao.has(b.sessao)) porSessao.set(b.sessao, []); porSessao.get(b.sessao).push(b) }
  for (const l of porSessao.values()) l.sort((a, b) => (a.num - b.num) || a.criado.localeCompare(b.criado))
  let sessoes = [...porSessao.values()]
  if (SO_SESSAO.length) sessoes = sessoes.filter((l) => SO_SESSAO.includes(l[0].sessao))
  return { todos: sessoes.flat(), sessoes }
}

// conta de serviço pra ler o proxy/original do DRIVE
const KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
  : fs.existsSync(KEY_PATH) ? JSON.parse(fs.readFileSync(KEY_PATH, 'utf8')) : null
let client = null
async function driveToken() {
  if (!client) client = await new GoogleAuth({ credentials: KEY, scopes: ['https://www.googleapis.com/auth/drive.readonly'] }).getClient()
  return (await client.getAccessToken()).token
}
async function baixar(fileId, dest) {
  let ultErro
  for (let tent = 0; tent < 3; tent++) {
    try {
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, { headers: { Authorization: 'Bearer ' + (await driveToken()) } })
      if (!r.ok || !r.body) throw new Error('drive ' + r.status)
      await new Promise((res, rej) => { const ws = fs.createWriteStream(dest); Readable.fromWeb(r.body).pipe(ws).on('finish', res).on('error', rej) })
      return
    } catch (e) { ultErro = e; await dormir(800 * (tent + 1)) }
  }
  throw ultErro
}

// Espera da Groq: 429 traz retry-after. Espera curta (limite por minuto) a gente aguarda; espera longa
// é a cota do DIA acabando — aí para e deixa o resto pra próxima rodada, em vez de travar o GitHub 2h.
class CotaEsgotada extends Error {}
async function esperarOuDesistir(r, tent, rotulo, teto = 90) {
  const ra = parseFloat(r.headers.get('retry-after') || '0')
  const seg = ra > 0 ? ra + 0.5 : 4 * (tent + 1)
  if (seg > teto) throw new CotaEsgotada(`${rotulo}: a Groq pediu ${Math.round(seg)}s de espera (cota do dia)`)
  process.stdout.write(`(${rotulo} ${r.status}, espero ${Math.round(seg)}s) `)
  await dormir(seg * 1000)
}

async function transcrever(file) {
  // extrai SÓ o áudio (16kHz mono, ~1MB) — vídeo grande passa do limite de 25MB do Whisper
  const audio = file + '.m4a'
  await new Promise((res, rej) => {
    const p = spawn('ffmpeg', ['-y', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'aac', '-b:a', '64k', audio], { stdio: ['ignore', 'ignore', 'ignore'] })
    p.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg audio ' + c))))
    p.on('error', rej)
  })
  try {
    const bytes = fs.readFileSync(audio)
    // 429 aqui era a causa das transcrições "vazias" do dia 21: 4 envios em paralelo estouravam o
    // limite por minuto do Whisper, o erro não era repetido e o clipe seguia como se fosse silêncio.
    for (let tent = 0; ; tent++) {
      const form = new FormData()
      form.append('file', new Blob([bytes], { type: 'audio/mp4' }), 'a.m4a')
      form.append('model', 'whisper-large-v3-turbo')
      form.append('language', 'pt')
      form.append('response_format', 'json')
      const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + GROQ }, body: form })
      if ((r.status === 429 || r.status >= 500) && tent < 8) { await esperarOuDesistir(r, tent, 'whisper', 600); continue }
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error('whisper ' + r.status + ' ' + JSON.stringify(d).slice(0, 120))
      return limparTransc(d.text)
    }
  } finally {
    fs.rmSync(audio, { force: true })
  }
}

async function groq(body, rotulo) {
  const payload = JSON.stringify(body)
  for (let tent = 0; ; tent++) {
    let r
    try {
      r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + GROQ, 'Content-Type': 'application/json' }, body: payload })
    } catch (e) {
      if (tent < 6) { await dormir(3000 * (tent + 1)); continue }
      throw e
    }
    if ((r.status === 429 || r.status >= 500) && tent < 10) { await esperarOuDesistir(r, tent, rotulo); continue }
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(rotulo + ' ' + r.status + ' ' + JSON.stringify(d).slice(0, 160))
    return d
  }
}

// ---------- o que a IA lê ----------
// Regras escritas a partir dos 56 erros da IA nos 131 clipes que uma pessoa conferiu (set/2026):
// ela chamava de "gancho" qualquer clipe curto (largada falsa, fala cortada), descartava tomada boa
// porque o clipe seguinte repetia a frase (mesmo quando o seguinte era continuação de 2 min, ou
// estava cortado), e punia conteúdo fora do Direito (vlog do almoço no escritório) como erro.
const REGRAS = `Tipos:
- "boa": tomada usável — a mensagem chega ao fim pelo menos uma vez dentro do clipe. Vídeo ou anúncio completo, com chamada no fim ("clica no botão", "comenta", "segue"), é "boa", mesmo começando forte.
- "gancho": SÓ a abertura curta (até uns 20s) que termina prometendo a continuação ("fica comigo", "fica nesse vídeo", "vou te explicar", "vou te mostrar agora") e NÃO desenvolve o conteúdo nem tem chamada pra clicar. Passou de 25s ou tem chamada → não é gancho.
- "complemento": continuação COMPLETA e bem dita de uma tomada anterior (começa no meio do raciocínio, "porque…", "e não é…", ou é o fecho/CTA separado do vídeo de antes).
- "erro": descarte.

Como decidir, nesta ordem:
1. A fala principal chegou ao fim? Se ela para no meio ("…"), a pessoa desiste ("de novo", "foi mal", "droga", "não, não", "Não." solto no fim) ou se corrige ("ah, não é X, é Y", "quase não") → "erro". Reticências seguidas de "Beleza." ou "Não." também é desistência.
2. Marca de fim de tomada NÃO é erro: "Foi?", "Foi.", "Fechou?", "Beleza?", "É isso", "Agora sim", "Acho que é isso", "Clica." — quando vêm DEPOIS de uma frase completa.
3. Tropeço no MEIO seguido da versão completa no mesmo clipe → "boa" (o editor corta). Sobra no fim depois da mensagem entregue ("agora eu vou…", conversa com a equipe) também não derruba uma tomada boa.
4. Fragmento: clipe curto com só o começo da fala, cortado ou com tropeço, é "erro" — NUNCA "complemento" nem "gancho". Na dúvida entre complemento e erro, é erro.
5. Regravação: se um clipe SEGUINTE (até 3 à frente) COMEÇA COM A MESMA FRASE do atual e chega ao fim, o atual foi superado → "erro", mesmo que esteja completo. Exceção: se todas as versões seguintes terminam cortadas, o atual fica. Falar do mesmo assunto não basta: tem que ser a mesma frase de abertura, refeita.
6. Bastidor sem conteúdo (teste de som, "tá pegando?", "obrigado", ajuste de câmera, conversa com a equipe) → "erro".
7. Tomada de 2 minutos ou mais só é "erro" se a pessoa declarar no fim que vai refazer.
8. Assunto fora do Direito NÃO é erro: vlog, bastidor do escritório, comida, humor e entrevista são "boa" quando a fala está completa.
9. Clipe marcado [humano: X] foi conferido por uma pessoa: é verdade, use pra entender a sequência.`

// Apelido = o gancho/ideia central do clipe pra nomear o arquivo.
const APELIDO = 'O "titulo" é o APELIDO do clipe: o gancho/ideia central em 2 a 4 palavras (máx 5), concreto e específico — NÃO um resumo. ' +
  'Minúsculas, só letras e espaços (acentos ok); sem pontuação, números, símbolos, nome de produto/campanha nem as palavras "vídeo"/"anúncio"/"reel". ' +
  'Se for depoimento/entrevista, use o nome da pessoa (ex.: "depoimento julia"). Exemplos: "professora cansada", "herdeiro menor", "migrar de área".'

// começo + fim da fala: o começo mostra QUAL fala é (pra casar regravações), o fim mostra se deu certo.
function pontas(t, ini, fim) {
  const s = (t || '').replace(/\s+/g, ' ').trim()
  if (s.length <= ini + fim + 30) return s
  return s.slice(0, ini).trimEnd() + ' […] ' + s.slice(-fim).trimStart()
}
const falaDe = (b, ini, fim) => (b.falhou ? '(não deu pra transcrever)' : b.transc ? `"${pontas(b.transc, ini, fim)}"` : '(sem fala)')
const durDe = (b) => (b.seg == null ? '?s' : b.seg + 's')

async function exemplosDificeis(excluir) {
  // exemplos que ENSINAM: clipes que uma pessoa corrigiu (a IA tinha errado), um de cada tipo, com
  // começo e fim da fala. A tabela antiga de exemplos guardava só os 80 primeiros caracteres e tinha
  // "(silêncio) => boa" de quando a transcrição falhava — ensinava o contrário.
  const rows = await jsonOf(await sb(`brutos?select=drive_id,duracao,transcricao,tipo,ia_tipo&team=eq.${TEAM}&tipo=not.is.null&transcricao=neq.&order=confirmado_em.desc.nullslast&limit=300`))
  const pega = []
  for (const tipo of ['erro', 'gancho', 'boa', 'complemento', 'erro']) {
    const x = (Array.isArray(rows) ? rows : []).find((r) => r.tipo === tipo && r.ia_tipo !== r.tipo && r.transcricao && !excluir.has(r.drive_id) && !pega.includes(r))
    if (x) pega.push(x)
  }
  return pega
}

// Classifica os marcados de uma janela (clipes vizinhos da mesma gravação). Devolve Map n → resposta.
async function classificarJanela(janela, alvos, exemplos, rotuloSessao) {
  const linhas = janela.map((b, i) => {
    const n = i + 1
    const marca = alvos.has(b) ? 'CLASSIFICAR' : (!AVALIAR && b.tipo ? `contexto [humano: ${b.tipo}]` : 'contexto')
    const [ini, fim] = alvos.has(b) ? [420, 260] : [200, 140]
    return `#${n} · ${durDe(b)} · ${marca}: ${falaDe(b, ini, fim)}`
  })
  const ex = exemplos.length
    ? '\n\nExemplos conferidos por uma pessoa (a IA tinha errado estes):\n' + exemplos.map((e) => `${e.duracao ?? '?'}s "${pontas(e.transcricao, 150, 110)}" => ${e.tipo}`).join('\n')
    : ''
  const sys = `Você classifica os brutos (tomadas de câmera) de um professor e advogado que grava vídeos curtos pra redes sociais: conteúdo, anúncios, ganchos e bastidores. A sequência vem na ordem de gravação, toda do mesmo dia. Cada clipe mostra a duração e o COMEÇO e o FIM da fala (o meio pode vir omitido com […]).\n\n${REGRAS}${ex}\n\nClassifique SÓ os clipes marcados CLASSIFICAR (os de contexto servem pra comparar). Responda só JSON: {"clipes":[{"n":<número do clipe>,"tipo":"boa|gancho|complemento|erro","confianca":<0 a 1>,"motivo":"curto, citando o trecho que decidiu","tema":"...","tags":["..."],"resumo":"1 frase","titulo":"..."}]}. ${APELIDO}`
  const user = `Gravação: ${rotuloSessao}\n\n${linhas.join('\n')}`
  const d = await groq({ model: MODELO, temperature: 0.1, reasoning_effort: 'medium', max_completion_tokens: 1500 + alvos.size * 200, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }, 'ia')
  gastos += d.usage?.total_tokens || 0
  const ch = d.choices?.[0]
  if (!ch?.message?.content) throw new Error('resposta vazia (' + (ch?.finish_reason || '?') + ')')
  const out = JSON.parse(ch.message.content)
  const mapa = new Map()
  for (const c of Array.isArray(out.clipes) ? out.clipes : []) {
    const b = janela[Number(c.n) - 1]
    if (b && alvos.has(b)) mapa.set(b, c)
  }
  return mapa
}

// apelido curto só pra nomear — backfill de sugestao_titulo dos "boa" que ficaram sem
async function tituloCurto(transc) {
  const d = await groq({
    model: MODELO_LEVE, temperature: 0.2, reasoning_effort: 'low', max_completion_tokens: 300, response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: `Gere o apelido do vídeo pra nomear o arquivo. Responda só JSON {"titulo":"..."}. ${APELIDO}` },
      { role: 'user', content: String(transc || '').slice(0, 3000) },
    ],
  }, 'título')
  try { return (JSON.parse(d.choices[0].message.content).titulo || '').trim() } catch { return '' }
}

async function upsert(row) {
  if (AVALIAR) return
  const r = await sb('brutos', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([row]) })
  if (!r.ok) throw new Error('upsert ' + r.status + ' ' + (await r.text()).slice(0, 150))
}

// ================= run =================
const { todos, sessoes } = await listarBrutos()
for (const b of todos) b.transc = b.transcricao ?? null

// ---- PASSA 1: transcrição ----
// Transcreve quem nunca foi transcrito. Transcrição '' JÁ CLASSIFICADA é silêncio de verdade e não
// volta pra fila (antes os mesmos 12 clipes mudos eram baixados e mandados pro Whisper a cada rodada).
const precisaTransc = (b) => FORCE || b.transcricao == null || (b.transcricao === '' && !b.ia_tipo)
const filaT = AVALIAR ? [] : todos.filter(precisaTransc)
console.log(`${todos.length} brutos em ${sessoes.length} gravações · ${filaT.length} pra transcrever`)
const CONC = Number(process.env.CONC || 4)
let cursor = 0
let whisperParou = false
async function trabalhador() {
  for (;;) {
    const b = filaT[cursor++]
    if (!b) return
    if (whisperParou) { b.falhou = true; continue }
    const tmp = path.join(TMP, b.id + '.mp4')
    try {
      await baixar(b.proxyId || b.id, tmp) // sem proxy ainda: tira o áudio do original
      b.transc = await transcrever(tmp)
      b.novaTransc = true
      await upsert({ drive_id: b.id, nome: b.nome, duracao: b.seg, transcricao: b.transc, team: TEAM, atualizado_em: new Date().toISOString() })
      console.log(`• ${b.nome} ${b.transc ? `"${b.transc.slice(0, 50)}${b.transc.length > 50 ? '…' : ''}"` : '(sem fala)'}`)
    } catch (e) {
      // FALHA não é silêncio: não grava nada e não classifica. Fica pra próxima rodada.
      b.falhou = true
      if (e instanceof CotaEsgotada) whisperParou = true
      console.log(`• ${b.nome} NÃO transcreveu (${e.message}) — fica pra próxima rodada`)
    } finally { fs.rmSync(tmp, { force: true }) }
  }
}
await Promise.all(Array.from({ length: Math.min(CONC, filaT.length) }, trabalhador))

// ---- PASSA 2: classificação em janelas ----
// Reparo: clipe classificado quando a transcrição tinha falhado ("transcrição vazia") e que hoje tem
// fala. Ele virou "erro" e nunca mais foi olhado — era a maior fonte de descarte errado.
const classificadoSemFala = (b) => b.ia_tipo && b.transc && /(transcri[çc][ãa]o vazia|sil[êe]ncio|sem [áa]udio|sem fala|clipe silencioso|nenhum conte[úu]do)/i.test(b.ia_motivo || '')
const precisaClassif = (b) => {
  if (b.falhou || b.transc == null) return false
  if (AVALIAR) return !!b.tipo
  if (FORCE || RECLASS || b.novaTransc || !b.ia_tipo) return true
  return !b.tipo && classificadoSemFala(b)
}
const fimRefaz = /(de novo|foi mal|n[ãa]o ficou|vou gravar tudo|refazer|repetir|come[çc]ar de novo|corta(r)? essa|deixa eu refazer)/

let gastos = 0 // tokens da Groq na classificação (a conta grátis tem teto por dia)
let exemplos = []
const resultados = [] // pro --avaliar
let nClass = 0, nSil = 0, pendentes = 0, cotaAcabou = false
if (!SO_TRANSC) {
  const alvosTodos = todos.filter(precisaClassif)
  console.log(`--- classificação: ${alvosTodos.length} clipes ---`)
  exemplos = await exemplosDificeis(new Set(AVALIAR ? todos.filter((b) => b.tipo).map((b) => b.id) : []))
  if (AVALIAR) exemplos = [] // na avaliação os difíceis SÃO a prova; não dá pra mostrar a resposta

  const gravar = async (b, c, tipoFinal) => {
    if (AVALIAR) { resultados.push({ b, tipo: tipoFinal, c }); return }
    await upsert({
      drive_id: b.id, nome: b.nome, duracao: b.seg, transcricao: b.transc, team: TEAM,
      ia_tipo: tipoFinal, ia_tema: c.tema || null, ia_tags: Array.isArray(c.tags) ? c.tags : null,
      ia_resumo: c.resumo || null, ia_confianca: typeof c.confianca === 'number' ? c.confianca : null,
      ia_motivo: c.motivo || null, sugestao_titulo: (c.titulo && String(c.titulo).trim()) || null,
      atualizado_em: new Date().toISOString(),
    })
  }

  sessao: for (const lista of sessoes) {
    const alvosIdx = lista.map((b, i) => (precisaClassif(b) ? i : -1)).filter((i) => i >= 0)
    if (!alvosIdx.length) continue
    // silêncio não gasta IA: sem fala nenhuma é descarte
    for (const i of alvosIdx) {
      const b = lista[i]
      if (b.transc === '') { await gravar(b, { motivo: 'sem fala no áudio', confianca: 0.9 }, 'erro'); nSil++ }
    }
    const comFala = alvosIdx.filter((i) => lista[i].transc)
    // grupos de até 8 alvos, sem abrir janela maior que 14 clipes
    const grupos = []
    for (const i of comFala) {
      const g = grupos[grupos.length - 1]
      if (g && g.length < 8 && i - g[0] <= 11) g.push(i)
      else grupos.push([i])
    }
    // Uma janela que falha (JSON quebrado da Groq, resposta cortada) é dividida ao meio e tentada de
    // novo; clipe que a IA pulou ganha uma segunda chance numa janela só dele. Antes, um JSON inválido
    // derrubava 6 clipes de uma vez.
    const rodarGrupo = async (g, tentativa = 0) => {
      const ini = Math.max(0, g[0] - 2), fim = Math.min(lista.length, g[g.length - 1] + 3)
      const janela = lista.slice(ini, fim)
      const alvos = new Set(g.map((i) => lista[i]))
      let mapa
      try {
        mapa = await classificarJanela(janela, alvos, exemplos, lista[0].sessao)
      } catch (e) {
        if (e instanceof CotaEsgotada) throw e
        if (g.length > 1) {
          console.log(`(janela de ${g.length} falhou: ${e.message.slice(0, 80)} — divido e tento de novo)`)
          const meio = Math.ceil(g.length / 2)
          await rodarGrupo(g.slice(0, meio), tentativa)
          await rodarGrupo(g.slice(meio), tentativa)
          return
        }
        if (tentativa < 1) return rodarGrupo(g, tentativa + 1)
        pendentes++
        console.log(`✗ ${lista[g[0]].nome}: ${e.message.slice(0, 100)} — fica pra próxima rodada`)
        return
      }
      const faltou = []
      for (const i of g) {
        const b = lista[i]
        const c = mapa.get(b)
        if (!c) { faltou.push(i); continue }
        let t = ['boa', 'erro', 'gancho', 'complemento'].includes(c.tipo) ? c.tipo : 'erro'
        // TRAVA DA TOMADA LONGA: ninguém grava 2+ minutos e joga fora sem dizer. Só aceita "erro"
        // numa tomada longa se a pessoa declarar no FIM que vai refazer.
        if (t === 'erro' && (b.seg || 0) >= 120 && !fimRefaz.test(b.transc.slice(-160).toLowerCase())) t = 'boa'
        await gravar(b, c, t)
        nClass++
        console.log(`✓ ${b.nome} ${durDe(b)} → ${t} (${c.confianca}) ${String(c.motivo || '').slice(0, 70)}`)
      }
      if (faltou.length) {
        if (tentativa < 1) { for (const i of faltou) await rodarGrupo([i], tentativa + 1) }
        else { pendentes += faltou.length; for (const i of faltou) console.log(`✗ ${lista[i].nome}: a IA pulou — fica pra próxima rodada`) }
      }
    }
    for (const g of grupos) {
      try { await rodarGrupo(g) } catch (e) {
        if (e instanceof CotaEsgotada) { cotaAcabou = true; console.log(`\n${e.message} — o resto fica pra próxima rodada`); break sessao }
        throw e
      }
    }
  }
  console.log(`tokens gastos: ${gastos}`)
  console.log(`classificados: ${nClass} · sem fala: ${nSil}${pendentes ? ` · pendentes: ${pendentes}` : ''}${cotaAcabou ? ' · parou na cota do dia' : ''}`)
}

// ---- avaliação ----
if (AVALIAR) {
  const ok = resultados.filter((r) => r.tipo === r.b.tipo).length
  const antes = resultados.filter((r) => r.b.ia_tipo === r.b.tipo).length
  console.log(`\n=== AVALIAÇÃO em ${resultados.length} clipes conferidos ===`)
  console.log(`antes: ${antes}/${resultados.length} (${Math.round((100 * antes) / resultados.length)}%) · agora: ${ok}/${resultados.length} (${Math.round((100 * ok) / resultados.length)}%)`)
  const conf = {}
  for (const r of resultados) if (r.tipo !== r.b.tipo) { const k = `${r.tipo}→humano ${r.b.tipo}`; conf[k] = (conf[k] || 0) + 1 }
  console.log('erros agora:', conf)
  for (const r of resultados) if (r.tipo !== r.b.tipo) console.log(`  ${r.b.sessao} ${r.b.nome} ${durDe(r.b)} IA ${r.tipo} / humano ${r.b.tipo} | ${String(r.c.motivo || '').slice(0, 90)}`)
}

// ---- backfill de título: "boa" sem sugestao_titulo ----
// O filtro antigo era "sugestao_titulo.is.null" (sem o "="): o banco ignorava e devolvia TODOS os 239
// "boa" a cada rodada — 239 chamadas à Groq por execução, trocando títulos que já existiam.
if (!SO_TRANSC && !AVALIAR && !cotaAcabou) {
  const semTit = await jsonOf(await sb(`brutos?select=drive_id,nome,transcricao&or=(ia_tipo.eq.boa,tipo.eq.boa)&sugestao_titulo=is.null&team=eq.${TEAM}`))
  const alvoTit = (Array.isArray(semTit) ? semTit : []).filter((x) => x.transcricao && x.transcricao.trim())
  if (alvoTit.length) {
    console.log(`--- título em ${alvoTit.length} "boa" sem título ---`)
    for (const x of alvoTit) {
      try {
        const t = await tituloCurto(x.transcricao)
        if (t) { await upsert({ drive_id: x.drive_id, team: TEAM, sugestao_titulo: t }); console.log(`  ${x.nome} → ${t}`) }
      } catch (e) { console.log(`  ${x.nome} erro: ${e.message}`); if (e instanceof CotaEsgotada) break }
    }
  }
}
fs.rmSync(TMP, { recursive: true, force: true })
console.log('fim')
