import { GoogleAuth } from 'google-auth-library'
import fs from 'fs'
import crypto from 'node:crypto'
const creds = JSON.parse(fs.readFileSync('/Users/gcosta/Downloads/baixa-gravacoes-04ae892ee0e9.json','utf8'))
const secret = fs.readFileSync(process.env.SECRET,'utf8').trim()
const auth = new GoogleAuth({ credentials: creds, scopes:['https://www.googleapis.com/auth/drive.readonly'] })
const token = (await (await auth.getClient()).getAccessToken()).token
const FOLDER='1Fkdt2hYQQ6K8DJyvDy1tliCpYDhS1Qil'
// pega um bruto grande
const q=encodeURIComponent(`'${FOLDER}' in parents and trashed=false and mimeType contains 'video'`)
const lr=await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,size)&orderBy=quotaBytesUsed desc&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`,{headers:{Authorization:'Bearer '+token}})
const f=(await lr.json()).files[0]
console.log('arquivo:', f.name, '| MB:', Math.round(f.size/1048576))
const RANGE='bytes=0-83886079' // 80 MB
const UA={'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15'}

async function medir(nome, url, headers){
  const t0=Date.now()
  const r=await fetch(url,{headers})
  const buf=await r.arrayBuffer()
  const dt=(Date.now()-t0)/1000
  const mb=buf.byteLength/1048576
  console.log(`${nome}: ${mb.toFixed(0)} MB em ${dt.toFixed(1)}s = ${(mb/dt).toFixed(1)} MB/s (status ${r.status})`)
}

// 1) direto da API do Drive
await medir('Drive API direto', `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&supportsAllDrives=true`, {Authorization:'Bearer '+token, Range:RANGE})
// 2) pelo worker
const exp=Math.floor(Date.now()/1000)+3600
const sig=crypto.createHmac('sha256',secret).update(`${f.id}:${exp}`).digest('base64url')
await medir('Worker Cloudflare', `https://central-gravacao-download.gu-costa-mendes.workers.dev/?id=${f.id}&exp=${exp}&sig=${sig}`, {...UA, Range:RANGE})
