import { googleToken } from './_util.js'

// Abre uma sessão de upload no Drive e devolve a URL para o NAVEGADOR enviar o
// arquivo direto. O vídeo não passa por aqui de propósito: a função tem teto de
// corpo de alguns MB, e a peça montada tem dezenas.
export async function onRequest({ request, env }) {
  const u = new URL(request.url)
  const pasta = u.searchParams.get('pasta')
  const nome = u.searchParams.get('nome')
  if (!pasta || !nome) return Response.json({ error: 'falta pasta ou nome' }, { status: 400 })
  try {
    const token = await googleToken(env)
    const r = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': 'video/mp4',
        },
        body: JSON.stringify({ name: nome, parents: [pasta], mimeType: 'video/mp4' }),
      })
    const sessao = r.headers.get('location')
    if (!r.ok || !sessao) {
      const d = await r.text()
      return Response.json({ error: d.slice(0, 200) || 'Drive recusou a sessão' }, { status: 500 })
    }
    return Response.json({ sessao })
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
