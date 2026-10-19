// Junta gancho + corpo + CTA com film burn, swoosh e música — inteiro na nuvem.
// É o mesmo acabamento do lote PDS de agosto (_lote.mjs), que só rodava no Mac
// com o HD plugado. Aqui tudo sai do Drive e volta pro Drive: a pasta tem
// Ganchos/, Corpos/, CTA`s/ e _kit/ (transicoes/, musicas/, swoosh.mp3).
//
// Duas etapas, pensadas pro GitHub Actions:
//   --mapear            transcreve as peças, pede à Groq o cruzamento e grava plano.json
//   --montar --parte i --de N   monta a fatia i das combinações e sobe pra Montados/
//
// Env: GOOGLE_SERVICE_ACCOUNT_KEY, GROQ_KEY, PASTA (id da pasta Anúncios), PREFIXO
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { token, baixar, subir, pastaDeSaida } from './lib/drive-montagem.mjs'
import { montarPeca, porMusica } from './lib/ffmpeg-montagem.mjs'

const exec = promisify(execFile)
const PASTA = process.env.PASTA
const PREFIXO = process.env.PREFIXO || '2610-JL-BF-CAP'
const GROQ = process.env.GROQ_KEY
const TRAB = process.env.TRAB || path.join(os.tmpdir(), 'anuncios')
const PLANO = process.env.PLANO || 'plano.json'
const COMUM = 'supportsAllDrives=true&includeItemsFromAllDrives=true'
if (!PASTA) { console.error('faltou PASTA'); process.exit(1) }
fs.mkdirSync(TRAB, { recursive: true })

async function filhos(id) {
  const q = encodeURIComponent(`'${id}' in parents and trashed=false`)
  const d = await (await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}` +
    `&fields=files(id,name,mimeType)&pageSize=500&orderBy=name&${COMUM}`,
    { headers: { Authorization: 'Bearer ' + await token() } })).json()
  if (d.error) throw new Error(d.error.message)
  return d.files
}
const ehPasta = f => f.mimeType === 'application/vnd.google-apps.folder'
const norm = s => s.normalize('NFC').toLowerCase().replace(/[^a-z0-9]/g, '')

// as pastas vêm com nomes livres ("CTA`s", "Corpos"), então acho pelo começo
async function pastasDaRaiz() {
  const fs_ = await filhos(PASTA)
  const acha = pre => fs_.find(f => ehPasta(f) && norm(f.name).startsWith(pre))
  const r = { ganchos: acha('gancho'), corpos: acha('corpo'), ctas: acha('cta'), kit: acha('kit') }
  for (const [k, v] of Object.entries(r)) if (!v) throw new Error(`não achei a pasta de ${k}`)
  return r
}

// "Corpos 2.mp4" e "Corpo 1.mp4" convivem: o número é o que identifica
const numero = n => Number((n.match(/(\d+)\s*\.[a-z0-9]+$/i) || n.match(/(\d+)/) || [])[1])
async function pecas(pasta, letra) {
  return (await filhos(pasta.id))
    .filter(f => /\.(mp4|mov)$/i.test(f.name))
    .map(f => ({ ...f, cod: `${letra}${String(numero(f.name)).padStart(2, '0')}` }))
    .sort((a, b) => a.cod.localeCompare(b.cod))
}

async function local(f) {
  const destino = path.join(TRAB, f.id + path.extname(f.name))
  if (!fs.existsSync(destino)) {
    for (let k = 1; ; k++) {
      try { await baixar(f.id, destino + '.part'); fs.renameSync(destino + '.part', destino); break }
      catch (e) { if (k >= 4) throw e; await new Promise(r => setTimeout(r, 3000 * k)) }
    }
  }
  return destino
}

// ---------------------------------------------------------------- Groq
async function groq(url, init, rotulo) {
  for (let k = 1; ; k++) {
    const r = await fetch(url, init())
    if ((r.status === 429 || r.status >= 500) && k < 10) {
      const espera = Number(r.headers.get('retry-after')) || 10 * k
      console.log(`  ${rotulo}: ${r.status}, esperando ${espera}s`)
      await new Promise(res => setTimeout(res, espera * 1000)); continue
    }
    const d = await r.json()
    if (!r.ok) throw new Error(`${rotulo} ${r.status} ${JSON.stringify(d).slice(0, 200)}`)
    return d
  }
}

async function transcrever(arquivo) {
  const mp3 = arquivo + '.mp3'
  await exec('ffmpeg', ['-y', '-v', 'error', '-i', arquivo, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', mp3])
  const d = await groq('https://api.groq.com/openai/v1/audio/transcriptions', () => {
    const form = new FormData()
    form.append('file', new Blob([fs.readFileSync(mp3)]), 'a.mp3')
    form.append('model', 'whisper-large-v3-turbo')
    form.append('language', 'pt')
    form.append('response_format', 'json')
    return { method: 'POST', headers: { Authorization: 'Bearer ' + GROQ }, body: form }
  }, 'whisper')
  return (d.text || '').trim()
}

async function julgar(sistema, usuario) {
  const d = await groq('https://api.groq.com/openai/v1/chat/completions', () => ({
    method: 'POST',
    headers: { Authorization: 'Bearer ' + GROQ, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b', temperature: 0.1, reasoning_effort: 'medium',
      max_completion_tokens: 6000, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: sistema }, { role: 'user', content: usuario }],
    }),
  }), 'cruzamento')
  return JSON.parse(d.choices[0].message.content)
}

const REGRA = `Você monta anúncios de vídeo de um professor de Direito (Jaylton Lopes) juntando três gravações na ordem GANCHO -> CORPO -> CTA.
Avalie se duas peças podem ficar em sequência num mesmo anúncio sem contradição, sem repetir o mesmo argumento e sem promessa que a outra não sustenta.
Notas: F = combina muito bem (a segunda continua naturalmente a primeira); S = serve (funciona, sem atrito); N = não serve (contradiz, repete, muda de assunto ou de oferta).
Responda só JSON no formato {"A01": {"B01": "F", "B02": "N"}, ...} cobrindo TODOS os pares pedidos.`

async function matriz(nomeA, as, nomeB, bs) {
  const lista = (rot, xs) => xs.map(x => `${x.cod}: "${x.texto}"`).join('\n')
  const r = await julgar(REGRA,
    `${nomeA.toUpperCase()}:\n${lista(nomeA, as)}\n\n${nomeB.toUpperCase()}:\n${lista(nomeB, bs)}\n\n` +
    `Dê a nota de cada ${nomeA} (chave externa) com cada ${nomeB} (chave interna).`)
  // o que faltar na resposta conta como "não serve": melhor perder uma combinação que montar uma errada
  const m = {}
  for (const a of as) { m[a.cod] = {}; for (const b of bs) m[a.cod][b.cod] = String(r?.[a.cod]?.[b.cod] || 'N').toUpperCase()[0] }
  return m
}

// ---------------------------------------------------------------- mapear
async function mapear() {
  const raiz = await pastasDaRaiz()
  const G = await pecas(raiz.ganchos, 'G'), C = await pecas(raiz.corpos, 'C'), T = await pecas(raiz.ctas, 'T')
  console.log(`${G.length} ganchos, ${C.length} corpos, ${T.length} CTAs`)

  for (const x of [...G, ...C, ...T]) {
    x.texto = await transcrever(await local(x))
    console.log(`  ${x.cod} (${x.name}): ${x.texto.slice(0, 90)}`)
  }

  const gc = await matriz('gancho', G, 'corpo', C)
  const ct = await matriz('corpo', C, 'cta', T)
  const gt = await matriz('gancho', G, 'cta', T)

  // mesma regra do lote de agosto: os três pares precisam servir, e quanto mais F, melhor
  const ok = n => n === 'F' || n === 'S'
  const letra = i => i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + i % 26)
  const combinacoes = []
  C.forEach((c, ci) => {
    const grupo = []
    for (const g of G) for (const t of T) {
      const notas = [gc[g.cod][c.cod], ct[c.cod][t.cod], gt[g.cod][t.cod]]
      if (notas.every(ok)) grupo.push({ g: g.cod, c: c.cod, t: t.cod, f: notas.filter(n => n === 'F').length })
    }
    grupo.sort((x, y) => y.f - x.f || x.g.localeCompare(y.g) || x.t.localeCompare(y.t))
    grupo.forEach((x, i) => combinacoes.push({ cod: `AD${String(ci + 1).padStart(2, '0')}${letra(i)}`, ...x }))
  })
  console.log(`${combinacoes.length} combinações de ${G.length * C.length * T.length} possíveis`)

  const so = xs => xs.map(({ id, name, cod, texto }) => ({ id, name, cod, texto }))
  const plano = { prefixo: PREFIXO, pasta: PASTA, kit: raiz.kit.id, ganchos: so(G), corpos: so(C), ctas: so(T), gc, ct, gt, combinacoes }
  fs.writeFileSync(PLANO, JSON.stringify(plano, null, 1))

  // a tabela vai junto pro Drive: é por ela que se descobre o que tem em cada anúncio
  const saida = await pastaDeSaida(PASTA, 'Montados')
  const csv = path.join(TRAB, 'composicao.csv')
  const nome = x => [...G, ...C, ...T].find(p => p.cod === x).name.replace(/\.[a-z0-9]+$/i, '')
  fs.writeFileSync(csv, '﻿anúncio;gancho;corpo;cta;pares fortes\n' + combinacoes.map(x =>
    `${PREFIXO}-${x.cod};${nome(x.g)};${nome(x.c)};${nome(x.t)};${x.f}`).join('\n'))
  await subir(csv, saida, 'composição dos anúncios.csv', 'text/csv')
  await subir(PLANO, saida, 'plano.json', 'application/json')
  console.log('plano e tabela no Drive, pasta Montados')
}

// ---------------------------------------------------------------- montar
function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) }

async function montar(parte, de) {
  const saida = await pastaDeSaida(PASTA, 'Montados')
  // rodada refeita sem o mapeamento: o plano já está no Drive
  if (!fs.existsSync(PLANO)) {
    const f = (await filhos(saida)).find(x => x.name === 'plano.json')
    if (!f) throw new Error('sem plano.json: rode o mapeamento antes')
    await baixar(f.id, PLANO)
  }
  const plano = JSON.parse(fs.readFileSync(PLANO, 'utf8'))
  const prontos = new Set((await filhos(saida)).map(f => f.name))
  const minhas = plano.combinacoes.filter((_, i) => i % de === parte)
    .filter(x => !prontos.has(`${plano.prefixo}-${x.cod}.mp4`))
  console.log(`parte ${parte + 1}/${de}: ${minhas.length} anúncios`)
  if (!minhas.length) return

  const kit = await filhos(plano.kit)
  const sub = async nome => (await filhos(kit.find(f => ehPasta(f) && norm(f.name).startsWith(nome)).id))
  const burns = await Promise.all((await sub('transic')).filter(f => /\.(mp4|mov)$/i.test(f.name)).map(local))
  const musicas = await Promise.all((await sub('musica')).filter(f => /\.(mp3|wav|m4a)$/i.test(f.name)).map(local))
  const swoosh = await local(kit.find(f => /swoosh/i.test(f.name)))
  const todas = [...plano.ganchos, ...plano.corpos, ...plano.ctas]
  const arq = cod => local(todas.find(p => p.cod === cod))

  let falhas = 0
  for (const x of minhas) {
    const nome = `${plano.prefixo}-${x.cod}.mp4`
    const v = path.join(TRAB, 'v-' + nome), fim = path.join(TRAB, nome)
    try {
      const partes = [await arq(x.g), await arq(x.c), await arq(x.t)]
      // burn e música pelo código, não pela ordem: a mesma peça sai igual se for refeita
      const h = hash(x.cod)
      const { cortes, total } = await montarPeca(partes,
        [burns[h % burns.length], burns[(h + 1) % burns.length]], v,
        { largura: 1080, altura: 1920 }, { hardware: process.platform === 'darwin' })
      await porMusica(v, musicas[h % musicas.length], fim,
        { efeitos: cortes.map(t => ({ t, arquivo: swoosh, pico: 0.45 })) })
      await subir(fim, saida, nome)
      console.log(`  ${x.cod}  ${x.g}+${x.c}+${x.t}  ${Math.round(total)}s`)
    } catch (e) {
      falhas++
      console.error(`  ${x.cod} FALHOU: ${String(e.message).slice(0, 300)}`)
    }
    for (const f of [v, fim]) fs.existsSync(f) && fs.unlinkSync(f)
  }
  if (falhas) { console.error(`${falhas} com erro`); process.exit(1) }
}

const arg = process.argv
if (arg.includes('--mapear')) await mapear()
else if (arg.includes('--montar')) await montar(Number(arg[arg.indexOf('--parte') + 1]), Number(arg[arg.indexOf('--de') + 1]))
else { console.error('uso: --mapear | --montar --parte i --de N'); process.exit(1) }
