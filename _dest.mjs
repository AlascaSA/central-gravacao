import { token } from './scripts/lib/drive-montagem.mjs'
const t=await token()
const id='1BDJAueHaSJKQK1VZ67zAybFhWShqoPHx'
const r=await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,mimeType,driveId,capabilities(canAddChildren)&supportsAllDrives=true`,
  {headers:{Authorization:'Bearer '+t}})
const d=await r.json()
if(!r.ok){ console.log('  sem acesso:', d?.error?.message); process.exit(1) }
console.log('  pasta:', d.name)
console.log('  posso escrever:', d.capabilities?.canAddChildren ? 'sim' : 'NÃO')
const q=encodeURIComponent(`'${id}' in parents and trashed=false`)
const l=await (await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&pageSize=20&supportsAllDrives=true&includeItemsFromAllDrives=true`,
  {headers:{Authorization:'Bearer '+t}})).json()
console.log('  conteúdo hoje:', (l.files||[]).length, 'itens')
for(const f of (l.files||[]).slice(0,8)) console.log('   ', f.mimeType.includes('folder')?'[pasta]':'[arq]', f.name)
