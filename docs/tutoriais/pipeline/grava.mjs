// Runner: grava cena a cena (Safari real + screencapture), casa com a narração e monta o módulo.
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { js, kit, osa, sleep, SITE, ativar, novaJanela, irPara, getWin } from './motor.mjs'
import { inicios } from './beats.mjs'

const exec = promisify(execFile)
const BASE = new URL('.', import.meta.url).pathname

// viewport da página em pontos (16:9). Encostada à esquerda: o banner de notificação nasce
// no canto superior direito (x≈1055pt), fora do quadro gravado.
export const VW = 1152
export const VH = 648

export async function garantirJanela() {
  try {
    const r = await js('1+1')
    if (r.trim() === '2') return getWin()
  } catch { /* janela morreu ou nunca existiu */ }
  return novaJanela(SITE)
}

export async function prepararViewport() {
  const w = getWin()
  await osa(`tell application "Safari" to set bounds of window id ${w} to {0, 25, ${VW}, ${25 + VH + 90}}`)
  await sleep(400)
  for (let i = 0; i < 5; i++) {
    const [iw, ih] = JSON.parse(await js('JSON.stringify([innerWidth,innerHeight])'))
    const dw = VW - iw
    const dh = VH - ih
    if (Math.abs(dw) <= 1 && Math.abs(dh) <= 1) break
    const b = JSON.parse('[' + (await osa(`tell application "Safari" to get bounds of window id ${w}`)) + ']')
    await osa(`tell application "Safari" to set bounds of window id ${w} to {${b[0]}, ${b[1]}, ${b[2] + dw}, ${b[3] + dh}}`)
    await sleep(300)
  }
  const b = JSON.parse('[' + (await osa(`tell application "Safari" to get bounds of window id ${w}`)) + ']')
  const [iw, ih] = JSON.parse(await js('JSON.stringify([innerWidth,innerHeight])'))
  return { x: b[0], y: b[3] - ih, w: iw, h: ih } // topo da viewport = base da janela - altura interna
}

export async function dur(mp3) {
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3])
  return parseFloat(stdout.trim())
}

// o app recarrega a página em algumas ações (entrar no especialista, deep link) e leva o kit junto.
// Toda chamada passa por aqui: se __tut sumiu, reinjeta e repete.
// caminho feliz = UMA chamada só (duas dobravam o atraso do destaque em relação à fala).
// Se o kit sumiu (a página recarregou), a chamada volta vazia: aí reinjeta e repete.
async function tut(expr) {
  const r = await js(expr).catch(() => '')
  if (String(r).trim() !== '') return r
  await kit()
  return js(expr).catch(() => 'nao')
}

// log de destaques: cada alvo aceso, na ordem. É o que permite auditar repetição depois.
export const destaques = []
export function limparDestaques() { destaques.length = 0 }

export const helpers = {
  js,
  sleep,
  kit,
  ativar,
  async clicar(sel, txt, idx) { const r = await tut(`__tut.clicar(${JSON.stringify(sel)}, ${JSON.stringify(txt || '')}, ${idx || 0})`); await sleep(1450); return r },
  async mover(sel, txt, idx) { return tut(`__tut.mover(${JSON.stringify(sel)}, ${JSON.stringify(txt || '')}, ${idx || 0})`) },
  async destacar(sel, txt, pad, idx) { destaques.push(txt || sel); return tut(`__tut.destacar(${JSON.stringify(sel)}, ${JSON.stringify(txt || '')}, ${pad || 10}, ${idx || 0})`) },
  async apagar() { return tut('__tut.apagar()') },
  async irAte(sel, txt, idx) { const r = await tut(`__tut.irAte(${JSON.stringify(sel)}, ${JSON.stringify(txt || '')}, ${idx || 0})`); await sleep(900); return r },
  async clicarPai(sel, txt, niveis, idx) { const r = await tut(`__tut.clicarPai(${JSON.stringify(sel)}, ${JSON.stringify(txt || '')}, ${niveis || 1}, ${idx || 0})`); await sleep(1450); return r },
  async destacarPai(sel, txt, niveis, pad, idx) { destaques.push(txt || sel); return tut(`__tut.destacarPai(${JSON.stringify(sel)}, ${JSON.stringify(txt || '')}, ${niveis || 1}, ${pad || 10}, ${idx || 0})`) },
  async legenda(t) { return tut(`__tut.legenda(${JSON.stringify(t || '')})`) },
  async rolarH(px) { return tut(`__tut.rolarH(${px})`) },
  async rolarPerto(txt, px) { return tut(`__tut.rolarPerto(${JSON.stringify(txt)}, ${px})`) },
  async rolarV(sel, px) { return tut(`__tut.rolarV(${JSON.stringify(sel || 'div')}, ${px})`) },
  async ir(aba) { const r = await tut(`__tut.clicar('header button', ${JSON.stringify(aba)})`); await sleep(2200); return r },
  async abrir(url) { await irPara(url); await sleep(1400); await kit() },
}

// grava UMA cena: prepara (fora do ar), roda screencapture pela duração da narração, executa as ações
export async function gravarCena(cena, rect) {
  const audio = `${BASE}audio/${cena.id}.mp3`
  const d = existsSync(audio) ? await dur(audio) : cena.segundos || 8
  const total = Math.ceil((d + 1.5) * 10) / 10
  mkdirSync(`${BASE}bruto`, { recursive: true })
  mkdirSync(`${BASE}cenas`, { recursive: true })
  const mov = `${BASE}bruto/${cena.id}.mov`
  const mp4 = `${BASE}cenas/${cena.id}.mp4`

  await ativar()
  await kit()
  if (cena.pre) await cena.pre(helpers)
  await ativar()
  await kit()
  await sleep(600)

  // screencapture NÃO sobrescreve arquivo existente: apagar antes, senão fica o take velho
  if (existsSync(mov)) rmSync(mov)
  // sem -V: eu mesmo paro com SIGINT quando as ações terminam (com -V o arquivo saía truncado)
  const p = spawn('screencapture', ['-v', '-R', `${rect.x},${rect.y},${rect.w},${rect.h}`, '-x', mov])
  const fim = new Promise((res) => p.on('close', res))
  await sleep(900) // screencapture leva um tiquinho pra engatar
  const t0 = Date.now()
  if (cena.frases && cena.acoes) {
    // cada ação entra no instante em que a frase dela começa a ser falada (medido no mp3)
    const ts = await inicios(audio, cena.frases)
    const ATRASO = 350 // o áudio entra 0,35s depois do vídeo
    const LATENCIA = 900 // comando + render + transição do destaque até aparecer na tela
    for (let i = 0; i < cena.acoes.length; i++) {
      const alvo = Math.max(0, ATRASO + (ts[i] || 0) * 1000 - LATENCIA)
      const esperar = alvo - (Date.now() - t0)
      if (esperar > 0) await sleep(esperar)
      await cena.acoes[i](helpers)
    }
  } else if (cena.run) {
    await cena.run(helpers)
  }
  const gasto = (Date.now() - t0) / 1000
  // respiro mínimo depois da última ação: sem isso o último destaque não entra no vídeo
  const faltam = Math.max(d + 0.9 - gasto, 0.9)
  await sleep(faltam * 1000)
  p.kill('SIGINT')
  await fim
  await sleep(400)
  console.log(`  ${cena.id}: narração ${d.toFixed(1)}s · ações ${gasto.toFixed(1)}s · vídeo ${total}s`)

  await juntar(mov, audio, mp4, d)
  return { mp4, d, total, gasto }
}

// vídeo do screencapture é VFR: sem fps fixo + duração explícita o mp4 sai com tempo errado
export async function juntar(mov, audio, mp4, d) {
  const dur = (d + 1.0).toFixed(2)
  const temAudio = existsSync(audio)
  const fc = temAudio
    ? '[0:v]fps=30,scale=1920:1080:flags=lanczos,tpad=stop_mode=clone:stop_duration=40,setpts=PTS-STARTPTS[v];[1:a]adelay=350|350,apad[a]'
    : '[0:v]fps=30,scale=1920:1080:flags=lanczos,tpad=stop_mode=clone:stop_duration=40,setpts=PTS-STARTPTS[v]'
  const args = ['-y', '-v', 'error', '-i', mov]
  if (temAudio) args.push('-i', audio)
  args.push('-filter_complex', fc, '-map', '[v]')
  if (temAudio) args.push('-map', '[a]', '-c:a', 'aac', '-b:a', '192k')
  args.push('-c:v', 'libx264', '-crf', '19', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-r', '30', '-t', dur, mp4)
  await exec('ffmpeg', args, { maxBuffer: 1e8 })
  return mp4
}

export async function montarModulo(id, ids) {
  const lista = `${BASE}bruto/${id}-lista.txt`
  writeFileSync(lista, ids.map((i) => `file '${BASE}cenas/${i}.mp4'`).join('\n'))
  mkdirSync(`${BASE}saida`, { recursive: true })
  const saida = `${BASE}saida/${id}.mp4`
  await exec('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', saida], { maxBuffer: 1e8 })
  return saida
}

export { js, kit, osa, sleep, SITE, ativar }
