import { montarPeca, porMusica } from './scripts/lib/ffmpeg-montagem.mjs'
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs'
import { execFile } from 'node:child_process'; import { promisify } from 'node:util'
const exec=promisify(execFile)

// as fontes ficam no SSD: medido, ler e gravar no disco interno é 40% mais
// rápido que no HD externo — e o externo dorme no meio da rodada
const P=path.join(os.homedir(),'.cache','pds-fontes')
const HD='/Volumes/HD 01/Alasca Arquivos/Alasca/Vídeos/Jaylton/Vídeos/21:08 - Ganchos - CTAS - CORPO/Pronto'
const SAIDA='/Volumes/HD 01/Alasca Arquivos/Alasca/Vídeos/Jaylton/Vídeos/21:08 - Ganchos - CTAS - CORPO/Lote 01 - teste'
const SW=`${P}/swoosh-2-359826.mp3`
const BURNS=['001','002','003','008'].map(n=>`${P}/trasições/FILMBURN_HARD_${n}.mp4`)
const CACHE=path.join(os.homedir(),'.cache','pds-saida')
const MUS=['01','02','03','04','05','06','07'].map(n=>`${P}/musicas/${n}.mp3`)
const CODIGO='2609-JL-IIP-PDS-CAP'

const G=[...Array(11)].map((_,i)=>`G${String(i+1).padStart(2,'0')}`)
const C=[...Array(8)].map((_,i)=>`C${i+1}`)
const T=['T1','T2','T3','T5','T6','T7']
const gc={G01:"FSFSSFSF",G02:"FNFNNSNS",G03:"SNSFSSFS",G04:"FNSSSFSS",G05:"SNNSFSSS",
 G06:"SSFFFSSF",G07:"FSFNNSNS",G08:"FSFSSFSF",G09:"NNNFFNFN",G10:"SNSSFSSS",G11:"NFNRNNFN"}
const tc={T1:"SSFSFSSS",T2:"SNSFFSFS",T3:"FFFSSFSF",T5:"SNSSRSSS",T6:"SFNRSFRS",T7:"SSSSFFFS"}
const tg={T1:"SSSSSFSSSSS",T2:"SNFSFSNSFFS",T3:"FSSSSFFFSSS",T5:"SNFFFSNSSSN",T6:"SNSSSSSSFSF",T7:"SRSSSSFFSSS"}
// os nomes na pasta têm espaço a mais em alguns arquivos ("CTA 3 .mp4"), então
// resolvo por prefixo em vez de montar o nome — senão uma peça derruba o lote
function acha(pasta, prefixo) {
  const alvo = prefixo.toLowerCase().replace(/\s+/g,'')
  const f = fs.readdirSync(pasta).find(x =>
    x.toLowerCase().replace(/\s+/g,'').replace(/\.mp4$/,'') === alvo)
  if (!f) throw new Error(`não achei "${prefixo}" em ${path.basename(pasta)}`)
  return path.join(pasta, f)
}
const arqG=Object.fromEntries(G.map((g,i)=>[g,`Gancho ${i+1}`]))
const arqC=Object.fromEntries(C.map((c,i)=>[c,`Corpo ${i+1}`]))
const arqT={T1:'CTA 1',T2:'CTA 2',T3:'CTA 3',T5:'CTA 5',T6:'CTA 6',T7:'CTA 7'}
const ok=m=>m==='F'||m==='S'
const dorme=ms=>new Promise(r=>setTimeout(r,ms))

// o HD externo cai sozinho de vez em quando (entra em repouso) e volta em
// segundos. Numa rodada longa isso derruba peças por um motivo que não é erro
// de verdade — então espera o volume reaparecer e tenta de novo.
async function comRetry(rotulo, fn, tentativas=6) {
  for (let k=1;;k++) {
    try { return await fn() }
    catch (e) {
      const sumiu = /ENOENT|No such file|Input\/output error/i.test(String(e.message))
      if (!sumiu || k>=tentativas) throw e
      console.log(`     ${rotulo}: disco sumiu, esperando voltar (tentativa ${k})`)
      // espera até 4 minutos o volume reaparecer, checando a cada 2s
      for (let s=0;s<120;s++){ if (fs.existsSync(P)) break; await dorme(2000) }
      await dorme(5000)
    }
  }
}
const letra=i=> i<26 ? String.fromCharCode(65+i) : String.fromCharCode(65+Math.floor(i/26)-1)+String.fromCharCode(65+i%26)

const todas=[]
C.forEach((c,ci)=>{
  const grupo=[]
  G.forEach(g=>T.forEach(t=>{
    const a=gc[g][ci], b=tc[t][ci], d=tg[t][G.indexOf(g)]
    if (ok(a)&&ok(b)&&ok(d)) grupo.push({g,t,f:[a,b,d].filter(x=>x==='F').length})
  }))
  grupo.sort((x,y)=> y.f-x.f || x.g.localeCompare(y.g) || x.t.localeCompare(y.t))
  grupo.forEach((x,i)=> todas.push({cod:`AD${String(ci+1).padStart(2,'0')}${letra(i)}`, c, ...x}))
})

// dois por corpo garantidos (cobre os oito), depois os melhores que sobrarem.
// nunca o mesmo par gancho+corpo duas vezes: seria o mesmo argumento repetido.
const usados=new Set(), lote=[]
for (const c of C) {
  const cands=todas.filter(x=>x.c===c).sort((a,b)=>b.f-a.f)
  let n=0
  for (const x of cands) {
    if (n>=2) break
    const ang=`${x.g}|${x.c}`
    if (usados.has(ang)) continue
    usados.add(ang); lote.push(x); n++
  }
}
for (const x of [...todas].sort((a,b)=>b.f-a.f)) {
  if (lote.length>=20) break
  const ang=`${x.g}|${x.c}`
  if (usados.has(ang)) continue
  usados.add(ang); lote.push(x)
}
lote.sort((a,b)=>a.cod.localeCompare(b.cod))
const pedidos=process.argv.slice(2).filter(a=>!a.startsWith('--'))
const TODOS=process.argv.includes('--todos')
if (pedidos.length) {
  const so=new Set(pedidos)
  lote.length = 0
  todas.filter(x=>so.has(x.cod)).forEach(x=>lote.push(x))
} else if (TODOS) {
  lote.length = 0
  todas.forEach(x=>lote.push(x))
}
// já feito não refaz — é isso que deixa retomar a rodada de onde parou
if (fs.existsSync(SAIDA)) {
  const tem=new Set(fs.readdirSync(SAIDA))
  const antes=lote.length
  for (let k=lote.length-1;k>=0;k--) if (tem.has(`${CODIGO}-${lote[k].cod}.mp4`)) lote.splice(k,1)
  if (antes!==lote.length) console.log(`  ${antes-lote.length} já estavam prontos, pulando`)
}

fs.mkdirSync(SAIDA,{recursive:true})
console.log(`lote de ${lote.length} · corpos cobertos: ${new Set(lote.map(x=>x.c)).size}/8`)
const seg=async f=>Number((await exec('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',f])).stdout.trim())
const PAINEL=path.join(os.homedir(),'Downloads','PDS-producao.html')
const feitos=[], falhas=[]
function pintar(i, atual) {
  const gasto=(Date.now()-t0)/1000
  const media=feitos.length ? gasto/feitos.length : 0
  const falta=media*(lote.length-i)
  const pct=Math.round(i/lote.length*100)
  const hhmm=s=>`${Math.floor(s/3600)}h${String(Math.round(s%3600/60)).padStart(2,'0')}`
  const linhas=feitos.slice(-14).reverse().map(f=>
    `<tr><td class=c>${f.cod}</td><td>${f.desc}</td><td class=n>${f.seg}s</td><td class=n>${f.mb} MB</td><td class=h>${f.hora}</td></tr>`).join('')
  const erros=falhas.length ? `<div class=erro><b>${falhas.length} com erro:</b> ${falhas.map(f=>f.cod).join(', ')}</div>` : ''
  fs.writeFileSync(PAINEL, `<!doctype html><html lang=pt-BR><head><meta charset=utf-8>
<meta http-equiv=refresh content=20><title>Produção PDS</title><style>
*{box-sizing:border-box}body{margin:0;background:#0E1319;color:#EDF1F5;
font:15px/1.5 -apple-system,system-ui,sans-serif;padding:32px 20px}
.w{max-width:820px;margin:0 auto}h1{font-size:22px;margin:0 0 4px;font-weight:600}
.sub{color:#8593A1;font-size:13px;margin:0 0 24px}
.barra{height:10px;background:#1B222A;border-radius:99px;overflow:hidden;margin:18px 0 8px}
.barra i{display:block;height:100%;background:linear-gradient(90deg,#2A7FA8,#4FB6E3);border-radius:99px;
width:${pct}%;transition:width .4s}
.linha{display:flex;justify-content:space-between;font-size:13px;color:#B9C3CE}
.cx{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:22px 0}
.b{background:#151C24;border:1px solid #263039;border-radius:10px;padding:12px 14px}
.b b{display:block;font-size:22px;font-variant-numeric:tabular-nums;line-height:1.2}
.b span{font-size:11.5px;color:#8593A1}
.ag{background:#10303F;border:1px solid #2A7FA8;border-radius:10px;padding:12px 14px;margin-bottom:18px;font-size:13.5px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;color:#8593A1;font-weight:500;padding:8px 6px;border-bottom:1px solid #263039;font-size:11.5px;
text-transform:uppercase;letter-spacing:.06em}
td{padding:7px 6px;border-bottom:1px solid #1B222A}
.c{font-family:ui-monospace,monospace;color:#4FB6E3}
.n,.h{font-variant-numeric:tabular-nums;color:#8593A1;text-align:right}
.erro{background:#2C1416;border:1px solid #7A3038;border-radius:10px;padding:12px 14px;margin:16px 0;font-size:13.5px}
.fim{background:#102E20;border:1px solid #1E6B47;color:#6BD3A0}
</style></head><body><div class=w>
<h1>Produção dos anúncios PDS</h1>
<p class=sub>2609-JL-IIP-PDS · atualiza sozinho a cada 20 segundos</p>
${atual ? `<div class=ag>Montando agora: <b>${atual}</b></div>`
        : `<div class="ag fim">Lote concluído.</div>`}
<div class=barra><i></i></div>
<div class=linha><span>${i} de ${lote.length}</span><span>${pct}%</span></div>
<div class=cx>
 <div class=b><b>${feitos.length}</b><span>prontos</span></div>
 <div class=b><b>${falhas.length}</b><span>com erro</span></div>
 <div class=b><b>${hhmm(gasto)}</b><span>rodando há</span></div>
 <div class=b><b>${atual?hhmm(falta):'—'}</b><span>falta</span></div>
 <div class=b><b>${(feitos.reduce((s,f)=>s+Number(f.mb),0)/1000).toFixed(1)} GB</b><span>gerados</span></div>
</div>
${erros}
<table><thead><tr><th>código</th><th>peças</th><th>duração</th><th>tamanho</th><th>hora</th></tr></thead>
<tbody>${linhas}</tbody></table>
</div></body></html>`)
}

const t0=Date.now()
pintar(0, 'preparando…')

const PARALELO = Number(process.env.PARALELO || 3)
let proxima = 0, concluidas = 0

async function uma(x) {
  const nome=`${CODIGO}-${x.cod}.mp4`
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'peca-'))
  try{ await comRetry(x.cod, async () => {
    const LEVE=`${P}/_1080`
    fs.mkdirSync(CACHE,{recursive:true})
    const partes=[acha(`${P}/Ganchos`,arqG[x.g]), acha(`${LEVE}/Corpo`,arqC[x.c]), acha(`${LEVE}/cta`,arqT[x.t])]
    // emenda + film burn numa passada, com o encoder de hardware
    const { cortes, total } = await montarPeca(partes,
      [BURNS[hash(x.cod)%BURNS.length], BURNS[(hash(x.cod)+1)%BURNS.length]],
      `${tmp}/v.mp4`, {largura:1080,altura:1920})
    const noSSD=path.join(CACHE,nome)
    await porMusica(`${tmp}/v.mp4`, MUS[hash(x.cod)%MUS.length], noSSD,
      { efeitos: cortes.map(t=>({t, arquivo:SW, pico:0.45})) })
    const mb=(fs.statSync(noSSD).size/1e6).toFixed(0)
    // copiar+apagar em vez de rename: origem e destino são volumes diferentes
    fs.copyFileSync(noSSD, path.join(SAIDA,nome))
    fs.unlinkSync(noSSD)
    feitos.push({cod:x.cod, desc:`${x.c} + ${x.g} + ${x.t}`, seg:Math.round(total), mb,
      hora:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})})
    console.log(`  ${String(feitos.length).padStart(3)}/${lote.length} ${x.cod}  ${x.c}+${x.g}+${x.t}  ${Math.round(total)}s ${mb}MB`)
  })}catch(e){ falhas.push({cod:x.cod}); console.error(`  ${x.cod} FALHOU:`, String(e.message).slice(0,120)) }
  fs.rmSync(tmp,{recursive:true,force:true})
  concluidas++
  pintar(concluidas, concluidas<lote.length ? (lote[proxima]||{}).cod : null)
}

// burn e música escolhidos pelo código da peça, não pela posição na fila:
// assim a mesma peça sai igual mesmo se a rodada for retomada no meio
function hash(s){ let h=0; for (const c of s) h=(h*31+c.charCodeAt(0))|0; return Math.abs(h) }

async function trabalhador(){
  for(;;){ const i=proxima++; if(i>=lote.length) return; await uma(lote[i]) }
}
await Promise.all(Array.from({length:Math.min(PARALELO,lote.length)}, trabalhador))

console.log(`\nlote pronto em ${((Date.now()-t0)/60000).toFixed(0)} min → ${SAIDA}`)
