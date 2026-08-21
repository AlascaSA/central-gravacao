// Grava as cenas que precisam da aba "Em revisão" com conteúdo de verdade.
// Empresta UM vídeo (tira a marcação de revisado), grava as cenas pedidas, e devolve no finally —
// mesmo se a gravação falhar. Autorizado pelo Gustavo em 17/08.
//   node cena-em-revisao.mjs m4-01 m4-02
import { readFileSync } from 'node:fs'
import { gravarCena, prepararViewport, garantirJanela } from './grava.mjs'
import { kit } from './motor.mjs'

const ID = '1kwUF4z1aBRPAZIcdrn6ZcCs2Ii6HQCNw' // "Dívidas do espólio no ITCMD" (revisado, não postado)
const quais = process.argv.slice(2)
if (!quais.length) { console.error('diga quais cenas: node cena-em-revisao.mjs m4-01 m4-02'); process.exit(1) }

const env = {}
for (const linha of readFileSync('/Users/gcosta/Documents/claude/central-gravacao/.env.local', 'utf8').split('\n')) {
  const i = linha.indexOf('=')
  if (i > 0 && !linha.trim().startsWith('#')) env[linha.slice(0, i).trim()] = linha.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}

async function marcarRevisado(valor) {
  const r = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/editados?drive_id=eq.${ID}`, {
    method: 'PATCH',
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ revisado: valor }),
  })
  const d = await r.json()
  if (!r.ok) throw new Error('falhou: ' + JSON.stringify(d))
  return d.map((x) => `${x.nome_ia}: revisado=${x.revisado}`).join(', ')
}

// pega as cenas em qualquer módulo (o "Em revisão" aparece no M3 e no M4)
const todas = []
for (const mod of ['m3', 'm4']) todas.push(...(await import(`./cenas-${mod}.mjs`)).default)
const cenas = quais.map((id) => todas.find((c) => c.id === id)).filter(Boolean)
if (cenas.length !== quais.length) { console.error('cena não encontrada:', quais.filter((q) => !todas.some((c) => c.id === q))); process.exit(1) }
console.log('1/3 emprestando o vídeo:', await marcarRevisado(false))
try {
  await garantirJanela()
  const rect = await prepararViewport()
  await kit()
  for (const c of cenas) {
    console.log('2/3 gravando', c.id)
    await gravarCena(c, rect)
  }
} finally {
  console.log('3/3 devolvendo:', await marcarRevisado(true))
}
