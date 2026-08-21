// Ensaio: roda as cenas SEM gravar, em ritmo acelerado, e mostra qual seletor não achou nada.
import { helpers, prepararViewport, garantirJanela } from './grava.mjs'
import { kit, ativar } from './motor.mjs'

const arquivo = process.argv[2] || './cenas-m0.mjs'
const so = process.argv[3] // id de cena específica
const cenas = (await import(arquivo)).default
const FATOR = 0.3

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdirSync } from 'node:fs'
const exec = promisify(execFile)
const TIRAR = process.env.FOTOS === '1'
mkdirSync('./ensaio', { recursive: true })
let n = 0
let rectG = null
let cenaAtual = ''

const h = { ...helpers, kit }
for (const nome of ['clicar', 'mover', 'destacar', 'legenda', 'apagar', 'rolarH', 'rolarV', 'ir']) {
  const orig = helpers[nome]
  h[nome] = async (...a) => {
    const r = await orig(...a)
    const alvo = [a[0], a[1]].filter(Boolean).join(' / ')
    if (String(r).trim() === 'nao') console.log(`   ✗ ${nome}(${alvo})`)
    else if (['clicar', 'ir'].includes(nome)) console.log(`   · ${nome}(${alvo}) ok`)
    if (TIRAR && ['destacar', 'legenda', 'clicar'].includes(nome) && rectG) {
      await new Promise((res) => setTimeout(res, 950))
      const f = `./ensaio/${cenaAtual}-${String(++n).padStart(2, '0')}-${nome}.png`
      await exec('screencapture', ['-x', '-R', `${rectG.x},${rectG.y},${rectG.w},${rectG.h}`, f])
    }
    return r
  }
}
h.sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(120, ms * FATOR)))

await garantirJanela()
const rect = await prepararViewport()
rectG = rect
console.log('viewport:', JSON.stringify(rect))
await kit()

for (const c of cenas) {
  if (so && c.id !== so) continue
  cenaAtual = c.id
  await ativar()
  console.log(`\n▶ ${c.id} — ${c.fala.slice(0, 60)}…`)
  const t = Date.now()
  if (c.pre) await c.pre(h)
  if (c.run) await c.run(h)
  console.log(`   ações levaram ${((Date.now() - t) / 1000).toFixed(1)}s (acelerado ${FATOR}x → real ~${((Date.now() - t) / 1000 / FATOR).toFixed(0)}s)`)
}
