// Lista, na ordem, tudo que cada cena de um módulo acende — pra pegar destaque repetido antes de entregar.
import { destaques, limparDestaques, helpers } from './grava.mjs'
const arquivo = process.argv[2]
const cenas = (await import(arquivo)).default
const falso = new Proxy({}, { get: () => async () => 'ok' })
for (const c of cenas) {
  limparDestaques()
  const h = { ...helpers, js: async () => '', sleep: async () => {}, kit: async () => {}, ativar: async () => {},
    clicar: async () => 'ok', clicarPai: async () => 'ok', ir: async () => 'ok', abrir: async () => {},
    irAte: async () => 'ok', rolarH: async () => 'ok', rolarV: async () => 'ok', rolarPerto: async () => 'ok',
    apagar: async () => 'ok', legenda: async () => 'ok',
    destacar: async (sel, txt) => { destaques.push(txt || sel); return 'ok' },
    destacarPai: async (sel, txt) => { destaques.push(txt || sel); return 'ok' } }
  for (const a of c.acoes || []) await a(h)
  console.log(c.id.padEnd(8), '→', destaques.join('  ·  ') || '(nenhum)')
}
