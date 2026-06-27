// Dispara o workflow do GitHub Actions que processa os brutos novos (proxy + classificação).
// Precisa das envs no Vercel: GH_DISPATCH_TOKEN, GH_OWNER, GH_REPO.
export default async function handler(req, res) {
  try {
    const token = process.env.GH_DISPATCH_TOKEN
    const owner = process.env.GH_OWNER
    const repo = process.env.GH_REPO
    if (!token || !owner || !repo) {
      res.status(500).json({ error: 'Processamento ainda não configurado (faltam as envs do GitHub).' })
      return
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
    if (r.status === 204) {
      res.status(200).json({ ok: true })
      return
    }
    const t = await r.text()
    res.status(r.status).json({ error: t.slice(0, 200) || ('erro ' + r.status) })
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) })
  }
}
