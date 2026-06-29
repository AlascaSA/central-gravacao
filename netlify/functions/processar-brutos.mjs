// Dispara o workflow do GitHub Actions que processa os brutos novos (prévia leve + classificação).
// Envs: GH_DISPATCH_TOKEN, GH_OWNER, GH_REPO.
export default async () => {
  try {
    const token = process.env.GH_DISPATCH_TOKEN
    const owner = process.env.GH_OWNER
    const repo = process.env.GH_REPO
    if (!token || !owner || !repo) {
      return Response.json({ error: 'Processamento ainda não configurado (faltam as envs do GitHub).' }, { status: 500 })
    }
    const r = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/processar.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ ref: 'main' }),
      },
    )
    if (r.status === 204) return Response.json({ ok: true })
    const t = await r.text()
    return Response.json({ error: t.slice(0, 200) || ('erro ' + r.status) }, { status: r.status })
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 500 })
  }
}
