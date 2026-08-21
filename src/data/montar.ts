/**
 * Emenda as peças no navegador, com ffmpeg em WebAssembly.
 *
 * Duas estratégias, nesta ordem: quando as peças foram gravadas juntas (mesmo
 * codec, resolução e fps), a emenda é feita SEM recodificar e leva menos de um
 * segundo por peça. Quando não são compatíveis, cai para a recodificação, que
 * funciona sempre mas é lenta — por isso o aviso aparece antes de começar.
 */
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import type { Combinacao, Peca } from './multiplicar'

const CDN = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd'
let ffmpeg: FFmpeg | null = null
let carregando: Promise<FFmpeg> | null = null

export async function motor(aoProgredir?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpeg) return ffmpeg
  if (carregando) return carregando
  carregando = (async () => {
    const f = new FFmpeg()
    f.on('log', ({ message }) => {
      if (/frame=|Error|Invalid/.test(message)) aoProgredir?.(message)
    })
    await f.load({
      coreURL: await toBlobURL(`${CDN}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CDN}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    ffmpeg = f
    return f
  })()
  return carregando
}

const nomeVirtual = (p: Peca) => `${p.papel}-${p.id}.mp4`

/**
 * Baixa do Drive e escreve no sistema de arquivos virtual. Cada peça entra uma
 * única vez, mesmo aparecendo em trinta combinações — é isso que faz a
 * multiplicação custar quase nada depois.
 */
export async function carregarPecas(
  f: FFmpeg, pecas: Peca[], pasta: string, aoProgredir?: (m: string) => void,
) {
  for (const p of pecas) {
    aoProgredir?.(`baixando ${p.nome}`)
    const r = await fetch(`/api/mult-arquivo?id=${encodeURIComponent(p.id)}&pasta=${encodeURIComponent(pasta)}`)
    if (!r.ok) throw new Error(`não consegui baixar ${p.nome}: ${await r.text()}`)
    await f.writeFile(nomeVirtual(p), await fetchFile(await r.blob()))
  }
}

export interface Resultado { blob: Blob; recodificou: boolean }

/** O readFile devolve um tipo que abrange SharedArrayBuffer, que o Blob recusa. */
function paraBlob(dados: unknown): Blob {
  // copiar para um ArrayBuffer próprio: o buffer do ffmpeg pode ser
  // compartilhado, e o Blob não aceita SharedArrayBuffer
  const origem = dados as Uint8Array
  const copia = new Uint8Array(origem.byteLength)
  copia.set(origem)
  return new Blob([copia.buffer as ArrayBuffer], { type: 'video/mp4' })
}

export async function montar(f: FFmpeg, c: Combinacao, compativel: boolean): Promise<Resultado> {
  const partes = [c.gancho, c.corpo, c.cta].filter(Boolean) as Peca[]
  const saida = `saida-${c.id}.mp4`

  if (compativel) {
    // concat demuxer: sem recodificar, a emenda é praticamente instantânea
    const lista = partes.map(p => `file '${nomeVirtual(p)}'`).join('\n')
    await f.writeFile(`lista-${c.id}.txt`, new TextEncoder().encode(lista))
    try {
      await f.exec(['-f', 'concat', '-safe', '0', '-i', `lista-${c.id}.txt`,
                    '-c', 'copy', '-movflags', '+faststart', saida])
      const dados = await f.readFile(saida)
      await f.deleteFile(saida).catch(() => {})
      await f.deleteFile(`lista-${c.id}.txt`).catch(() => {})
      return { blob: paraBlob(dados), recodificou: false }
    } catch {
      await f.deleteFile(`lista-${c.id}.txt`).catch(() => {})
      // cai para a recodificação abaixo
    }
  }

  // recodifica: aceita fontes com formatos diferentes, ao custo de tempo
  const entradas = partes.flatMap(p => ['-i', nomeVirtual(p)])
  const alvoL = c.corpo.largura ?? 1080
  const alvoA = c.corpo.altura ?? 1920
  const cadeia = partes.map((_, i) =>
    `[${i}:v]scale=${alvoL}:${alvoA}:force_original_aspect_ratio=increase,` +
    `crop=${alvoL}:${alvoA},setsar=1,fps=30[v${i}];[${i}:a]aresample=48000[a${i}];`).join('')
  const rotulos = partes.map((_, i) => `[v${i}][a${i}]`).join('')
  await f.exec([...entradas, '-filter_complex',
    `${cadeia}${rotulos}concat=n=${partes.length}:v=1:a=1[v][a]`,
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast',
    '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart', saida])
  const dados = await f.readFile(saida)
  await f.deleteFile(saida).catch(() => {})
  return { blob: paraBlob(dados), recodificou: true }
}

/** Mesmo formato em todas as peças significa que dá para emendar sem recodificar. */
export function saoCompativeis(pecas: Peca[]): boolean {
  const medidos = pecas.filter(p => p.largura && p.altura)
  if (medidos.length < 2) return true
  const primeiro = `${medidos[0].largura}x${medidos[0].altura}`
  return medidos.every(p => `${p.largura}x${p.altura}` === primeiro)
}
