/**
 * A emenda em si. Mesma estratégia do navegador, com uma vantagem: aqui existe
 * ffprobe, então dá pra saber ANTES se as peças casam — em vez de tentar copiar
 * e descobrir no erro. Quando casam, a emenda é cópia de bytes e leva ~1s.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'

const exec = promisify(execFile)
const FFMPEG = process.env.FFMPEG || 'ffmpeg'
const FFPROBE = process.env.FFPROBE || 'ffprobe'

/** Codec, medida e cadência de um arquivo — o que decide se dá pra emendar sem recodificar. */
export async function perfil(caminho) {
  const { stdout } = await exec(FFPROBE, [
    '-v', 'error', '-print_format', 'json', '-show_streams', caminho])
  const s = JSON.parse(stdout).streams || []
  const v = s.find(x => x.codec_type === 'video')
  const a = s.find(x => x.codec_type === 'audio')
  return {
    video: v ? `${v.codec_name}/${v.width}x${v.height}/${v.r_frame_rate}/${v.pix_fmt}` : null,
    audio: a ? `${a.codec_name}/${a.sample_rate}/${a.channels}` : null,
    largura: v?.width ?? null,
    altura: v?.height ?? null,
    temAudio: !!a,
  }
}

/** Todas as peças com o mesmo perfil significa que a emenda pode ser cópia pura. */
export function casam(perfis) {
  if (perfis.length < 2) return true
  const p = perfis[0]
  return perfis.every(x => x.video === p.video && x.audio === p.audio)
}

/**
 * Emenda `partes` (caminhos em disco, na ordem) em `saida`.
 * Devolve se precisou recodificar — o log da rodada mostra isso.
 */
export async function emendar(partes, saida, podeCopiar, alvo) {
  const pasta = path.dirname(saida)
  if (podeCopiar) {
    const lista = path.join(pasta, path.basename(saida) + '.lista.txt')
    fs.writeFileSync(lista, partes.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'))
    try {
      await exec(FFMPEG, ['-y', '-f', 'concat', '-safe', '0', '-i', lista,
        '-c', 'copy', '-movflags', '+faststart', saida], { maxBuffer: 1 << 24 })
      fs.unlinkSync(lista)
      return false
    } catch {
      fs.existsSync(lista) && fs.unlinkSync(lista)
      // cai para a recodificação
    }
  }

  const L = alvo?.largura || 1080
  const A = alvo?.altura || 1920
  const entradas = partes.flatMap(p => ['-i', p])
  const cadeia = partes.map((_, i) =>
    `[${i}:v]scale=${L}:${A}:force_original_aspect_ratio=increase,` +
    `crop=${L}:${A},setsar=1,fps=30[v${i}];[${i}:a]aresample=48000[a${i}];`).join('')
  const rotulos = partes.map((_, i) => `[v${i}][a${i}]`).join('')
  await exec(FFMPEG, ['-y', ...entradas, '-filter_complex',
    `${cadeia}${rotulos}concat=n=${partes.length}:v=1:a=1[v][a]`,
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast',
    '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart', saida], { maxBuffer: 1 << 24 })
  return true
}
