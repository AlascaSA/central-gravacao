// Sincronia de verdade: a narração é gerada com pausas entre as frases; aqui eu acho essas pausas
// no mp3 e devolvo o instante em que CADA frase começa. As ações da cena entram nesses instantes.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const exec = promisify(execFile)

export async function duracao(mp3) {
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3])
  return parseFloat(stdout.trim())
}

// devolve os inícios de fala (segundos) achando os silêncios; se não bater com o número de frases,
// cai para uma divisão proporcional ao tamanho do texto de cada frase
export async function inicios(mp3, frases, { ruido = '-34dB', minSil = 0.22 } = {}) {
  const d = await duracao(mp3)
  const n = frases.length
  if (n <= 1) return [0]
  let out = ''
  try {
    const r = await exec('ffmpeg', ['-v', 'info', '-i', mp3, '-af', `silencedetect=noise=${ruido}:d=${minSil}`, '-f', 'null', '-'], { maxBuffer: 1e8 })
    out = r.stderr || ''
  } catch (e) { out = e.stderr || '' }

  const fins = [...out.matchAll(/silence_end: ([0-9.]+)/g)].map((m) => parseFloat(m[1]))
  const inis = [...out.matchAll(/silence_start: ([0-9.]+)/g)].map((m) => parseFloat(m[1]))
  // pausas no meio (ignora silêncio inicial e o rabo final)
  const pausas = fins.filter((t, i) => t > 0.15 && t < d - 0.25 && (inis[i] === undefined || inis[i] > 0.15))

  if (pausas.length >= n - 1) {
    const escolhidas = melhores(pausas, frases, d)
    return [0, ...escolhidas]
  }
  // fallback proporcional
  const total = frases.reduce((a, f) => a + f.length, 0)
  const ts = [0]
  let acc = 0
  for (let i = 0; i < n - 1; i++) { acc += frases[i].length; ts.push((acc / total) * d) }
  return ts
}

// entre as pausas detectadas, escolhe as n-1 mais próximas do que o tamanho do texto sugere
function melhores(pausas, frases, d) {
  const total = frases.reduce((a, f) => a + f.length, 0)
  const alvo = []
  let acc = 0
  for (let i = 0; i < frases.length - 1; i++) { acc += frases[i].length; alvo.push((acc / total) * d) }
  const usadas = new Set()
  return alvo.map((t) => {
    let melhor = null
    let dist = 1e9
    pausas.forEach((p, i) => {
      if (usadas.has(i)) return
      const dd = Math.abs(p - t)
      if (dd < dist) { dist = dd; melhor = i }
    })
    if (melhor === null) return t
    usadas.add(melhor)
    return pausas[melhor]
  }).sort((a, b) => a - b)
}

// texto pro TTS: junta as frases com pausa explícita, pro silencedetect ter o que achar
export function textoComPausas(frases, seg = 0.45) {
  return frases.join(` <break time="${seg}s" /> `)
}
