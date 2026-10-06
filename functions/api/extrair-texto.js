import { extrairTexto } from './_texto.js'

// Recebe o arquivo do roteiro (corpo do POST) e devolve o texto — o Casar roteiro só lia .txt e os
// roteiros da equipe chegam em .docx e .pdf.
export async function onRequest({ request }) {
  if (request.method !== 'POST') return Response.json({ error: 'método inválido' }, { status: 405 })
  const nome = new URL(request.url).searchParams.get('nome') || ''
  const buf = await request.arrayBuffer()
  if (!buf.byteLength) return Response.json({ error: 'arquivo vazio' }, { status: 400 })
  if (buf.byteLength > 15 * 1024 * 1024) return Response.json({ error: 'arquivo grande demais (máx. 15 MB)' }, { status: 413 })
  const texto = (await extrairTexto(buf, nome)).trim()
  if (!texto) return Response.json({ error: 'não consegui ler texto desse arquivo' }, { status: 422 })
  return Response.json({ texto })
}
