// Monta as variações de anúncio pedidas pela aba Multiplicar da Central.
// Roda no GitHub Actions: o pedido já está gravado na tabela `montagens` e aqui
// só chega o id. O vídeo sai do Drive e volta pro Drive — a máquina de quem
// pediu não entra no caminho, e a aba pode ser fechada.
// Uso: SUPA_SECRET=... GOOGLE_SERVICE_ACCOUNT_KEY=... node scripts/montar-variacoes.mjs --job <id>
import { rodarMontagem } from './lib/montagem.mjs'

const SUPA = 'https://kkvuioyferqbilfwdkqa.supabase.co'
const SECRET = process.env.SUPA_SECRET
const job = process.argv[process.argv.indexOf('--job') + 1]

if (!SECRET) { console.error('faltou SUPA_SECRET'); process.exit(1) }
if (!job || job.startsWith('--')) { console.error('uso: --job <id>'); process.exit(1) }

const sb = (p, opts = {}) => fetch(`${SUPA}/rest/v1/${p}`, {
  ...opts,
  headers: {
    apikey: SECRET, Authorization: 'Bearer ' + SECRET,
    'Content-Type': 'application/json', ...(opts.headers || {}),
  },
})
const gravar = (d) => sb(`montagens?id=eq.${job}`, { method: 'PATCH', body: JSON.stringify(d) })

const linha = await (await sb(`montagens?id=eq.${job}&select=*`)).json()
const m = Array.isArray(linha) ? linha[0] : null
if (!m) { console.error('job não encontrado:', job); process.exit(1) }
if (!m.pedido?.combinacoes?.length) { console.error('job sem combinações'); process.exit(1) }

console.log(`job ${job}: ${m.pedido.combinacoes.length} variações da pasta ${m.pedido.pasta}`)
await gravar({ estado: 'montando' })

// o Supabase leva um PATCH por peça; com 150 peças isso é ruído, então segura
// as atualizações em janelas de 1,5s — o fim sempre grava.
let ultimo = 0
async function progresso(ev, forcar = false) {
  const agora = Date.now()
  if (!forcar && agora - ultimo < 1500) return
  ultimo = agora
  await gravar({
    feitas: ev.feitas, enviadas: ev.enviadas, falhas: ev.falhas,
    pecas: ev.estado, ...(ev.destino ? { pasta_saida: ev.destino } : {}),
  })
}

try {
  const r = await rodarMontagem(m.pedido, (ev) => {
    if (ev.tipo === 'saida') { console.log('saída:', ev.destino); gravar({ pasta_saida: ev.destino }) }
    if (ev.tipo === 'fonte') console.log('baixei', ev.nome)
    if (ev.tipo === 'perfil') console.log(ev.podeCopiar ? 'peças casam: emenda por cópia' : 'peças diferentes: vai recodificar')
    if (ev.tipo === 'peca') progresso(ev)
    if (ev.tipo === 'fim') progresso(ev, true)
  })
  await gravar({
    estado: r.falhas === m.pedido.combinacoes.length ? 'erro' : 'pronta',
    feitas: r.feitas, enviadas: r.enviadas, falhas: r.falhas,
    pecas: r.estado, pasta_saida: r.destino, fim_em: new Date().toISOString(),
  })
  console.log(`fim: ${r.enviadas} no Drive, ${r.falhas} com erro`)
  if (r.falhas === m.pedido.combinacoes.length) process.exit(1)
} catch (e) {
  console.error('rodada falhou:', e)
  await gravar({ estado: 'erro', erro: String(e.message || e).slice(0, 300), fim_em: new Date().toISOString() })
  process.exit(1)
}
