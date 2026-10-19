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
    `&fields=files(id,name,mimeType,createdTime)&pageSize=500&orderBy=name&${COMUM}`,
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

async function mudo(arquivo) {
  const dur = Number((await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', arquivo])).stdout.trim())
  const r = await exec('ffmpeg', ['-hide_banner', '-nostats', '-i', arquivo, '-vn',
    '-af', 'silencedetect=noise=-35dB:d=0.4', '-f', 'null', '-']).catch(e => e)
  let ini = 0, fim = 0, abre = null
  for (const [, k, v] of (r.stderr || '').matchAll(/silence_(start|end): ([\d.]+)/g)) {
    if (k === 'start') abre = Number(v)
    else { if (abre !== null && abre < 0.05) ini = Number(v); abre = null }
  }
  if (abre !== null) fim = dur - abre
  return { ini, fim }
}

const temData = x => /4 de novembro|19 ?h|19 horas/i.test(x.texto)

const REGRA = `Você monta anúncios de vídeo de um professor de Direito (Jaylton Lopes) juntando três gravações na ordem GANCHO -> CORPO -> CTA.
Avalie se duas peças podem ficar em sequência num mesmo anúncio sem contradição, sem repetir o mesmo argumento e sem promessa que a outra não sustenta.
Notas: F = combina muito bem (a segunda continua naturalmente a primeira); S = serve (funciona, sem atrito); N = não serve (contradiz, repete, muda de assunto ou de oferta).
Seja exigente: todas as peças falam da mesma oferta, então "é o mesmo assunto" NÃO basta para F ou S.
Dê N quando as duas peças repetem o mesmo dado ou argumento específico: o mesmo valor (ex.: "mais de R$19.000"), a mesma frase de oferta ("uma única matrícula por um valor irrisório", "acesso para sempre"), a mesma lista de cursos, o mesmo bônus dos primeiros inscritos. A data da live (4 de novembro, 19h) repetida no CTA é normal: não conte como repetição.
Dê F só quando a segunda peça traz algo novo que a primeira pediu.
O tema da campanha — "a última assinatura vitalícia", "última vez", "nunca mais" — aparece em quase todas as peças de propósito: repetir esse tema NÃO é repetição e não tira nota.
Responda só JSON no formato {"A01": {"B01": "F", "B02": "N"}, ...} cobrindo TODOS os pares pedidos.`

// junta o que o plano anterior já julgou com a IA só para os pares que faltam
async function cruzar(nomeA, as, nomeB, bs, antes) {
  const m = {}
  for (const a of as) { m[a.cod] = {}; for (const b of bs) { const v = antes?.[a.cod]?.[b.cod]; if (a.velha && b.velha && v) m[a.cod][b.cod] = v } }
  const novosA = as.filter(a => !a.velha), novosB = bs.filter(b => !b.velha)
  const pedidos = antes ? [[novosA, bs], [as.filter(a => a.velha), novosB]] : [[as, bs]]
  for (const [xa, xb] of pedidos) {
    if (!xa.length || !xb.length) continue
    const r = await matriz(nomeA, xa, nomeB, xb)
    for (const a of xa) Object.assign(m[a.cod], r[a.cod])
  }
  return m
}

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

  // ACRESCENTAR: os anúncios do plano anterior ficam como estão (mesmo código,
  // mesmo arquivo); só as peças novas são avaliadas e só as combinações com
  // elas entram, com letras depois das que já existem
  const antes = process.env.ACRESCENTAR === 'true' ? await planoAtual() : null
  if (antes) {
    const velhas = Object.fromEntries([...antes.ganchos, ...antes.corpos, ...antes.ctas].map(x => [x.id, x]))
    for (const grupo of [G, C, T]) {
      const usados = new Set(grupo.map(x => velhas[x.id]?.cod).filter(Boolean))
      for (const x of grupo) {
        if (velhas[x.id]) { x.cod = velhas[x.id].cod; x.texto = velhas[x.id].texto; x.velha = true; continue }
        // número do arquivo já usado por outra peça: pega o próximo livre
        let n = Number(x.cod.slice(1))
        while (usados.has(x.cod[0] + String(n).padStart(2, '0'))) n++
        x.cod = x.cod[0] + String(n).padStart(2, '0'); usados.add(x.cod)
      }
    }
    console.log(`acrescentando: ${[...G, ...C, ...T].filter(x => !x.velha).map(x => x.name).join(', ') || 'nada novo'}`)
  }

  for (const x of [...G, ...C, ...T]) {
    if (x.velha) continue
    const arq = await local(x)
    x.texto = await transcrever(arq)
    console.log(`  ${x.cod} (${x.name}): ${x.texto.slice(0, 90)}`)
    // peça com rabo mudo deixa o anúncio parado antes do corte (Gancho 07, 19/10)
    const { ini, fim } = await mudo(arq)
    if (ini > 0.8 || fim > 0.8) console.log(`  ATENÇÃO ${x.cod}: ${ini.toFixed(1)}s mudo no começo, ${fim.toFixed(1)}s no fim`)
  }

  // peça com fala de bastidor ou que já é um anúncio inteiro estraga todas as
  // combinações em que entra: aponta no log antes de montar
  const revisao = await julgar(`Você revisa gravações de anúncio antes da montagem. Responda só JSON {"problemas": [{"cod": "G01", "motivo": "..."}]}.
Aponte só problema real: fala de bastidor dentro do take (instrução da equipe, "vai", "corta", "agora o corpo"), frase cortada no começo ou no fim, gancho que já traz corpo e chamada para ação inteiros (é um anúncio completo), ou peça no lugar errado (um CTA na pasta de ganchos). Lista vazia se estiver tudo certo.`,
    [...G, ...C, ...T].filter(x => !x.velha).map(x => `${x.cod} (${x.name}): "${x.texto}"`).join('\n'))
  for (const p of revisao.problemas || []) console.log(`  ATENÇÃO ${p.cod}: ${p.motivo}`)

  // par já julgado no plano anterior não volta pra IA
  const gc = await cruzar('gancho', G, 'corpo', C, antes?.gc)
  const ct = await cruzar('corpo', C, 'cta', T, antes?.ct)

  // só os pares que ficam colados no vídeo decidem. O gancho × CTA (que o lote de
  // agosto também usava) barrava colunas inteiras de CTA sem motivo; entre os
  // dois existe o corpo, e a repetição que importa ali é a data, travada abaixo
  const ok = n => n === 'F' || n === 'S'
  const letra = i => i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + i % 26)
  const combinacoes = antes ? [...antes.combinacoes] : []
  const feitas = new Set(combinacoes.map(x => `${x.g}|${x.c}|${x.t}`))
  C.forEach((c, ci) => {
    const grupo = []
    // o número do corpo no código vem do plano anterior quando ele já existia
    const prefixoCorpo = combinacoes.find(x => x.c === c.cod)?.cod.match(/^AD\d+/)?.[0] ||
      `AD${String(ci + 1).padStart(2, '0')}`
    const jaTem = combinacoes.filter(x => x.c === c.cod).length
    for (const g of G) for (const t of T) {
      if (feitas.has(`${g.cod}|${c.cod}|${t.cod}`)) continue
      const notas = [gc[g.cod][c.cod], ct[c.cod][t.cod]]
      // todo CTA já diz a data da live; dita nas três partes vira ladainha
      if ([g, c, t].every(temData)) continue
      if (notas.every(ok)) grupo.push({ g: g.cod, c: c.cod, t: t.cod, f: notas.filter(n => n === 'F').length })
    }
    grupo.sort((x, y) => y.f - x.f || x.g.localeCompare(y.g) || x.t.localeCompare(y.t))
    grupo.forEach((x, i) => combinacoes.push({ cod: `${prefixoCorpo}${letra(jaTem + i)}`, ...x }))
  })
  console.log(`${combinacoes.length} combinações de ${G.length * C.length * T.length} possíveis` +
    (antes ? ` (${combinacoes.length - antes.combinacoes.length} novas)` : ''))

  const so = xs => xs.map(({ id, name, cod, texto }) => ({ id, name, cod, texto }))
  const plano = { prefixo: PREFIXO, pasta: PASTA, kit: raiz.kit.id, ganchos: so(G), corpos: so(C), ctas: so(T), gc, ct, combinacoes }
  fs.writeFileSync(PLANO, JSON.stringify(plano, null, 1))

  // a tabela vai junto pro Drive: é por ela que se descobre o que tem em cada anúncio
  const saida = await pastaDeSaida(PASTA, 'Montados')
  const csv = path.join(TRAB, 'composicao.csv')
  const nome = x => [...G, ...C, ...T].find(p => p.cod === x).name.replace(/\.[a-z0-9]+$/i, '')
  fs.writeFileSync(csv, '﻿anúncio;gancho;corpo;cta;pares fortes\n' + combinacoes.map(x =>
    `${PREFIXO}-${x.cod};${nome(x.g)};${nome(x.c)};${nome(x.t)};${x.f}`).join('\n'))
  // a planilha antiga sai: a nova já traz todas as linhas
  for (const f of (await filhos(saida)).filter(x => /^composi/i.test(x.name)))
    await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?supportsAllDrives=true`, {
      method: 'PATCH', body: JSON.stringify({ trashed: true }),
      headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json' } })
  await subir(csv, saida, 'composição dos anúncios.csv', 'text/csv')
  await subir(PLANO, saida, 'plano.json', 'application/json')
  console.log('plano e tabela no Drive, pasta Montados')
}

// rodadas refeitas deixam mais de um plano na pasta: vale o mais novo
async function planoAtual() {
  const saida = await pastaDeSaida(PASTA, 'Montados')
  const f = (await filhos(saida)).filter(x => x.name === 'plano.json')
    .sort((a, b) => b.createdTime.localeCompare(a.createdTime))[0]
  if (!f) return null
  const destino = path.join(TRAB, 'plano-' + f.id + '.json')
  if (!fs.existsSync(destino)) await baixar(f.id, destino)
  return JSON.parse(fs.readFileSync(destino, 'utf8'))
}

// ---------------------------------------------------------------- montar
function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) }

async function montar(parte, de) {
  const saida = await pastaDeSaida(PASTA, 'Montados')
  const plano = await planoAtual()
  if (!plano) throw new Error('sem plano.json: rode o mapeamento antes')
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
      // o Drive devolve 502 de vez em quando no envio de arquivo grande: tenta de novo
      for (let k = 1; ; k++) {
        try { await subir(fim, saida, nome); break }
        catch (e) { if (k >= 4) throw e; await new Promise(r => setTimeout(r, 5000 * k)) }
      }
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
