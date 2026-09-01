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

/**
 * Põe música por baixo da peça, com volume adaptativo.
 *
 * A voz manda: um compressor sidechain usa a fala como chave, então a música
 * cede quando ele fala e volta a subir nas pausas — sem ninguém ficar por cima
 * do outro. A música é normalizada antes porque as faixas chegam com até 6 dB
 * de diferença entre si, e o vídeo é copiado sem recodificar: só o áudio é refeito.
 */
export async function porMusica(video, musica, saida, opcoes = {}) {
  const {
    // -36 deixa a trilha uns 20 dB abaixo da voz: presente, mas sem disputar.
    duracao, alvoMusica = -36, alvoFinal = -14, entrada = 1.2, saidaFade = 2.5,
    // efeitos de transição: [{ t, arquivo, pico }] — `pico` é o instante do auge
    // dentro do clipe, para o swoosh estourar EM CIMA do corte e não depois dele
    efeitos = [], alvoEfeito = -16,
  } = opcoes
  const dur = duracao || Number((await exec(FFPROBE, [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video])).stdout.trim())
  const inicioFade = Math.max(0, dur - saidaFade)

  const cadeia = [
    `[1:a]atrim=0:${dur.toFixed(3)},asetpts=N/SR/TB,` +
      `loudnorm=I=${alvoMusica}:TP=-3:LRA=11,` +
      `afade=t=in:st=0:d=${entrada},afade=t=out:st=${inicioFade.toFixed(3)}:d=${saidaFade}[mus]`,
    `[0:a]loudnorm=I=-16:TP=-1.5,asplit=2[voz][chave]`,
    // attack curto para não atropelar a primeira sílaba, release longo para a
    // música não "bombar" entre uma frase e outra
    `[mus][chave]sidechaincompress=threshold=0.05:ratio=6:attack=12:release=500:makeup=1[baixa]`,
  ]

  // o efeito NÃO passa pelo ducking: ele marca a virada, então tem que ser ouvido
  const rotulos = ['[voz]', '[baixa]']
  efeitos.forEach((e, i) => {
    const atraso = Math.max(0, (e.t - (e.pico ?? 0)) * 1000)
    cadeia.push(`[${i + 2}:a]loudnorm=I=${alvoEfeito}:TP=-2,` +
      `adelay=${atraso.toFixed(0)}|${atraso.toFixed(0)}[fx${i}]`)
    rotulos.push(`[fx${i}]`)
  })

  // normalize=0 é essencial: sem isso o amix divide o ganho pelo número de
  // entradas e a peça sai baixa demais. O loudnorm final entrega em -14 LUFS,
  // que é o alvo de Meta e Instagram.
  const mistura = `${rotulos.join('')}amix=inputs=${rotulos.length}:duration=first:` +
    `dropout_transition=0:normalize=0`

  // Duas passadas de propósito. O loudnorm em passada única é DINÂMICO: ele
  // levanta os trechos baixos para alcançar o alvo, e acaba subindo justamente
  // a trilha nos silêncios — o oposto de uma música discreta. Medindo antes e
  // aplicando ganho linear, a proporção entre voz e trilha fica intacta.
  const medida = await exec(FFMPEG, ['-i', video, '-i', musica,
    ...efeitos.flatMap(e => ['-i', e.arquivo]),
    '-filter_complex', [...cadeia, `${mistura},loudnorm=I=${alvoFinal}:TP=-1.5:LRA=11:` +
      `print_format=json[fim]`].join(';'),
    '-map', '[fim]', '-f', 'null', '-'], { maxBuffer: 1 << 24 }).catch(e => e)
  const bruto = (medida.stderr || '').slice((medida.stderr || '').lastIndexOf('{'))
  let ajuste = `loudnorm=I=${alvoFinal}:TP=-1.5:LRA=11`
  try {
    const m = JSON.parse(bruto.slice(0, bruto.indexOf('}') + 1))
    ajuste = `loudnorm=I=${alvoFinal}:TP=-1.5:LRA=11:linear=true:` +
      `measured_I=${m.input_i}:measured_TP=${m.input_tp}:` +
      `measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}`
  } catch { /* sem a medida, cai no modo dinâmico — melhor que não normalizar */ }

  // o loudnorm trabalha em taxa alta por dentro e entrega nela se ninguém mandar
  // o contrário — sem o aresample a peça sai a 96 kHz, o dobro do necessário
  cadeia.push(`${mistura},${ajuste},alimiter=limit=0.97,aresample=48000[saida]`)

  await exec(FFMPEG, ['-y', '-i', video, '-i', musica,
    ...efeitos.flatMap(e => ['-i', e.arquivo]),
    '-filter_complex', cadeia.join(';'),
    '-map', '0:v', '-c:v', 'copy',
    '-map', '[saida]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-movflags', '+faststart', saida], { maxBuffer: 1 << 24 })
  return saida
}

/**
 * Emenda com transição entre os trechos.
 *
 * Corte seco entre gancho, corpo e CTA expõe que são três gravações diferentes —
 * cenário, enquadramento e roupa mudam de um frame para o outro. A transição
 * cobre esse salto. O áudio cruza junto (acrossfade), senão a voz corta antes
 * da imagem e fica pior do que o corte seco.
 */
export async function emendarComTransicao(partes, saida, alvo, tipo = 'fade', dur = 0.35) {
  const L = alvo?.largura || 1080, A = alvo?.altura || 1920
  const duracoes = []
  for (const p of partes) {
    const { stdout } = await exec(FFPROBE, [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p])
    duracoes.push(Number(stdout.trim()))
  }

  // todo mundo no mesmo formato antes de cruzar: o xfade exige isso
  const prep = partes.map((_, i) =>
    `[${i}:v]scale=${L}:${A}:force_original_aspect_ratio=increase,crop=${L}:${A},` +
    `setsar=1,fps=30,format=yuv420p[v${i}];[${i}:a]aresample=48000[a${i}]`).join(';')

  const passos = []
  let vAtual = 'v0', aAtual = 'a0', acumulado = duracoes[0]
  for (let i = 1; i < partes.length; i++) {
    const offset = (acumulado - dur).toFixed(3)
    const vSaida = i === partes.length - 1 ? 'vfim' : `vx${i}`
    const aSaida = i === partes.length - 1 ? 'afim' : `ax${i}`
    passos.push(`[${vAtual}][v${i}]xfade=transition=${tipo}:duration=${dur}:offset=${offset}[${vSaida}]`)
    passos.push(`[${aAtual}][a${i}]acrossfade=d=${dur}:c1=tri:c2=tri[${aSaida}]`)
    vAtual = vSaida; aAtual = aSaida
    acumulado += duracoes[i] - dur   // cada cruzamento come `dur` da soma
  }

  await exec(FFMPEG, ['-y', ...partes.flatMap(p => ['-i', p]),
    '-filter_complex', `${prep};${passos.join(';')}`,
    '-map', '[vfim]', '-map', '[afim]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', saida], { maxBuffer: 1 << 24 })
  return acumulado
}

/**
 * Aplica os film burns por cima das emendas, em modo screen.
 *
 * Os burns vêm deitados (1920x1080, 24fps). Girando 90° eles dão exatamente
 * 1080x1920; se a peça estiver em 4K vertical, ainda precisam crescer depois de
 * girar. Screen é o modo certo: o preto do clipe some e só o fogo entra — por
 * isso cada burn é montado num stream do tamanho da peça inteira, com preto
 * antes e depois, e o preto não altera nada na mesclagem.
 *
 * @param pontos [{ t, burn }] — instante (s) do corte e o arquivo do burn
 */
export async function porFilmBurn(video, pontos, saida, alvo) {
  if (!pontos.length) return video
  const L = alvo?.largura || 1080, A = alvo?.altura || 1920
  const { stdout } = await exec(FFPROBE, [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video])
  const total = Number(stdout.trim())

  const durs = []
  for (const p of pontos) {
    const r = await exec(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration',
      '-of', 'csv=p=0', p.burn])
    durs.push(Number(r.stdout.trim()))
  }

  const partes = ['[0:v]format=gbrp[base0]']
  let base = 'base0'
  pontos.forEach((p, i) => {
    const d = durs[i]
    // o burn fica CENTRADO no corte: metade cobre o fim de um trecho, metade o começo do outro
    const inicio = Math.max(0, p.t - d / 2)
    const depois = Math.max(0, total - inicio - d)
    partes.push(
      `[${i + 1}:v]transpose=1,scale=${L}:${A}:force_original_aspect_ratio=increase,` +
      `crop=${L}:${A},setsar=1,fps=30,` +
      `tpad=start_duration=${inicio.toFixed(3)}:start_mode=add:color=black:` +
      `stop_duration=${depois.toFixed(3)}:stop_mode=add:color=black,format=gbrp[b${i}]`)
    const saidaV = `mix${i}`
    partes.push(`[${base}][b${i}]blend=all_mode=screen:shortest=0[${saidaV}]`)
    base = saidaV
  })
  partes.push(`[${base}]format=yuv420p[vfim]`)

  await exec(FFMPEG, ['-y', '-i', video, ...pontos.flatMap(p => ['-i', p.burn]),
    '-filter_complex', partes.join(';'),
    '-map', '[vfim]', '-map', '0:a', '-c:a', 'copy',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', saida], { maxBuffer: 1 << 24 })
  return saida
}

/**
 * Emenda e queima os film burns numa passada só.
 *
 * Fazer as duas coisas separadas custa DUAS recodificações do vídeo inteiro —
 * medido, era mais da metade do tempo de cada anúncio. Aqui o concat e os blends
 * entram no mesmo filtro, e o encoder de hardware do Apple Silicon substitui o
 * libx264: 2,2x mais rápido no mesmo tamanho de arquivo.
 */
export async function montarPeca(partes, burns, saida, alvo, opcoes = {}) {
  const { bitrate = '6M', hardware = true } = opcoes
  const L = alvo?.largura || 1080, A = alvo?.altura || 1920

  const dur = []
  for (const p of partes) {
    const { stdout } = await exec(FFPROBE, [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p])
    dur.push(Number(stdout.trim()))
  }
  const cortes = dur.slice(0, -1).map((_, i) => dur.slice(0, i + 1).reduce((a, b) => a + b, 0))
  const total = dur.reduce((a, b) => a + b, 0)

  const f = []
  partes.forEach((_, i) => {
    f.push(`[${i}:v]scale=${L}:${A}:force_original_aspect_ratio=increase,crop=${L}:${A},` +
      `setsar=1,fps=30[v${i}]`)
    f.push(`[${i}:a]aresample=48000[a${i}]`)
  })
  f.push(`${partes.map((_, i) => `[v${i}][a${i}]`).join('')}` +
    `concat=n=${partes.length}:v=1:a=1[vc][ac]`)

  // blend em RGB: em YUV o preto tem croma em 128 e o screen tinge tudo de magenta
  let base = 'vc'
  if (burns.length) {
    f.push(`[${base}]format=gbrp[b0]`)
    base = 'b0'
    for (let i = 0; i < burns.length && i < cortes.length; i++) {
      const d = Number((await exec(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration',
        '-of', 'csv=p=0', burns[i]])).stdout.trim())
      const inicio = Math.max(0, cortes[i] - d / 2)
      const depois = Math.max(0, total - inicio - d)
      const k = partes.length + i
      f.push(`[${k}:v]transpose=1,scale=${L}:${A}:force_original_aspect_ratio=increase,` +
        `crop=${L}:${A},setsar=1,fps=30,tpad=start_duration=${inicio.toFixed(3)}:start_mode=add:` +
        `color=black:stop_duration=${depois.toFixed(3)}:stop_mode=add:color=black,format=gbrp[q${i}]`)
      f.push(`[${base}][q${i}]blend=all_mode=screen:shortest=0[m${i}]`)
      base = `m${i}`
    }
  }
  f.push(`[${base}]format=yuv420p[vf]`)

  const video = hardware
    ? ['-c:v', 'h264_videotoolbox', '-b:v', bitrate]
    : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20']

  await exec(FFMPEG, ['-y',
    ...partes.flatMap(p => ['-i', p]), ...burns.flatMap(b => ['-i', b]),
    '-filter_complex', f.join(';'),
    '-map', '[vf]', '-map', '[ac]', ...video, '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-movflags', '+faststart', saida], { maxBuffer: 1 << 24 })
  return { cortes, total }
}
