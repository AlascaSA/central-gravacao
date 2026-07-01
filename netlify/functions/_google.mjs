import { GoogleAuth } from 'google-auth-library'

// Raízes de brutos que a conta de serviço enxerga. Varre recursivamente
// (nova estrutura: Brutos > tipo > mês > dia > vídeos). A antiga fica por compat.
export const BRUTOS_ROOTS = [
  '1teUk4IYAMH3Fd99LvS1NvTyY2FPbeMq-', // "Brutos" (Reel geral, YouTube, Teste, STORYTELLING…)
  '1Fkdt2hYQQ6K8DJyvDy1tliCpYDhS1Qil', // "Brutos" antiga (vídeos soltos)
]
// Shared Drive dos brutos — usado pra liberar o download de qualquer bruto dele.
export const SHARED_DRIVE_ID = '0ANh1nYBAOuTbUk9PVA'
// Pastas ignoradas na varredura (vídeo editado, não bruto).
export const IGNORAR_PASTAS = /editando|editado/i

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
