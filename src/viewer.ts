// Abre documentos do Office (.docx etc.) num visualizador online (não baixa).
// pdf/txt/imagem abrem direto no navegador.
export function viewerUrl(nome: string, url: string): string {
  const l = (nome || '').toLowerCase()
  if (l.endsWith('.docx') || l.endsWith('.doc') || l.endsWith('.pptx') || l.endsWith('.ppt') || l.endsWith('.xlsx')) {
    return 'https://view.officeapps.live.com/op/view.aspx?src=' + encodeURIComponent(url)
  }
  return url
}
