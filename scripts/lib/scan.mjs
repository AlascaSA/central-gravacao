// Varredura recursiva das pastas de brutos no Drive, com o contexto de PASTA (mês/dia).
// Compartilhado entre os scripts de processamento. Recebe um token de acesso do Drive (string).

export const BRUTOS_ROOTS = [
  '1teUk4IYAMH3Fd99LvS1NvTyY2FPbeMq-', // "Brutos" (Reel geral, YouTube, Teste, STORYTELLING…)
  '1Fkdt2hYQQ6K8DJyvDy1tliCpYDhS1Qil', // "Brutos" antiga (vídeos soltos)
]
// "Downloads temporários" guarda CÓPIAS feitas pelo botão de baixar em lote — se a varredura entrasse
// nela, os mesmos vídeos voltariam ao catálogo como brutos novos, duplicados.
export const IGNORAR_PASTAS = /editando|editado|__proxies__|downloads tempor/i
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
// abreviações de 3 letras (pasta "JUL", "JAN"…). Só usadas se o nome por extenso não bater.
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const FIELDS =
  'nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,hasThumbnail,thumbnailLink,videoMediaMetadata(durationMillis))'

async function filhos(token, fid) {
  const itens = []
  let page = null
  do {
    const q = `'${fid}' in parents and trashed=false`
    const url =
      'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) +
      '&fields=' + encodeURIComponent(FIELDS) +
      '&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true' +
      (page ? '&pageToken=' + page : '')
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } })
    const d = await r.json()
    if (d.error) throw new Error(d.error.message)
    itens.push(...(d.files || []))
    page = d.nextPageToken
  } while (page)
  return itens
}

/**
 * Lista todos os vídeos (recursivo) das raízes de brutos, ignorando "Editando".
 * @param {string} token  token de acesso do Drive
 * @param {string[]} [raizes]  raízes a varrer (padrão: BRUTOS_ROOTS)
 * @returns {Promise<Array<{id,name,size,createdTime,seg,mes,dia,pastaId}>>}
 */
export async function listarVideos(token, raizes = BRUTOS_ROOTS) {
  const videos = new Map() // id -> obj (dedupe)
  const visitadas = new Set()
  let nivel = raizes.map((id) => ({ id, mes: null, dia: null }))
  while (nivel.length) {
    const listas = await Promise.all(
      nivel.map((n) => filhos(token, n.id).then((fs) => ({ ctx: n, fs })).catch(() => ({ ctx: n, fs: [] }))),
    )
    const proximo = []
    for (const { ctx, fs } of listas) {
      for (const f of fs) {
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          if (visitadas.has(f.id) || IGNORAR_PASTAS.test(f.name || '')) continue
          visitadas.add(f.id)
          const nome = (f.name || '').trim()
          let mes = ctx.mes
          let dia = ctx.dia
          let iMes = MESES.findIndex((m) => new RegExp('^' + m + '\\b', 'i').test(nome))
          if (iMes < 0) iMes = MESES_ABREV.findIndex((a) => new RegExp('^' + a + '\\b', 'i').test(nome)) // "JUL" → Julho
          if (iMes >= 0) mes = MESES[iMes]
          else if (/^\d{1,2}$/.test(nome) || /^dia\s*\d/i.test(nome)) dia = nome.replace(/^dia\s*/i, '').padStart(2, '0')
          proximo.push({ id: f.id, mes, dia })
        } else if ((f.mimeType || '').includes('video')) {
          const criado = f.createdTime || f.modifiedTime || null
          const ano = criado ? new Date(criado).getFullYear() : new Date().getFullYear()
          videos.set(f.id, {
            id: f.id,
            name: f.name,
            size: f.size ? Number(f.size) : null,
            createdTime: criado,
            seg: f.videoMediaMetadata && f.videoMediaMetadata.durationMillis
              ? Math.round(Number(f.videoMediaMetadata.durationMillis) / 1000)
              : null,
            mes: ctx.mes ? `${ctx.mes} ${ano}` : null,
            dia: ctx.dia || null,
            pastaId: ctx.id,
          })
        }
      }
    }
    nivel = proximo
  }
  return [...videos.values()]
}
