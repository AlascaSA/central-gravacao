import { GoogleAuth } from 'google-auth-library'

export const BRUTOS_FOLDER_ID = '1Fkdt2hYQQ6K8DJyvDy1tliCpYDhS1Qil'

let _auth
function getAuth() {
  if (!_auth) {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
    _auth = new GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/drive'] })
  }
  return _auth
}

export async function driveToken() {
  const client = await getAuth().getClient()
  const t = await client.getAccessToken()
  return t.token
}
