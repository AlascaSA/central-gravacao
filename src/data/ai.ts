export interface VideoExtraido {
  titulo: string
  campanha: string
  roteiro: string
}

/** Manda um documento (já no Storage) pra função serverless processar com a IA. */
export async function processarDoc(doc: { url: string; nome: string; copy: string }): Promise<VideoExtraido[]> {
  const resp = await fetch('/api/processar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
  })
  if (!resp.ok) {
    const t = await resp.json().catch(() => ({}))
    throw new Error(t.error || 'Erro ' + resp.status)
  }
  const data = await resp.json()
  return Array.isArray(data.videos) ? (data.videos as VideoExtraido[]) : []
}
