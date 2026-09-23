// Passos: (0) lê o horário REAL de gravação de cada clipe novo; (1) transcreve o que falta (Whisper da
// Groq); (2) divide cada gravação em VÍDEOS (Vídeo 01, Vídeo 02… — todos os takes de cada um, bons e
// ruins) e classifica em janelas dentro de cada vídeo; (3) une os takes bons de cada vídeo, pra pessoa
// só conferir. Grava no Supabase (tabelas brutos e divisoes).
// Uso: GROQ_KEY=... SUPA_SECRET=... node scripts/classificar-brutos.mjs [--force] [--reclassificar]
//      --avaliar  → re-classifica os que uma pessoa já conferiu, SEM gravar, e mede o acerto
//      DIVIDIR="Setembro 2026/22"  → (re)divide em vídeos um dia que já tinha sido processado
import { GoogleAuth } from 'google-auth-library'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import { lerTempo } from './lib/tempo.mjs'

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
const MODELO_VISAO = 'qwen/qwen3.8-27b' // o único da Groq que lê imagem (teto de 1 mil tokens de saída por minuto)
const SITE = 'https://audiovisual.alascasa.com.br'
const TZ = 'America/Sao_Paulo'
const DIVIDIR = (process.env.DIVIDIR || '').split(',').map((x) => x.trim()).filter(Boolean)
const NO_GITHUB = !!process.env.GITHUB_ACTIONS // registro público: nada de conteúdo da fala nele
const MOTIVO_SEM_FALA = 'sem fala: confira pela imagem'
// LOCAL_DIRS=<pasta>,<pasta>: os vídeos já estão neste computador. Lê o áudio direto deles em vez de
// baixar do Drive (10 GB a 2 MB/s levava mais de uma hora). SÓ LEITURA: nada é movido, renomeado
// nem apagado nessas pastas.
const LOCAL = new Map()
for (const dir of (process.env.LOCAL_DIRS || '').split(',').map((x) => x.trim()).filter(Boolean)) {
  for (const nome of fs.readdirSync(dir)) if (/\.(mov|mp4|m4v)$/i.test(nome)) LOCAL.set(nome, path.join(dir, nome))
}
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
  const rows = await jsonOf(await sb(`brutos?select=drive_id,nome,nome_original,duracao,proxy_id,criado,mes,dia,pasta_id,transcricao,ia_tipo,ia_motivo,tipo,atualizado_em,grupo_id,gravado_em,camera,divisao_id,ia_resumo&team=eq.${TEAM}`))
  if (!Array.isArray(rows)) throw new Error('não li os brutos (falta rodar supabase/divisoes.sql?): ' + JSON.stringify(rows).slice(0, 160))
  return rows.map((b) => ({
    id: b.drive_id, nome: b.nome, seg: b.duracao, proxyId: b.proxy_id, grupo: b.grupo_id || null,
    mes: b.mes, dia: b.dia, pasta_id: b.pasta_id, pasta: `${b.mes || ''}/${b.dia || ''}`,
    inicio: b.gravado_em ? Date.parse(b.gravado_em) : null, durReal: null, cam: b.camera || null, divisao: b.divisao_id || null,
    num: numDoNome(b.nome_original || b.nome), criado: b.criado || '',
    transcricao: b.transcricao, ia_tipo: b.ia_tipo, ia_motivo: b.ia_motivo, tipo: b.tipo, atualizado: b.atualizado_em || '',
    // nunca processado: sem transcrição, ou sem etiqueta e sem o aviso de "sem fala"
    novo: b.transcricao == null || (!b.ia_tipo && !String(b.ia_motivo || '').startsWith(MOTIVO_SEM_FALA)),
    semFala: String(b.ia_motivo || '').startsWith(MOTIVO_SEM_FALA), // já marcado numa rodada anterior
    legenda: String(b.ia_resumo || '').startsWith('Imagem: ') ? b.ia_resumo.slice(8) : null, // o que aparece no clipe sem fala
  }))
}
// Com horário real, a gravação é o DIA em que foi filmada (as pastas de dois celulares juntas, em ordem
// de horário). Sem horário, cai na pasta do Drive e na ordem do número do clipe.
function montarSessoes(todos) {
  const porSessao = new Map()
  for (const b of todos) {
    b.sessao = b.inicio != null ? 'gravação de ' + new Date(b.inicio).toLocaleDateString('pt-BR', { timeZone: TZ }) : sessaoDe(b)
    if (!porSessao.has(b.sessao)) porSessao.set(b.sessao, [])
    porSessao.get(b.sessao).push(b)
  }
  for (const l of porSessao.values()) l.sort((a, b) => (a.inicio != null && b.inicio != null ? a.inicio - b.inicio : 0) || (a.num - b.num) || a.criado.localeCompare(b.criado))
  let sessoes = [...porSessao.values()]
  if (SO_SESSAO.length) sessoes = sessoes.filter((l) => SO_SESSAO.includes(l[0].sessao))
  return sessoes
}
const forcado = (b) => DIVIDIR.includes(b.pasta)

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
  // extrai SÓ o áudio (16kHz mono, ~1MB) — vídeo grande passa do limite de 25MB do Whisper.
  // O áudio vai pra pasta temporária: o arquivo pode ser a mídia original da pessoa (LOCAL_DIRS).
  const audio = path.join(TMP, path.basename(file) + '.m4a')
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

// ---------- linha do tempo ----------
const fimDe = (b) => b.inicio + (b.durReal ?? b.seg ?? 0) * 1000
const horaDe = (b) => (b.inicio != null ? new Date(b.inicio).toLocaleTimeString('pt-BR', { timeZone: TZ }) : null)
// segundos parados entre o fim do clipe anterior e o começo deste (null sem horário)
const pausaEntre = (a, b) => (a && b && a.inicio != null && b.inicio != null ? Math.max(0, Math.round((b.inicio - fimDe(a)) / 1000)) : null)
const fmtPausa = (s) => (s < 90 ? `${s}s` : `${Math.round(s / 60)} min`)
// Dois celulares filmando ao mesmo tempo: o clipe do celular secundário que cobre o mesmo intervalo de
// um clipe do principal (metade do menor, pelo menos) é o MESMO take em outro ângulo. Ele sai da
// sequência que a IA lê (duas falas idênticas no mesmo horário pareceriam regravação) e herda a
// classificação do take principal. Sem fala no principal e com fala no outro, não casa: segue sozinho.
function marcarAngulos(lista) {
  const cams = new Map()
  for (const b of lista) if (b.inicio != null && b.cam) cams.set(b.cam, (cams.get(b.cam) || 0) + 1)
  if (cams.size < 2) return lista
  const principal = [...cams.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const princ = lista.filter((b) => b.cam === principal && b.inicio != null)
  for (const x of lista) {
    if (x.cam === principal || x.inicio == null) continue
    let melhor = null, sob = 0
    for (const y of princ) {
      const s = Math.min(fimDe(x), fimDe(y)) - Math.max(x.inicio, y.inicio)
      if (s > sob) { sob = s; melhor = y }
    }
    if (!melhor || sob < 0.5 * Math.min(fimDe(x) - x.inicio, fimDe(melhor) - melhor.inicio)) continue
    if (semFalaUtil(melhor) && !semFalaUtil(x)) continue // o principal ficou mudo e o outro celular pegou a fala
    x.anguloDe = melhor
    ;(melhor.angulos ||= []).push(x)
  }
  return lista.filter((b) => !b.anguloDe)
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
  const comHora = janela.some((b) => b.inicio != null)
  const linhas = janela.map((b, i) => {
    const n = i + 1
    const marca = alvos.has(b) ? 'CLASSIFICAR' : (!AVALIAR && b.tipo ? `contexto [humano: ${b.tipo}]` : 'contexto')
    const [ini, fim] = alvos.has(b) ? [420, 260] : [200, 140]
    const p = pausaEntre(janela[i - 1], b)
    const quando = horaDe(b) ? ` · ${horaDe(b)}${p != null ? ` · pausa ${fmtPausa(p)}` : ''}` : ''
    return `#${n}${quando} · ${durDe(b)} · ${marca}: ${falaDe(b, ini, fim)}`
  })
  const regraHora = comHora
    ? '\n10. Cada clipe traz a hora em que foi gravado e a pausa desde o anterior. Takes do mesmo vídeo vêm um atrás do outro com pausa curta; pausa de vários minutos costuma separar um vídeo do próximo. Takes seguidos da mesma fala são regravação (regra 5).'
    : ''
  const ex = exemplos.length
    ? '\n\nExemplos conferidos por uma pessoa (a IA tinha errado estes):\n' + exemplos.map((e) => `${e.duracao ?? '?'}s "${pontas(e.transcricao, 150, 110)}" => ${e.tipo}`).join('\n')
    : ''
  const sys = `Você classifica os brutos (tomadas de câmera) de um professor e advogado que grava vídeos curtos pra redes sociais: conteúdo, anúncios, ganchos e bastidores. A sequência vem na ordem de gravação, toda do mesmo dia. Cada clipe mostra a duração e o COMEÇO e o FIM da fala (o meio pode vir omitido com […]).\n\n${REGRAS}${regraHora}${ex}\n\nClassifique SÓ os clipes marcados CLASSIFICAR (os de contexto servem pra comparar). Responda só JSON: {"clipes":[{"n":<número do clipe>,"tipo":"boa|gancho|complemento|erro","confianca":<0 a 1>,"motivo":"curto, citando o trecho que decidiu","tema":"...","tags":["..."],"resumo":"1 frase","titulo":"..."}]}. ${APELIDO}`
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

// ---------- divisão em vídeos ----------
// Uma gravação de um dia inteiro tem vários vídeos do projeto (roteiros, cenas). A IA lê a sequência
// com hora e pausa e diz onde cada vídeo COMEÇA — pedir só o começo garante divisões sem buraco nem
// sobreposição. Clipe sem fala (cena, imagem de apoio) fica no vídeo ao lado do qual foi gravado.
async function segmentar(bloco) {
  const linhas = bloco.map((b, i) => {
    const p = pausaEntre(bloco[i - 1], b)
    return `#${i + 1} · ${horaDe(b) || '?'}${p != null ? ` · pausa ${fmtPausa(p)}` : ''} · ${durDe(b)}: ${b.semFala || !b.transc ? '(sem fala)' : falaDe(b, 110, 60)}`
  })
  const sys = 'Você organiza os brutos de uma gravação de vídeos curtos pra redes sociais (um professor e advogado; às vezes cenas com outras pessoas). ' +
    'Os clipes vêm na ordem em que foram gravados, com a hora, a pausa desde o anterior, a duração e o começo e o fim da fala.\n\n' +
    'Separe a sequência em VÍDEOS do projeto — poucos e grandes. Um vídeo é um roteiro ou uma cena inteira, com todos os seus takes. Ficam no MESMO vídeo: os takes e regravações da mesma fala, ' +
    'as partes do mesmo roteiro gravadas em sequência (abertura, desenvolvimento, chamada final), a cena encenada com várias pessoas e a fala que responde a ela, ' +
    'e os clipes sem fala, de bastidor ou de ajuste (cenas, imagens de apoio, "gravando", "obrigado") gravados junto.\n' +
    'Só começa um vídeo NOVO quando começa um roteiro diferente: outra frase de abertura, outro assunto. Clipe sem fala ou de bastidor NUNCA abre um vídeo — ele fica no vídeo ao lado. ' +
    'Nunca quebre no meio de uma cadeia de regravações da mesma fala. Na dúvida, não divida.\n\n' +
    'Responda só JSON: {"videos":[{"comeca_em":<número do primeiro clipe do vídeo>,"tema":"2 a 5 palavras"}]}, em ordem, o primeiro começando em 1.'
  const d = await groq({ model: MODELO, temperature: 0.1, reasoning_effort: 'medium', max_completion_tokens: 2500, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: sys }, { role: 'user', content: linhas.join('\n') }] }, 'divisão')
  gastos += d.usage?.total_tokens || 0
  const out = JSON.parse(d.choices?.[0]?.message?.content || '{}')
  const inicios = new Map([[1, '']])
  for (const v of Array.isArray(out.videos) ? out.videos : []) {
    const n = Math.round(Number(v.comeca_em))
    if (n >= 1 && n <= bloco.length) inicios.set(n, String(v.tema || '').slice(0, 60))
  }
  // A IA divide por conteúdo, mas só pode abrir vídeo novo depois de uma pausa de 5 min ou mais.
  // Na gravação de 22/09 ela cortou o esquete do cardápio em 4 com pausas de 0,9 a 1,5 min entre os
  // takes — os cortes certos caíam todos em pausas de 7 min a 3 h.
  const PAUSA_MIN = 300
  for (const n of [...inicios.keys()]) if (n > 1 && (pausaEntre(bloco[n - 2], bloco[n - 1]) ?? Infinity) < PAUSA_MIN) inicios.delete(n)
  const cortes = [...inicios.keys()].sort((a, b) => a - b)
  return cortes.map((c, i) => ({ clipes: bloco.slice(c - 1, (cortes[i + 1] || bloco.length + 1) - 1), tema: inicios.get(c) }))
}

// Clipe sem fala: a IA de texto não sabe o que é. O modelo de visão descreve a miniatura ("close do
// cardápio", "gavetas do escritório") e a descrição fica salva no clipe (aparece no player).
async function legendar(b) {
  const d = await groq({
    model: MODELO_VISAO, temperature: 0.2, max_tokens: 60,
    messages: [{ role: 'user', content: [
      { type: 'text', text: 'Descreva o que aparece nesta imagem em até 12 palavras, em português: quem, o quê, onde. Sem introdução.' },
      { type: 'image_url', image_url: { url: `${SITE}/api/thumb?id=${encodeURIComponent(b.id)}` } },
    ] }],
  }, 'visão')
  return String(d.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/\s+/g, ' ').trim().slice(0, 140)
}

// Imagem de apoio não é gravada junto do vídeo dela: vem em lote, antes ou depois. A IA casa cada clipe
// sem fala com o vídeo do ASSUNTO da imagem; o que não casa com nenhum vai pra "Imagens de apoio".
async function atribuirImagens(videos, mudos) {
  const faixa = (v) => `${horaDe(v.clipes[0]) || '?'}–${horaDe(v.clipes[v.clipes.length - 1]) || '?'}`
  const abre = (v) => { const f = v.clipes.find((b) => b.transc && !b.semFala); return f ? pontas(f.transc, 90, 0) : '' }
  const linhasV = videos.map((v, i) => `V${i + 1} · ${faixa(v)}${v.tema ? ` · ${v.tema}` : ''} · começa: "${abre(v)}"`)
  const linhasM = mudos.map((b, i) => `#${i + 1} · ${horaDe(b) || '?'} · ${durDe(b)} · imagem: ${b.legenda || '(sem descrição)'}`)
  const sys = 'Você recebe os VÍDEOS de uma gravação (horário, assunto e a fala de abertura de cada um) e os clipes SEM FALA (imagens de apoio e cenas), cada um com o horário e a descrição da imagem. ' +
    'Diga a qual vídeo cada clipe sem fala pertence: primeiro pelo ASSUNTO da imagem (um close do cardápio vai no vídeo do cardápio; alguém mexendo no celular vai no vídeo que fala disso) e, em segundo lugar, pela proximidade de horário (cena gravada logo antes ou logo depois de um vídeo costuma ser dele). ' +
    'Se a imagem não tem ligação clara com nenhum vídeo, responda 0. Responda só JSON: {"clipes":[{"n":<número do clipe>,"video":<número do vídeo, sem o V, ou 0>}]}'
  const d = await groq({ model: MODELO, temperature: 0.1, reasoning_effort: 'medium', max_completion_tokens: 3000, response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: sys }, { role: 'user', content: `VÍDEOS:\n${linhasV.join('\n')}\n\nCLIPES SEM FALA:\n${linhasM.join('\n')}` }] }, 'imagens')
  gastos += d.usage?.total_tokens || 0
  const out = JSON.parse(d.choices?.[0]?.message?.content || '{}')
  const mapa = new Map()
  for (const c of Array.isArray(out.clipes) ? out.clipes : []) {
    const b = mudos[Number(c.n) - 1]
    const v = Math.round(Number(c.video))
    if (b && v >= 1 && v <= videos.length) mapa.set(b, v - 1)
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
const todos = await listarBrutos()
for (const b of todos) b.transc = b.transcricao ?? null

// ---- PASSA 0: horário real de gravação ----
// Do arquivo local quando ele está neste computador (instantâneo); senão do Drive, lendo só o cabeçalho.
// Só dos clipes novos (ou do dia pedido em DIVIDIR): o acervo antigo não é mexido.
const filaTempo = AVALIAR ? [] : todos.filter((b) => b.inicio == null && (b.novo || forcado(b)))
if (filaTempo.length) {
  let k = 0, lidos = 0
  const tok = LOCAL.size && filaTempo.every((b) => LOCAL.has(b.nome)) ? null : await driveToken()
  await Promise.all(Array.from({ length: Math.min(6, filaTempo.length) }, async () => {
    for (;;) {
      const b = filaTempo[k++]
      if (!b) return
      try {
        const t = await lerTempo(LOCAL.has(b.nome) ? { arquivo: LOCAL.get(b.nome) } : { driveId: b.id, token: tok })
        if (!t.inicio) continue
        b.inicio = Date.parse(t.inicio); b.durReal = t.dur; b.cam = t.camera || b.cam
        await sb(`brutos?drive_id=eq.${encodeURIComponent(b.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ gravado_em: t.inicio, camera: b.cam }) })
        lidos++
      } catch { /* sem horário: segue pela pasta e pelo número, como antes */ }
    }
  }))
  console.log(`horário de gravação: ${lidos}/${filaTempo.length}`)
}

// ---- PASSA 1: transcrição ----
// Transcreve quem nunca foi transcrito. Transcrição '' JÁ CLASSIFICADA é silêncio de verdade e não
// volta pra fila (antes os mesmos 12 clipes mudos eram baixados e mandados pro Whisper a cada rodada).
const precisaTransc = (b) => FORCE || b.transcricao == null || (b.transcricao === '' && !b.ia_tipo)
const filaT = AVALIAR ? [] : todos.filter(precisaTransc)
console.log(`${todos.length} brutos · ${filaT.length} pra transcrever${LOCAL.size ? ` (${filaT.filter((b) => LOCAL.has(b.nome)).length} direto dos arquivos deste computador)` : ''}`)
const CONC = Number(process.env.CONC || 4)
let cursor = 0
let whisperParou = false
async function trabalhador() {
  for (;;) {
    const b = filaT[cursor++]
    if (!b) return
    if (whisperParou) { b.falhou = true; continue }
    const local = LOCAL.get(b.nome)
    const tmp = path.join(TMP, b.id + '.mp4')
    try {
      if (!local) await baixar(b.proxyId || b.id, tmp) // sem proxy ainda: tira o áudio do original
      b.transc = await transcrever(local || tmp)
      b.novaTransc = true
      await upsert({ drive_id: b.id, nome: b.nome, duracao: b.seg, transcricao: b.transc, team: TEAM, atualizado_em: new Date().toISOString() })
      // o registro do GitHub é público: nome e tamanho, nunca o que a pessoa fala
      console.log(`• ${b.nome} ${b.transc ? `(${b.transc.length} caracteres)` : '(sem fala)'}`)
    } catch (e) {
      // FALHA não é silêncio: não grava nada e não classifica. Fica pra próxima rodada.
      b.falhou = true
      if (e instanceof CotaEsgotada) whisperParou = true
      console.log(`• ${b.nome} NÃO transcreveu (${e.message}) — fica pra próxima rodada`)
    } finally { if (!local) fs.rmSync(tmp, { force: true }) } // o arquivo local é da pessoa: nunca apagar
  }
}
await Promise.all(Array.from({ length: Math.min(CONC, filaT.length) }, trabalhador))
const sessoes = montarSessoes(todos)

// ---- PASSA 2: classificação em janelas ----
// Reparo: clipe classificado quando a transcrição tinha falhado ("transcrição vazia") e que hoje tem
// fala. Ele virou "erro" e nunca mais foi olhado — era a maior fonte de descarte errado.
// só o que foi classificado ANTES desta versão: o motivo novo de um bastidor ("sem fala útil") não pode
// puxar o mesmo clipe de volta em toda rodada
const classificadoSemFala = (b) => b.ia_tipo && b.transc && b.atualizado < '2026-09-22' && /(transcri[çc][ãa]o vazia|sil[êe]ncio|sem [áa]udio|sem fala|clipe silencioso|nenhum conte[úu]do)/i.test(b.ia_motivo || '')
const precisaBase = (b) => {
  if (b.falhou || b.transc == null) return false
  if (!FORCE && !RECLASS && String(b.ia_motivo || '').startsWith(MOTIVO_SEM_FALA)) return false
  if (AVALIAR) return !!b.tipo
  if (FORCE || RECLASS || b.novaTransc || !b.ia_tipo) return true
  return !b.tipo && classificadoSemFala(b)
}
const precisaClassif = (b) => !b.anguloDe && !b.semFala && precisaBase(b)
// SEM FALA ÚTIL: a IA julga pela fala, então clipe sem fala não é dela. Na gravação de 22/09 foram 59
// de 131 — cenas e imagens de apoio em que o Whisper escreve "Obrigado.", "E aí" ou "Gravando" por cima
// do quase-silêncio — e todos saíam "erro". Ficam SEM etiqueta, com o aviso pra conferir pela imagem.
// Fala de verdade anda a ~2 palavras/s; abaixo de 0,6 (ou até 3 palavras) não é um take falado.
// "Foi mal"/"de novo" sozinho continua erro: a pessoa declarou que errou.
function semFalaUtil(b) {
  const s = (b.transc || '').trim()
  const palavras = (s.match(/[\p{L}\p{N}]+/gu) || []).length
  if (palavras >= 12) return false
  if (fimRefaz.test(s.toLowerCase())) return false
  const dur = b.durReal ?? b.seg ?? 0
  return palavras <= 3 || !dur || palavras / dur < 0.6
}
const fimRefaz = /(de novo|foi mal|n[ãa]o ficou|vou gravar tudo|refazer|repetir|come[çc]ar de novo|corta(r)? essa|deixa eu refazer)/

let gastos = 0 // tokens da Groq na classificação (a conta grátis tem teto por dia)
let exemplos = []
const resultados = [] // pro --avaliar
let nClass = 0, pendentes = 0, cotaAcabou = false
if (!SO_TRANSC) {
  for (let k = 0; k < sessoes.length; k++) sessoes[k] = marcarAngulos(sessoes[k])
  let nSemFala = 0
  for (const b of todos) {
    if (!precisaBase(b) || !semFalaUtil(b)) continue
    b.semFala = true
    b.feito = true
    b.ia_tipo = null
    nSemFala++
    if (!AVALIAR) await upsert({ drive_id: b.id, nome: b.nome, team: TEAM, ia_tipo: null, ia_confianca: null, sugestao_titulo: null,
      ia_motivo: MOTIVO_SEM_FALA + ' (cena ou imagem de apoio)', ia_resumo: 'Sem fala — a IA só julga pela fala. Confira pela imagem se é cena ou imagem de apoio.',
      atualizado_em: new Date().toISOString() })
  }
  if (nSemFala) console.log(`${nSemFala} clipes sem fala útil: ficam sem etiqueta pra conferir pela imagem`)
  const nAng = todos.filter((b) => b.anguloDe).length
  if (nAng) console.log(`${nAng} clipes são o mesmo take em outro ângulo: herdam a classificação do take principal`)

  // ---- DIVISÃO EM VÍDEOS ----
  // Só gravação com clipe novo (ou o dia pedido em DIVIDIR), e só os clipes que ainda não têm vídeo:
  // divisão que a pessoa já renomeou ou arrumou não é refeita.
  const divNovas = new Map() // divisao_id → membros (take principal + ângulos)
  if (!AVALIAR) {
    divisao: for (const lista of sessoes) {
      const todosSoltos = lista.filter((b) => !b.divisao)
      if (!todosSoltos.length || !lista.some((b) => b.novo || forcado(b))) continue
      // O que tem fala divide os vídeos; o que não tem fala (imagem de apoio, cena) é casado depois
      // pelo que aparece na imagem. Misturar os dois fazia a imagem de apoio "abrir" vídeo ou cair
      // jogada dentro do vídeo errado só por ter sido gravada perto.
      const palavrasDe = (b) => (b.transc || '').split(/\s+/).filter(Boolean).length
      const ehMudo = (b) => b.semFala || !b.transc
      const soltos = todosSoltos.filter((b) => !ehMudo(b))
      const mudos = todosSoltos.filter(ehMudo)
      // blocos separados por pausa de 20+ min; cada bloco a IA divide por conteúdo
      const blocos = [[]]
      for (const b of soltos) {
        const ult = blocos[blocos.length - 1]
        if (ult.length && (pausaEntre(ult[ult.length - 1], b) ?? 0) > 1200) blocos.push([b])
        else ult.push(b)
      }
      // vídeo sem nenhuma fala de verdade (só cena, imagem de apoio, "gravando") não fica sozinho:
      // junta ao vídeo anterior do mesmo bloco (ou ao seguinte, se for o primeiro)
      const palavras = (b) => (b.transc || '').split(/\s+/).filter(Boolean).length
      const temFala = (pt) => pt.clipes.some((b) => !b.semFala && palavras(b) >= 12)
      const juntarSemFala = (ps) => {
        const out = []
        for (const pt of ps) {
          if (!temFala(pt) && out.length) { out[out.length - 1].clipes.push(...pt.clipes); continue }
          out.push({ ...pt, clipes: [...pt.clipes] })
        }
        if (out.length > 1 && !temFala(out[0])) { out[1].clipes.unshift(...out[0].clipes); out[1].tema = out[1].tema || out[0].tema; out.shift() }
        return out
      }
      const partes = []
      for (const bl of blocos) {
        if (!bl.length) continue
        const comFala = bl.filter((b) => palavrasDe(b) >= 12).length
        if (bl.length <= 2 || comFala === 0) { partes.push({ clipes: bl, tema: '' }); continue }
        try { partes.push(...juntarSemFala(await segmentar(bl))) } catch (e) {
          if (e instanceof CotaEsgotada) { cotaAcabou = true; console.log(`\n${e.message} — a divisão fica pra próxima rodada`); break divisao }
          console.log(`(divisão por conteúdo falhou: ${e.message.slice(0, 80)} — o bloco vira um vídeo só)`)
          partes.push({ clipes: bl, tema: '' })
        }
      }
      // imagens de apoio: descreve as que ainda não têm descrição e casa com o vídeo do assunto
      let parouVisao = false
      for (const b of mudos) {
        if (b.legenda || parouVisao) continue
        try {
          b.legenda = await legendar(b)
          if (b.legenda) await upsert({ drive_id: b.id, team: TEAM, ia_resumo: 'Imagem: ' + b.legenda })
        } catch (e) { if (e instanceof CotaEsgotada) parouVisao = true }
      }
      const semVideo = []
      if (mudos.length && partes.length) {
        let mapa = new Map()
        try { mapa = await atribuirImagens(partes, mudos) } catch (e) {
          if (e instanceof CotaEsgotada) { cotaAcabou = true; console.log(`\n${e.message} — a divisão fica pra próxima rodada`); break divisao }
          console.log(`(casar imagens falhou: ${e.message.slice(0, 80)} — ficam em Imagens de apoio)`)
        }
        for (const b of mudos) { const v = mapa.get(b); if (v != null) partes[v].clipes.push(b); else semVideo.push(b) }
      } else semVideo.push(...mudos)
      for (const pt of partes) pt.clipes.sort((a, b) => (a.inicio ?? 0) - (b.inicio ?? 0))
      // o que não casou com nenhum vídeo: "Imagens de apoio", um bloco por sessão de gravação (pausa de 10+ min separa)
      const apoios = []
      for (const b of semVideo.sort((a, b) => (a.inicio ?? 0) - (b.inicio ?? 0))) {
        const ult = apoios[apoios.length - 1]
        if (ult && (pausaEntre(ult.clipes[ult.clipes.length - 1], b) ?? 0) <= 600) ult.clipes.push(b)
        else apoios.push({ clipes: [b], tema: 'imagens de apoio', apoio: true })
      }
      // numera depois das divisões que o dia já tinha
      const ja = new Set(lista.map((b) => b.divisao).filter(Boolean)).size
      const nomeApoio = (i) => (apoios.length > 1 ? `Imagens de apoio ${String(i + 1).padStart(2, '0')}` : 'Imagens de apoio')
      apoios.forEach((ap, i) => { ap.nome = nomeApoio(i) })
      partes.push(...apoios)
      const r = await sb('divisoes', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(partes.map((pt, i) => ({ team: TEAM, nome: pt.nome || 'Vídeo ' + String(ja + i + 1).padStart(2, '0'), ordem: ja + i + 1 }))) })
      const criadas = await jsonOf(r)
      if (!r.ok || !Array.isArray(criadas) || criadas.length !== partes.length) { console.log('✗ não consegui criar as divisões: ' + JSON.stringify(criadas).slice(0, 120)); continue }
      for (let i = 0; i < partes.length; i++) {
        const id = criadas[i].id
        const membros = partes[i].clipes.flatMap((b) => [b, ...(b.angulos || [])])
        for (const m of membros) m.divisao = id
        await sb(`brutos?drive_id=in.(${membros.map((m) => m.id).join(',')})`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ divisao_id: id }) })
        divNovas.set(id, membros)
        console.log(`${criadas[i].nome}: ${membros.length} clipes${!NO_GITHUB && partes[i].tema ? ` (${partes[i].tema})` : ''}`)
      }
    }
  }

  const alvosTodos = todos.filter(precisaClassif)
  console.log(`--- classificação: ${alvosTodos.length} clipes ---`)
  exemplos = await exemplosDificeis(new Set(AVALIAR ? todos.filter((b) => b.tipo).map((b) => b.id) : []))
  if (AVALIAR) exemplos = [] // na avaliação os difíceis SÃO a prova; não dá pra mostrar a resposta

  const gravar = async (b, c, tipoFinal) => {
    b.feito = true
    b.tipoNovo = tipoFinal
    for (const x of b.angulos || []) {
      if (!x.feito && precisaBase(x)) await gravar(x, { ...c, confianca: c.confianca, motivo: `mesmo take que ${b.nome}, outro ângulo` + (c.motivo ? ' — ' + c.motivo : '') }, tipoFinal)
    }
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
    const comFala = alvosIdx.filter((i) => lista[i].transc)
    // grupos de até 8 alvos, sem abrir janela maior que 14 clipes
    const grupos = []
    // pausa de mais de 3 min entre dois clipes = provavelmente outro vídeo: a janela não atravessa
    const pausaLonga = (de, ate) => { for (let k = de + 1; k <= ate; k++) if ((pausaEntre(lista[k - 1], lista[k]) ?? 0) > 180) return true; return false }
    for (const i of comFala) {
      const g = grupos[grupos.length - 1]
      if (g && g.length < 8 && i - g[0] <= 11 && !pausaLonga(g[g.length - 1], i) && lista[g[0]].divisao === lista[i].divisao) g.push(i)
      else grupos.push([i])
    }
    // Uma janela que falha (JSON quebrado da Groq, resposta cortada) é dividida ao meio e tentada de
    // novo; clipe que a IA pulou ganha uma segunda chance numa janela só dele. Antes, um JSON inválido
    // derrubava 6 clipes de uma vez.
    const rodarGrupo = async (g, tentativa = 0) => {
      const ini = Math.max(0, g[0] - 2), fim = Math.min(lista.length, g[g.length - 1] + 3)
      // a janela não mistura vídeos: o contexto é só do mesmo vídeo do projeto
      const janela = lista.slice(ini, fim).filter((b) => b.divisao === lista[g[0]].divisao)
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
        // o motivo cita a fala: só aparece na avaliação local, não no registro público do GitHub
        console.log(`✓ ${b.nome} ${durDe(b)} → ${t} (${c.confianca})${AVALIAR ? ' ' + String(c.motivo || '').slice(0, 70) : ''}`)
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
  // take principal que já estava classificado de rodadas anteriores: o ângulo novo herda o tipo dele
  if (!cotaAcabou) for (const b of todos) {
    const y = b.anguloDe
    if (!y || b.feito || !precisaBase(b) || !(y.tipo || y.ia_tipo)) continue
    await gravar(b, { motivo: `mesmo take que ${y.nome}, outro ângulo`, confianca: 0.9 }, y.tipo || y.ia_tipo)
  }
  // ---- UNIÃO DOS BONS ----
  // Em cada vídeo novo, a IA une os takes que considera bons (boa, gancho, complemento, com os ângulos
  // deles): ligou um ao card, os outros vão junto — a pessoa só confere. Erro e sem fala ficam soltos
  // dentro do vídeo. Antes a união era por ângulo, e um take ruim ficava grudado num bom.
  if (!AVALIAR && !cotaAcabou) {
    let unidos = 0
    for (const [id, membros] of divNovas) {
      const bom = (m) => ['boa', 'gancho', 'complemento'].includes(m.tipo || m.tipoNovo || m.ia_tipo) // humano > o que a IA acabou de decidir > o antigo
      const soltar = membros.filter((m) => m.grupo && !bom(m)).map((m) => m.id)
      if (soltar.length) await sb(`brutos?drive_id=in.(${soltar.join(',')})`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ grupo_id: null }) })
      const bons = membros.filter(bom)
      if (bons.length < 2) {
        if (bons.length === 1 && bons[0].grupo) await sb(`brutos?drive_id=eq.${encodeURIComponent(bons[0].id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ grupo_id: null }) })
        continue
      }
      const g = crypto.randomUUID()
      const r = await sb(`brutos?drive_id=in.(${bons.map((m) => m.id).join(',')})`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ grupo_id: g }) })
      if (r.ok) unidos++
    }
    if (divNovas.size) console.log(`vídeos: ${divNovas.size} · com takes bons unidos: ${unidos}`)
  }
  console.log(`tokens gastos: ${gastos}`)
  console.log(`classificados: ${nClass}${pendentes ? ` · pendentes: ${pendentes}` : ''}${cotaAcabou ? ' · parou na cota do dia' : ''}`)
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
        if (t) { await upsert({ drive_id: x.drive_id, team: TEAM, sugestao_titulo: t }); console.log(`  ${x.nome} → título salvo`) }
      } catch (e) { console.log(`  ${x.nome} erro: ${e.message}`); if (e instanceof CotaEsgotada) break }
    }
  }
}
fs.rmSync(TMP, { recursive: true, force: true })
console.log('fim')
