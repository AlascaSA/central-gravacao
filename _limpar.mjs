import { token } from './scripts/lib/drive-montagem.mjs'
const t=await token(), DEST='1BDJAueHaSJKQK1VZ67zAybFhWShqoPHx'
const q=encodeURIComponent(`'${DEST}' in parents and trashed=false`)
let pag, ids=[]
do{
  const u=new URL('https://www.googleapis.com/drive/v3/files')
  u.searchParams.set('q',`'${DEST}' in parents and trashed=false`)
  u.searchParams.set('fields','nextPageToken,files(id,name)'); u.searchParams.set('pageSize','1000')
  u.searchParams.set('supportsAllDrives','true'); u.searchParams.set('includeItemsFromAllDrives','true')
  if(pag)u.searchParams.set('pageToken',pag)
  const d=await (await fetch(u,{headers:{Authorization:'Bearer '+t}})).json()
  ;(d.files||[]).forEach(f=>ids.push(f)); pag=d.nextPageToken
}while(pag)
console.log(`  ${ids.length} itens na Leva 2 → mandando para a lixeira (reversível)`)
for(const f of ids){
  const r=await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?supportsAllDrives=true`,
    {method:'PATCH',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({trashed:true})})
  if(!r.ok) console.log('   falhou:',f.name)
}
// as duas subpastas
async function pasta(nome){
  const r=await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true',{method:'POST',
    headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},
    body:JSON.stringify({name:nome,parents:[DEST],mimeType:'application/vnd.google-apps.folder'})})
  const d=await r.json(); console.log(`  criada: ${nome} (${d.id})`); return d.id
}
const cg=await pasta('Com gancho'), sg=await pasta('Sem gancho')
console.log(`COMGANCHO=${cg}`); console.log(`SEMGANCHO=${sg}`)
