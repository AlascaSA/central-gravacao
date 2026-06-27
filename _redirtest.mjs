import { GoogleAuth } from 'google-auth-library'
import fs from 'fs'
const key = JSON.parse(fs.readFileSync('/Users/gcosta/Downloads/baixa-gravacoes-04ae892ee0e9.json','utf8'))
const auth = new GoogleAuth({ credentials: key, scopes: ['https://www.googleapis.com/auth/drive.readonly'] })
const token = (await (await auth.getClient()).getAccessToken()).token
const id='19b4TrzmhVJKGdIdhiDdMiR4gU5dYCB8V'
// redirect manual pra ver se o Drive devolve uma URL direta utilizável
const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, { headers:{Authorization:'Bearer '+token}, redirect:'manual' })
console.log('status', r.status)
const loc = r.headers.get('location')
console.log('location:', loc ? loc.slice(0,110) : null)
if (loc) {
  // a URL de redirect funciona SEM o header de auth? (pra poder mandar o browser direto)
  const t = await fetch(loc, { method:'GET', headers:{Range:'bytes=0-1'} })
  console.log('loc sem auth:', t.status, t.headers.get('content-type'), t.headers.get('content-length'))
}
