// Manda montar as variações fora da máquina de quem pediu.
//
// O pedido é gravado na tabela `montagens` e o que viaja para o GitHub Actions é
// só o id — a lista de 150 combinações não caberia bem num input de workflow.
// Envs: GH_DISPATCH_TOKEN, GH_OWNER, GH_REPO (as mesmas que processam brutos).
import { SUPA_URL } from './_util.js'

export async function onRequest({ request, env }) {
  const configurado = !!(env.GH_DISPATCH_TOKEN && env.GH_OWNER && env.GH_REPO)
  if (request.method === 'GET') return Response.json({ pronto: configurado })
  if (request.method !== 'POST') return Response.json({ error: 'só GET ou POST' }, { status: 405 })
  if (!configurado) return Response.json({ error: 'faltam as envs do GitHub' }, { status: 503 })

  try {
    const pedido = await request.json()
    if (!pedido?.pasta || !pedido?.combinacoes?.length) {
      return Response.json({ error: 'falta pasta ou combinações' }, { status: 400 })
    }

    const SUPA = SUPA_URL(env)
    const KEY = env.VITE_SUPABASE_ANON_KEY
    const criar = await fetch(`${SUPA}/rest/v1/montagens`, {
      method: 'POST',
      headers: {
        apikey: KEY, Authorization: 'Bearer ' + KEY,
        'Content-Type': 'application/json', Prefer: 'return=representation',
      },
      body: JSON.stringify({
        pasta: pedido.pasta, codigo: pedido.codigo || null,
        total: pedido.combinacoes.length, estado: 'fila', pedido,
        pecas: pedido.combinacoes.map(c => ({ nome: c.nome, estado: 'espera' })),
      }),
    })
    const linha = await criar.json()
    const id = Array.isArray(linha) ? linha[0]?.id : null
    if (!criar.ok || !id) {
      return Response.json({ error: (linha?.message || 'não consegui abrir a montagem') }, { status: 500 })
    }

    const r = await fetch(
      `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/actions/workflows/montar.yml/dispatches`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + env.GH_DISPATCH_TOKEN,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'central-gravacao', // o GitHub exige User-Agent
        },
        body: JSON.stringify({ ref: 'main', inputs: { job: id } }),
      })
    if (r.status !== 204) {
      const t = await r.text()
      // a fila fica marcada como erro, senão a barra ficaria girando para sempre
      await fetch(`${SUPA}/rest/v1/montagens?id=eq.${id}`, {
        method: 'PATCH',
        headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'erro', erro: t.slice(0, 200) }),
      })
      return Response.json({ error: t.slice(0, 200) || ('erro ' + r.status) }, { status: r.status })
    }
    return Response.json({ id, total: pedido.combinacoes.length })
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
