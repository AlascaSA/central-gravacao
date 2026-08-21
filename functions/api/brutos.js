import { SUPA_URL } from './_util.js'

// Lista os brutos DO BANCO (tabela `brutos`). Instantâneo — não varre o Drive ao vivo.
export async function onRequest({ request, env }) {
  try {
    const SUPA = SUPA_URL(env)
    const KEY = env.VITE_SUPABASE_ANON_KEY
    const team = new URL(request.url).searchParams.get('team') || 'jaylton'
    const url = `${SUPA}/rest/v1/brutos?select=drive_id,nome,mes,dia,capa_url,mb,duracao,criado,proxy_id&team=eq.${encodeURIComponent(team)}&order=criado.desc.nullslast`
    const r = await fetch(url, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })
    const rows = await r.json()
    if (!Array.isArray(rows)) return Response.json({ error: (rows && rows.message) || 'erro' }, { status: 500 })
    const videos = rows.map((b) => ({
      id: b.drive_id,
      nome: b.nome,
      mb: b.mb ?? null,
      seg: b.duracao ?? null,
      thumb: b.capa_url ?? null,
      criado: b.criado ?? null,
      mes: b.mes ?? null,
      dia: b.dia ?? null,
      temProxy: !!b.proxy_id,
    }))
    return Response.json({ videos })
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 500 })
  }
}
