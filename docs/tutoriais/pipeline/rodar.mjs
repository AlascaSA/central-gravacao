// Grava um módulo inteiro: node rodar.mjs ./cenas-m0.mjs m0 [id-de-uma-cena]
import { gravarCena, montarModulo, prepararViewport, garantirJanela } from './grava.mjs'
import { kit } from './motor.mjs'

const arquivo = process.argv[2] || './cenas-m0.mjs'
const modulo = process.argv[3] || 'm0'
const so = process.argv[4]
const cenas = (await import(arquivo)).default

await garantirJanela()
const rect = await prepararViewport()
await kit()
console.log('viewport:', JSON.stringify(rect))

const alvo = so ? cenas.filter((c) => c.id === so) : cenas
for (const c of alvo) {
  console.log(`▶ ${c.id}`)
  await gravarCena(c, rect)
}

if (!so) {
  const saida = await montarModulo(modulo, cenas.map((c) => c.id))
  console.log('PRONTO:', saida)
}
