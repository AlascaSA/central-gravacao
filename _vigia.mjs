// Olha as pastas locais e o Drive de fora e reescreve o painel. Independente
// dos scripts de montagem e upload: se um deles cair, o painel mostra isso.
import { token } from './scripts/lib/drive-montagem.mjs'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import { execFile } from 'node:child_process'; import { promisify } from 'node:util'
const exec=promisify(execFile)
const B='/Volumes/HD 01/Alasca Arquivos/Alasca/Vídeos/Jaylton/Vídeos/21:08 - Ganchos - CTAS - CORPO'
const LOCAIS=[
  {nome:'Com gancho', local:`${B}/Lote 01 - teste`, drive:'1yznOQXVZb3_UtXd7wsCvm-9ZzhIh229V', meta:323},
  {nome:'Sem gancho', local:`${B}/Sem gancho`,      drive:'1tmdQfyrF44VjPIW1ZMm_mi7uaNnbpYZo', meta:42},
]
const PAINEL=path.join(os.homedir(),'Downloads','PDS-producao.html')

const conta=p=>{ try{ return fs.readdirSync(p).filter(f=>f.endsWith('.mp4')) }catch{ return [] } }
const gb=fs2=>fs2.reduce((s,f)=>{ try{ return s+fs.statSync(f).size }catch{ return s } },0)/1e9
async function noDrive(t,id){
  let n=0, pag
  do{
    const u=new URL('https://www.googleapis.com/drive/v3/files')
    u.searchParams.set('q',`'${id}' in parents and trashed=false`)
    u.searchParams.set('fields','nextPageToken,files(id)'); u.searchParams.set('pageSize','1000')
    u.searchParams.set('supportsAllDrives','true'); u.searchParams.set('includeItemsFromAllDrives','true')
    if(pag)u.searchParams.set('pageToken',pag)
    const d=await (await fetch(u,{headers:{Authorization:'Bearer '+t}})).json()
    n+=(d.files||[]).length; pag=d.nextPageToken
  }while(pag)
  return n
}
const vivo=async alvo=>!!(await exec('pgrep',['-f',alvo]).catch(()=>({stdout:''}))).stdout.trim()

let base=null
for(;;){
  const t=await token()
  const linhas=[]
  for(const L of LOCAIS){
    const arqs=conta(L.local)
    linhas.push({...L, montados:arqs.length,
      tamanho:gb(arqs.map(f=>path.join(L.local,f))),
      enviados: await noDrive(t,L.drive)})
  }
  const montados=linhas.reduce((s,l)=>s+l.montados,0), meta=linhas.reduce((s,l)=>s+l.meta,0)
  const enviados=linhas.reduce((s,l)=>s+l.enviados,0)
  const totGb=linhas.reduce((s,l)=>s+l.tamanho,0)
  const montando=await vivo('_semgancho'), subindo=await vivo('_enviar')
  if(base===null) base={t:Date.now(), env:enviados}
  const dt=(Date.now()-base.t)/1000, dn=enviados-base.env
  const ritmo=dt>60 && dn>0 ? dn/dt : 0
  const faltaUp=ritmo ? (montados-enviados)/ritmo : null
  const barra=(f,t)=>Math.round(f/t*100)
  const bloco=(rot,f,t,cor)=>`<div class=s><div class=sl><span>${rot}</span><b>${f} / ${t}</b></div>
    <div class=barra><i style="width:${barra(f,t)}%;background:${cor}"></i></div></div>`
  fs.writeFileSync(PAINEL, `<!doctype html><html lang=pt-BR><head><meta charset=utf-8>
<meta http-equiv=refresh content=15><title>Produção PDS</title><style>
*{box-sizing:border-box}body{margin:0;background:#0E1319;color:#EDF1F5;
font:15px/1.5 -apple-system,system-ui,sans-serif;padding:34px 20px}
.w{max-width:760px;margin:0 auto}h1{font-size:22px;margin:0 0 4px;font-weight:600}
.sub{color:#8593A1;font-size:13px;margin:0 0 22px}
.s{margin-bottom:16px}.sl{display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:6px}
.sl b{font-variant-numeric:tabular-nums}
.barra{height:9px;background:#1B222A;border-radius:99px;overflow:hidden}
.barra i{display:block;height:100%;border-radius:99px;transition:width .4s}
.cx{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:22px 0}
.b{background:#151C24;border:1px solid #263039;border-radius:10px;padding:12px 14px}
.b b{display:block;font-size:21px;font-variant-numeric:tabular-nums;line-height:1.2}
.b span{font-size:11.5px;color:#8593A1}
table{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:8px}
th{text-align:left;color:#8593A1;font-weight:500;padding:8px 6px;border-bottom:1px solid #263039;
font-size:11px;text-transform:uppercase;letter-spacing:.06em}
td{padding:9px 6px;border-bottom:1px solid #1B222A}
td.n{text-align:right;font-variant-numeric:tabular-nums}
.e{display:inline-block;width:7px;height:7px;border-radius:99px;margin-right:7px}
.on{background:#6BD3A0}.off{background:#4B5560}
.st{font-size:13px;color:#B9C3CE;margin-top:18px}
</style></head><body><div class=w>
<h1>Produção dos anúncios PDS</h1>
<p class=sub>2609-JL-IIP-PDS · atualiza sozinho a cada 15 segundos</p>
${bloco('Montados no HD', montados, meta, 'linear(90deg,#2A7FA8,#4FB6E3)'.replace('linear','linear-gradient'))}
${bloco('Enviados ao Drive', enviados, meta, 'linear-gradient(90deg,#1E6B47,#6BD3A0)')}
<div class=cx>
 <div class=b><b>${montados}</b><span>montados</span></div>
 <div class=b><b>${enviados}</b><span>no Drive</span></div>
 <div class=b><b>${totGb.toFixed(1)} GB</b><span>gerados</span></div>
 <div class=b><b>${faltaUp!==null?Math.round(faltaUp/60)+' min':'—'}</b><span>falta subir</span></div>
</div>
<table><thead><tr><th>pasta</th><th class=n>montados</th><th class=n>no Drive</th><th class=n>tamanho</th></tr></thead>
<tbody>${linhas.map(l=>`<tr><td>${l.nome}</td><td class=n>${l.montados} / ${l.meta}</td>
<td class=n>${l.enviados}</td><td class=n>${l.tamanho.toFixed(1)} GB</td></tr>`).join('')}</tbody></table>
<p class=st><span class="e ${montando?'on':'off'}"></span>montagem ${montando?'rodando':'parada'}
&nbsp;&nbsp;<span class="e ${subindo?'on':'off'}"></span>upload ${subindo?'rodando':'parado'}</p>
</div></body></html>`)
  await new Promise(r=>setTimeout(r,15000))
}
