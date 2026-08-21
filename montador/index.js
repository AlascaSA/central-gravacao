/**
 * Montador de variações — o mesmo trabalho da aba Multiplicar, só que fora da
 * máquina de quem pediu. Recebe a lista de combinações, baixa as peças-fonte do
 * Drive uma única vez, emenda cada variação e devolve na subpasta de saída.
 *
 * O progresso vai pro Supabase a cada peça: é dali que a Central desenha a
 * barra, e é por isso que dá pra fechar o navegador no meio.
 */
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { listarVideos } from '../scripts/lib/drive-montagem.mjs'
import { rodarMontagem } from '../scripts/lib/montagem.mjs'

const PORTA = Number(process.env.PORT || 8080)
const CHAVE = process.env.CHAVE || ''
const SUPA = process.env.SUPABASE_URL || 'https://kkvuioyferqbilfwdkqa.supabase.co'
const SUPA_KEY = process.env.SUPABASE_ANON_KEY || ''
const AO_MESMO_TEMPO = Number(process.env.PARALELO || 2)

/* ---------- progresso ---------- */

async function supa(caminho, metodo, corpo) {
  if (!SUPA_KEY) return null
  const r = await fetch(`${SUPA}/rest/v1/${caminho}`, {
    method: metodo,
    headers: {
      apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const t = await r.text()
  if (!r.ok) { console.error('supabase', r.status, t.slice(0, 200)); return null }
  try { return JSON.parse(t) } catch { return null }
}

const criarJob = (d) => supa('montagens', 'POST', d)
const atualizar = (id, d) => supa(`montagens?id=eq.${id}`, 'PATCH', d)

/* ---------- a rodada ---------- */

async function rodar(job, pedido) {
  let ultimo = 0
  const publicar = async (ev, forcar) => {
    const agora = Date.now()
    if (!forcar && agora - ultimo < 1500) return
    ultimo = agora
    await atualizar(job, {
      feitas: ev.feitas, enviadas: ev.enviadas, falhas: ev.falhas,
      pecas: ev.estado, ...(ev.destino ? { pasta_saida: ev.destino } : {}),
    })
  }
  try {
    const r = await rodarMontagem(pedido, (ev) => {
      if (ev.tipo === 'saida') { console.log('saída:', ev.destino); atualizar(job, { pasta_saida: ev.destino, estado: 'montando' }) }
      if (ev.tipo === 'fonte') console.log('baixei', ev.nome)
      if (ev.tipo === 'perfil') console.log(ev.podeCopiar ? 'peças casam: emenda por cópia' : 'peças diferentes: vai recodificar')
      if (ev.tipo === 'peca') publicar(ev)
      if (ev.tipo === 'fim') publicar(ev, true)
    })
    await atualizar(job, {
      estado: r.falhas === pedido.combinacoes.length ? 'erro' : 'pronta',
      feitas: r.feitas, enviadas: r.enviadas, falhas: r.falhas,
      pecas: r.estado, pasta_saida: r.destino, fim_em: new Date().toISOString(),
    })
    console.log(`fim: ${r.enviadas} no Drive, ${r.falhas} com erro`)
  } catch (e) {
    console.error('rodada', e)
    await atualizar(job, { estado: 'erro', erro: String(e.message || e).slice(0, 300), fim_em: new Date().toISOString() })
  }
}

/* ---------- porta de entrada ---------- */

const json = (res, code, d) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(d))
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')

  if (url.pathname === '/saude') return json(res, 200, { ok: true })

  if (url.pathname === '/listar' && req.method === 'GET') {
    if (CHAVE && req.headers['x-chave'] !== CHAVE) return json(res, 401, { error: 'chave inválida' })
    try {
      return json(res, 200, { videos: await listarVideos(url.searchParams.get('pasta')) })
    } catch (e) { return json(res, 500, { error: String(e.message || e) }) }
  }

  if (url.pathname === '/montar' && req.method === 'POST') {
    if (CHAVE && req.headers['x-chave'] !== CHAVE) return json(res, 401, { error: 'chave inválida' })
    let corpo = ''
    for await (const p of req) corpo += p
    let pedido
    try { pedido = JSON.parse(corpo) } catch { return json(res, 400, { error: 'json inválido' }) }
    if (!pedido.pasta || !pedido.combinacoes?.length) return json(res, 400, { error: 'falta pasta ou combinações' })

    const linha = await criarJob({
      pasta: pedido.pasta, codigo: pedido.codigo || null,
      total: pedido.combinacoes.length, estado: 'fila',
      pecas: pedido.combinacoes.map(c => ({ nome: c.nome, estado: 'espera' })),
    })
    const id = linha?.[0]?.id || randomUUID()
    // responde na hora: quem pediu não fica preso esperando a fila inteira
    json(res, 202, { id, total: pedido.combinacoes.length })
    rodar(id, pedido).catch(e => console.error('rodada solta', e))
    return
  }

  json(res, 404, { error: 'não encontrado' })
})

servidor.listen(PORTA, () => console.log('montador ouvindo na porta ' + PORTA))
