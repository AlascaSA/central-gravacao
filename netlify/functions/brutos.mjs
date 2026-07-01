// Lista os brutos DO BANCO (tabela `brutos`, preenchida pelo processamento). Instantâneo.
// Nada de varrer o Drive ao vivo — isso agora é o passo "Processar novos".
const SUPA = process.env.VITE_SUPABASE_URL || 'https://kkvuioyferqbilfwdkqa.supabase.co'
const KEY = process.env.VITE_SUPABASE_ANON_KEY

export default async () => {
  try {
    const url =
      `${SUPA}/rest/v1/brutos?select=drive_id,nome,mes,dia,capa_url,mb,duracao,criado,proxy_id&order=criado.desc.nullslast`
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
