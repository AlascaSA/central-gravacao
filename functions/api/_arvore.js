// TEMPORÁRIO: árvore que a conta de serviço enxerga. ?id=<pasta>&prof=<niveis>. Apagar depois.
import { googleToken } from './_util.js'
export async function onRequest({ request, env }) {
  const p = new URL(request.url).searchParams
  const raiz = p.get('id'); const prof = Math.min(Number(p.get('prof') || 3), 5)
  if (!raiz) return new Response('falta id', { status: 400 })
  const token = await googleToken(env)
  const linhas = []
  async function filhos(id) {
    const q = encodeURIComponent(`'${id}' in parents and trashed=false`)
    const u = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true&orderBy=folder,name`
    const d = await (await fetch(u, { headers: { Authorization: 'Bearer ' + token } })).json()
    if (d.error) throw new Error(d.error.message)
    return d.files || []
  }
  async function anda(id, nivel, pref) {
    if (nivel > prof) return
    const fs = await filhos(id)
    const dirs = fs.filter((f) => f.mimeType === 'application/vnd.google-apps.folder')
    const vids = fs.filter((f) => (f.mimeType || '').includes('video'))
    if (nivel === prof && (vids.length || dirs.length)) { linhas.push(`${pref}  … ${dirs.length} pasta(s), ${vids.length} vídeo(s)`); return }
    for (const d of dirs) { linhas.push(`${pref}[pasta] ${d.name}   (${d.id})`); await anda(d.id, nivel + 1, pref + '   ') }
    if (vids.length) linhas.push(`${pref}${vids.length} vídeo(s): ` + vids.slice(0, 5).map((v) => v.name).join(' | ') + (vids.length > 5 ? ' …' : ''))
  }
  try {
    const meta = await (await fetch(`https://www.googleapis.com/drive/v3/files/${raiz}?fields=id,name,driveId&supportsAllDrives=true`, { headers: { Authorization: 'Bearer ' + token } })).json()
    if (meta.error) { linhas.push(`SEM ACESSO: ${meta.error.code} ${meta.error.message}`); return new Response(linhas.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }) }
    linhas.push(`RAIZ: ${meta.name}  (${raiz})  driveId=${meta.driveId || 'MEU DRIVE pessoal (fora do Shared Drive)'}`)
    await anda(raiz, 1, '')
  } catch (e) { linhas.push('ERRO: ' + ((e && e.message) || e)) }
  return new Response(linhas.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
