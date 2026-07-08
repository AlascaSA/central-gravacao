import { googleToken } from './_util.js'

// Renomeia o arquivo no Google Drive. Exige que a conta de serviço seja Editor da pasta.
export async function onRequest({ request, env }) {
  try {
    if (request.method !== 'POST') return Response.json({ error: 'método inválido' }, { status: 405 })
    let body = {}
    try { body = await request.json() } catch { body = {} }
    const id = body.id
    const nome = (body.nome || '').trim()
    if (!id || !nome) return Response.json({ error: 'faltou id ou nome' }, { status: 400 })
    const token = await googleToken(env)
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?supportsAllDrives=true&fields=id,name`,
      {
        method: 'PATCH',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nome }),
      },
    )
    const d = await r.json().catch(() => ({}))
    if (!r.ok) {
      const msg = r.status === 403
        ? 'A conta de serviço não tem permissão de edição no Drive (precisa ser Editor da pasta).'
        : (d.error && d.error.message) || 'erro ' + r.status
      return Response.json({ error: msg }, { status: r.status })
    }
    return Response.json({ ok: true, nome: d.name })
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 500 })
  }
}
