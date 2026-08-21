// Revisão obrigatória antes de entregar: contact sheet cronológico do módulo montado.
// 1 frame a cada 2s, numerado pelo segundo — dá pra ver repetição de destaque e tela errada.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdirSync, rmSync, readdirSync } from 'node:fs'
const exec = promisify(execFile)
const mod = process.argv[2] || 'm3'
const passo = Number(process.argv[3] || 2)

rmSync('./rev', { recursive: true, force: true })
mkdirSync('./rev', { recursive: true })
// esse ffmpeg não tem drawtext; o número do frame já dá a ordem (cada um = passo segundos)
await exec('ffmpeg', ['-v', 'error', '-i', `./saida/${mod}.mp4`, '-vf', `fps=1/${passo},scale=360:-1`, './rev/%03d.png', '-y'])
const fotos = readdirSync('./rev').filter((f) => f.endsWith('.png')).sort()
const linhas = Math.ceil(fotos.length / 6)
await exec('/opt/ImageMagick/bin/montage', [...fotos.map((f) => './rev/' + f), '-tile', `6x${linhas}`, '-geometry', '360x203+2+2', '-background', '#000', `./rev-${mod}.png`])
console.log(`revisão: ${fotos.length} frames (a cada ${passo}s) → rev-${mod}.png`)
