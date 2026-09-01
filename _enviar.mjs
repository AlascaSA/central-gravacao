// Sobe os anúncios para o Drive. Três conexões: foi o teto medido da banda
// (48 Mbps com uma, 74 com três, 71 com seis — a partir daí não rende mais).
import { token, subir } from './scripts/lib/drive-montagem.mjs'
import fs from 'node:fs'; import path from 'node:path'
const B='/Volumes/HD 01/Alasca Arquivos/Alasca/Vídeos/Jaylton/Vídeos/21:08 - Ganchos - CTAS - CORPO'
// cada pasta local vai para a sua no Drive, dentro da Leva 2
const DESTINOS=[
  { local: `${B}/Lote 01 - teste`, drive: '1yznOQXVZb3_UtXd7wsCvm-9ZzhIh229V', nome: 'Com gancho' },
  { local: `${B}/Sem gancho`,      drive: '1tmdQfyrF44VjPIW1ZMm_mi7uaNnbpYZo', nome: 'Sem gancho' },
]

const t=await token()
async function jaNoDrive(id){
  const nomes=new Set(); let pag
  do{
    const u=new URL('https://www.googleapis.com/drive/v3/files')
    u.searchParams.set('q',`'${id}' in parents and trashed=false`)
    u.searchParams.set('fields','nextPageToken,files(name)'); u.searchParams.set('pageSize','1000')
    u.searchParams.set('supportsAllDrives','true'); u.searchParams.set('includeItemsFromAllDrives','true')
    if(pag)u.searchParams.set('pageToken',pag)
    const d=await (await fetch(u,{headers:{Authorization:'Bearer '+t}})).json()
    ;(d.files||[]).forEach(f=>nomes.add(f.name)); pag=d.nextPageToken
  }while(pag)
  return nomes
}
const fila=[]
for (const D of DESTINOS) {
  if (!fs.existsSync(D.local)) continue
  const tem=await jaNoDrive(D.drive)
  const novos=fs.readdirSync(D.local).filter(x=>x.endsWith('.mp4')).sort().filter(f=>!tem.has(f))
  novos.forEach(f=>fila.push({ arq: path.join(D.local,f), drive: D.drive }))
  console.log(`  ${D.nome}: ${tem.size} lá, ${novos.length} para subir`)
}
const totalMb=fila.reduce((s,x)=>s+fs.statSync(x.arq).size/1e6,0)
console.log(`  total: ${fila.length} arquivos · ${(totalMb/1000).toFixed(1)} GB`)

let i=0, enviados=0, mbFeitos=0, erros=0
const t0=Date.now()
async function trabalhador(){
  for(;;){
    const k=i++; if(k>=fila.length) return
    const { arq: f, drive } = fila[k]
    const nome=path.basename(f), mb=fs.statSync(f).size/1e6
    let tentativa=0
    for(;;){
      try{ await subir(f, drive, nome); break }
      catch(e){
        if(++tentativa>=4){ erros++; console.error(`  ERRO ${nome}: ${String(e.message).slice(0,80)}`); break }
        await new Promise(r=>setTimeout(r, 4000*tentativa))
      }
    }
    enviados++; mbFeitos+=mb
    if(enviados%10===0 || enviados===fila.length){
      const s=(Date.now()-t0)/1000, taxa=mbFeitos/s
      const falta=(totalMb-mbFeitos)/taxa
      console.log(`  ${String(enviados).padStart(3)}/${fila.length} · ${taxa.toFixed(1)} MB/s · faltam ~${(falta/60).toFixed(0)} min`)
    }
  }
}
await Promise.all(Array.from({length:3}, trabalhador))
console.log(`\n  ${enviados} enviados · ${erros} com erro · ${((Date.now()-t0)/60000).toFixed(0)} min`)
