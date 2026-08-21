// Dispara o workflow do GitHub Actions que processa os brutos (capa + proxy + IA).
// Aceita ?pasta=<id ou link> e ?team=<id do time> (default 'jaylton'). Envs: GH_DISPATCH_TOKEN, GH_OWNER, GH_REPO.
export async function onRequest({ request, env }) {
  try {
    const token = env.GH_DISPATCH_TOKEN
    const owner = env.GH_OWNER
    const repo = env.GH_REPO
    if (!token || !owner || !repo) {
      return Response.json({ error: 'Processamento ainda não configurado (faltam as envs do GitHub).' }, { status: 500 })
    }
    const params = new URL(request.url).searchParams
    const pasta = (params.get('pasta') || '').trim()
    const team = (params.get('team') || 'jaylton').trim()
    const dispatch = (inputs) =>
      fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/processar.yml/dispatches`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'central-gravacao', // GitHub exige User-Agent (o Netlify punha sozinho)
        },
        body: JSON.stringify({ ref: 'main', inputs }),
      })

    // tenta com o input `team`; se o workflow no GitHub ainda não tiver esse input (YAML não pusheado), dá 422.
    let teamAplicado = true
    let r = await dispatch(pasta ? { team, pasta } : { team })
    if (r.status === 422) {
      // Pablo/André NÃO podem cair no fallback (seriam gravados como jaylton). Só o jaylton segue sem o input.
      if (team !== 'jaylton') {
        return Response.json({ error: `O workflow no GitHub ainda não conhece o time "${team}". Faça o git push do processar.yml + scripts antes de processar brutos do ${team}.` }, { status: 409 })
      }
      teamAplicado = false
      r = await dispatch(pasta ? { pasta } : {})
    }
    if (r.status === 204) return Response.json({ ok: true, pasta: pasta || null, team, teamAplicado })
    const t = await r.text()
    return Response.json({ error: t.slice(0, 200) || ('erro ' + r.status) }, { status: r.status })
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 500 })
  }
}
