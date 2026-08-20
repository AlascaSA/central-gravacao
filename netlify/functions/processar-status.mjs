// Status da última rodada do workflow processar.yml (pro Catálogo mostrar a barra de progresso).
// Devolve o estado (queued/in_progress/completed) e QUAL passo está rodando (capas/proxies/classificar).
// ?since=<ms do dispatch>: se a rodada mais nova for anterior ao dispatch, ainda é 'pending' (a nossa não apareceu).
export default async (req) => {
  try {
    const token = process.env.GH_DISPATCH_TOKEN
    const owner = process.env.GH_OWNER
    const repo = process.env.GH_REPO
    if (!token || !owner || !repo) return Response.json({ error: 'não configurado' }, { status: 500 })
    const since = Number(new URL(req.url).searchParams.get('since') || 0)
    const H = {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'central-gravacao',
    }
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/processar.yml/runs?per_page=1`, { headers: H })
    const d = await r.json()
    const run = d.workflow_runs && d.workflow_runs[0]
    if (!run) return Response.json({ status: 'pending' })
    // a rodada mais nova é anterior ao nosso dispatch (com 60s de folga p/ diferença de relógio) → a nossa ainda não foi criada
    if (since && Date.parse(run.created_at) < since - 60000) return Response.json({ status: 'pending' })

    let step = null, stepIndex = 0, totalSteps = 0
    if (run.status === 'in_progress' || run.status === 'queued') {
      try {
        const jr = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${run.id}/jobs`, { headers: H })
        const jd = await jr.json()
        const job = jd.jobs && jd.jobs[0]
        if (job && Array.isArray(job.steps)) {
          totalSteps = job.steps.length
          stepIndex = job.steps.filter((s) => s.status === 'completed').length
          const rodando = job.steps.find((s) => s.status === 'in_progress')
          step = rodando ? rodando.name : null
        }
      } catch {
        /* jobs pode não existir ainda no começo — segue sem o passo */
      }
    }
    return Response.json({ status: run.status, conclusion: run.conclusion, step, stepIndex, totalSteps, url: run.html_url })
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 500 })
  }
}
