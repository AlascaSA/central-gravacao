import { driveToken } from './_google.js'

// Renomeia o arquivo no Google Drive. Exige que a conta de serviço seja Editor da pasta.
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'método inválido' })
      return
    }
    let body = req.body
    if (!body || typeof body === 'string') {
      try { body = JSON.parse(body || '{}') } catch { body = {} }
    }
    const id = body.id
    const nome = (body.nome || '').trim()
    if (!id || !nome) {
      res.status(400).json({ error: 'faltou id ou nome' })
      return
    }
    const token = await driveToken()
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
      res.status(r.status).json({ error: msg })
      return
    }
    res.status(200).json({ ok: true, nome: d.name })
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) })
  }
}
