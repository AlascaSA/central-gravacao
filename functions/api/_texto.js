import { unzipSync, strFromU8 } from 'fflate'

// Texto de um documento de roteiro (.docx, .pdf ou texto puro). Usado pelo Subir roteiros e pelo
// Casar roteiro.
// .docx = zip de XML. Descompacta com fflate (nativo de Workers) e pega o texto dos <w:t>,
// um parágrafo (<w:p>) por linha. Substitui o mammoth (lib Node que não roda bem no motor de Workers).
function docxParaTexto(buf) {
  const arquivos = unzipSync(new Uint8Array(buf))
  const xmlBytes = arquivos['word/document.xml']
  if (!xmlBytes) return ''
  const xml = strFromU8(xmlBytes)
  const paras = xml.split(/<\/w:p>/).map((p) =>
    [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join(''),
  )
  return paras.join('\n')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n').trim()
}

export async function extrairTexto(buf, nome) {
  const lower = (nome || '').toLowerCase()
  if (lower.endsWith('.docx')) {
    try { return docxParaTexto(buf) } catch { return '' }
  }
  if (lower.endsWith('.pdf')) {
    try {
      // unpdf = pdfjs empacotado pra edge/serverless
      const { extractText, getDocumentProxy } = await import('unpdf')
      const pdf = await getDocumentProxy(new Uint8Array(buf))
      const { text } = await extractText(pdf, { mergePages: true })
      return text || ''
    } catch { return '' }
  }
  return new TextDecoder('utf-8').decode(buf)
}

