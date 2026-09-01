// Corpo + CTA, sem gancho. O nome diz a composição: AD03-T5 é o corpo 3 com o CTA 5.
import { montarPeca, porMusica } from './scripts/lib/ffmpeg-montagem.mjs'
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs'
import { execFile } from 'node:child_process'; import { promisify } from 'node:util'
const exec=promisify(execFile)

const P=path.join(os.homedir(),'.cache','pds-fontes')
// pasta própria: corpo+CTA é outro formato, não variação das montadas
const SAIDA='/Volumes/HD 01/Alasca Arquivos/Alasca/Vídeos/Jaylton/Vídeos/21:08 - Ganchos - CTAS - CORPO/Sem gancho'
const CACHE=path.join(os.homedir(),'.cache','pds-saida')
const SW=`${P}/swoosh-2-359826.mp3`
const BURNS=['001','002','003','008'].map(n=>`${P}/trasições/FILMBURN_HARD_${n}.mp4`)
const MUS=['01','02','03','04','05','06','07'].map(n=>`${P}/musicas/${n}.mp3`)
const CODIGO='2609-JL-IIP-PDS-CAP'
const C=[...Array(8)].map((_,i)=>`C${i+1}`), T=['T1','T2','T3','T5','T6','T7']
const tc={T1:"SSFSFSSS",T2:"SNSFFSFS",T3:"FFFSSFSF",T5:"SNSSRSSS",T6:"SFNRSFRS",T7:"SSSSFFFS"}
const arqC=Object.fromEntries(C.map((c,i)=>[c,`Corpo ${i+1}`]))
const arqT={T1:'CTA 1',T2:'CTA 2',T3:'CTA 3',T5:'CTA 5',T6:'CTA 6',T7:'CTA 7'}
function acha(pasta,pre){ const a=pre.toLowerCase().replace(/\s+/g,'')
  const f=fs.readdirSync(pasta).find(x=>x.toLowerCase().replace(/\s+/g,'').replace(/\.mp4$/,'')===a)
  if(!f) throw new Error(`não achei "${pre}"`); return path.join(pasta,f) }
function hash(s){ let h=0; for(const c of s) h=(h*31+c.charCodeAt(0))|0; return Math.abs(h) }

// espera o lote principal acabar, para não disputar o encoder
async function esperarLote(){
  for(;;){
    const r=await exec('pgrep',['-f','node _lote.mjs']).catch(()=>({stdout:''}))
    if(!r.stdout.trim()) return
    await new Promise(r=>setTimeout(r,30000))
  }
}
await esperarLote()
fs.mkdirSync(SAIDA,{recursive:true})

const fila=[]
C.forEach((c,ci)=>T.forEach(t=>{ if('FS'.includes(tc[t][ci])) fila.push({c,t,cod:`AD${String(ci+1).padStart(2,'0')}-${t}`}) }))
fs.mkdirSync(CACHE,{recursive:true})
const t0=Date.now()
let n=0
for(const x of fila){
  const nome=`${CODIGO}-${x.cod}.mp4`
  if(fs.existsSync(path.join(SAIDA,nome))){ n++; continue }
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sg-'))
  try{
    const partes=[acha(`${P}/_1080/Corpo`,arqC[x.c]), acha(`${P}/_1080/cta`,arqT[x.t])]
    const h=hash(x.cod)
    const { cortes, total } = await montarPeca(partes, [BURNS[h%BURNS.length]], `${tmp}/v.mp4`, {largura:1080,altura:1920})
    const noSSD=path.join(CACHE,nome)
    await porMusica(`${tmp}/v.mp4`, MUS[h%MUS.length], noSSD, { efeitos: cortes.map(t=>({t,arquivo:SW,pico:0.45})) })
    fs.copyFileSync(noSSD, path.join(SAIDA,nome)); fs.unlinkSync(noSSD)
    n++
    console.log(`  ${String(n).padStart(2)}/${fila.length} ${x.cod}  ${x.c}+${x.t}  ${Math.round(total)}s`)
  }catch(e){ console.error(`  ${x.cod} FALHOU:`, String(e.message).slice(0,100)) }
  fs.rmSync(tmp,{recursive:true,force:true})
}
console.log(`\n${n} peças sem gancho em ${((Date.now()-t0)/60000).toFixed(0)} min`)
