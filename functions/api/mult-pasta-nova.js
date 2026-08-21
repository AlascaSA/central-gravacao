import { googleToken } from './_util.js'

// Cria a subpasta onde as variações são devolvidas, dentro da pasta de origem.
export async function onRequest({ request, env }) {
  const u = new URL(request.url)
  const dentroDe = u.searchParams.get('pasta')
  const nome = u.searchParams.get('nome') || 'Variações'
  if (!dentroDe) return Response.json({ error: 'falta pasta' }, { status: 400 })
  try {
    const token = await googleToken(env)
    // reaproveita a pasta se ela já existir, para não criar uma a cada rodada
    const q = `'${dentroDe}' in parents and name='${nome.replace(/'/g, "\\'")}' ` +
              `and mimeType='application/vnd.google-apps.folder' and trashed=false`
    const busca = new URL('https://www.googleapis.com/drive/v3/files')
    busca.searchParams.set('q', q)
    busca.searchParams.set('fields', 'files(id,name)')
    busca.searchParams.set('supportsAllDrives', 'true')
    busca.searchParams.set('includeItemsFromAllDrives', 'true')
    const achou = await (await fetch(busca, { headers: { Authorization: 'Bearer ' + token } })).json()
    if (achou.files?.length) return Response.json({ id: achou.files[0].id, nome, criada: false })

    const r = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nome, parents: [dentroDe], mimeType: 'application/vnd.google-apps.folder' }),
    })
    const d = await r.json()
    if (!r.ok) return Response.json({ error: d?.error?.message || 'não consegui criar a pasta' }, { status: 500 })
    return Response.json({ id: d.id, nome, criada: true })
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
