import { SUPA_URL, googleToken } from './_util.js'

// Monta um PACOTE NO PRÓPRIO DRIVE: cria uma pasta temporária e copia pra lá os vídeos escolhidos.
// A cópia é interna do Google (server-side): não passa byte nenhum por nós, então não tem limite de
// tamanho — diferente do .tar montado no worker, que estourava o limite de CPU do Cloudflare.
// O usuário abre a pasta e baixa tudo pelo Drive (que zipa sozinho).
// As pastas se apagam sozinhas: toda vez que um pacote novo é criado, os antigos vão pra lixeira.
const SHARED_DRIVE_ID = '0ANh1nYBAOuTbUk9PVA'
const PASTA_MAE = 'Downloads temporários (Central)'
const HORAS_VIDA = 12
const MAX = 25

const D = 'https://www.googleapis.com/drive/v3/files'

async function drive(token, caminho, init = {}) {
  const r = await fetch(D + caminho, {
    ...init,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((d.error && d.error.message) || 'drive ' + r.status)
  return d
}

// acha (ou cria) a pasta-mãe onde ficam os pacotes temporários.
// Fica DENTRO de uma pasta onde a conta de serviço escreve (ela não é membro da raiz do Shared Drive).
async function pastaMae(token, raiz) {
  const q = encodeURIComponent(`name='${PASTA_MAE}' and '${raiz}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`)
  const achou = await drive(token, `?q=${q}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`)
  if (achou.files && achou.files[0]) return achou.files[0].id
  const nova = await drive(token, '?supportsAllDrives=true&fields=id', {
    method: 'POST',
    body: JSON.stringify({ name: PASTA_MAE, mimeType: 'application/vnd.google-apps.folder', parents: [raiz] }),
  })
  return nova.id
}

// joga fora os pacotes vencidos (a limpeza roda junto com a criação do próximo)
async function limpar(token, maeId, horas = HORAS_VIDA) {
  // sem os milissegundos: a busca do Drive não aceita o formato com .000
  const limite = new Date(Date.now() - horas * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const q = encodeURIComponent(`'${maeId}' in parents and trashed=false and createdTime < '${limite}'`)
  const velhos = await drive(token, `?q=${q}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=drive&driveId=${SHARED_DRIVE_ID}`)
  await Promise.all((velhos.files || []).map((f) =>
    drive(token, `/${f.id}?supportsAllDrives=true`, { method: 'PATCH', body: JSON.stringify({ trashed: true }) }).catch(() => {}),
  ))
  return (velhos.files || []).length
}

// pasta de brutos do time (primeira da lista, se houver várias separadas por vírgula)
async function pastaBrutosDoTime(env, team) {
  const SUPA = SUPA_URL(env), KEY = env.VITE_SUPABASE_ANON_KEY
  const r = await fetch(`${SUPA}/rest/v1/teams?select=brutos_folder_id&id=eq.${encodeURIComponent(team)}`, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })
  const rows = await r.json().catch(() => [])
  const v = Array.isArray(rows) && rows[0] ? rows[0].brutos_folder_id : null
  return v ? String(v).split(',')[0].replace(/^canais:/, '').trim() : null
}

export async function onRequest({ request, env }) {
  try {
    const url = new URL(request.url)
    const ids = (url.searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean)
    if (!ids.length) return Response.json({ error: 'falta ids' }, { status: 400 })
    if (ids.length > MAX) return Response.json({ error: 'pacote grande demais' }, { status: 400 })

    // só ids cadastrados (senão viraria acesso livre ao Shared Drive)
    const SUPA = SUPA_URL(env), KEY = env.VITE_SUPABASE_ANON_KEY
    const lista = ids.map((i) => '"' + i + '"').join(',')
    const ok = new Set()
    for (const t of ['brutos', 'editados']) {
      const r = await fetch(`${SUPA}/rest/v1/${t}?select=drive_id&drive_id=in.(${lista})`, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })
      const rows = await r.json().catch(() => [])
      if (Array.isArray(rows)) for (const x of rows) ok.add(x.drive_id)
    }
    const validos = ids.filter((i) => ok.has(i))
    if (!validos.length) return Response.json({ error: 'nenhum vídeo encontrado' }, { status: 404 })

    const token = await googleToken(env)
    // raiz onde a conta de serviço tem escrita: a pasta de brutos do time (?raiz= permite testar outra)
    const raiz = url.searchParams.get('raiz') || (await pastaBrutosDoTime(env, url.searchParams.get('team') || 'jaylton'))
    if (!raiz) return Response.json({ error: 'time sem pasta de brutos configurada' }, { status: 400 })
    const maeId = await pastaMae(token, raiz)
    // ?horas= só pra conferir a limpeza (padrão: HORAS_VIDA)
    const horas = Number(url.searchParams.get('horas') ?? HORAS_VIDA)
    const apagados = await limpar(token, maeId, Number.isFinite(horas) ? horas : HORAS_VIDA).catch(() => 0)

    const agora = new Date()
    const dd = String(agora.getUTCDate()).padStart(2, '0')
    const mm = String(agora.getUTCMonth() + 1).padStart(2, '0')
    const hh = String((agora.getUTCHours() + 24 - 3) % 24).padStart(2, '0') // Brasília
    const mi = String(agora.getUTCMinutes()).padStart(2, '0')
    const nomePasta = `${dd}-${mm} ${hh}h${mi} — ${validos.length} vídeo${validos.length > 1 ? 's' : ''}`

    // ?lote=<id> continua num lote JÁ criado, em vez de abrir outro. É como um pedido grande cabe:
    // cada cópia é uma subrequisição e a Cloudflare corta a execução perto de 50, então o cliente
    // manda em levas de 25 — a primeira cria a pasta, as seguintes despejam nela. Um link só no fim.
    const loteId = (url.searchParams.get('lote') || '').trim()
    const pasta = loteId
      ? await drive(token, `/${loteId}?supportsAllDrives=true&fields=id,driveId`)
      : await drive(token, '?supportsAllDrives=true&fields=id,driveId', {
          method: 'POST',
          body: JSON.stringify({ name: nomePasta, mimeType: 'application/vnd.google-apps.folder', parents: [maeId] }),
        })

    // cópias em paralelo: é o Google copiando dentro dele mesmo, não trafega por aqui
    const res = await Promise.all(validos.map((id) =>
      drive(token, `/${id}/copy?supportsAllDrives=true&fields=id`, { method: 'POST', body: JSON.stringify({ parents: [pasta.id] }) })
        .then(() => true).catch(() => false),
    ))
    const copiados = res.filter(Boolean).length
    if (!copiados) return Response.json({ error: 'não consegui copiar os vídeos (permissão no Drive?)' }, { status: 500 })

    return Response.json({
      url: `https://drive.google.com/drive/folders/${pasta.id}`,
      copiados,
      driveId: pasta.driveId || null, // onde a pasta ficou (Shared Drive x drive pessoal)
      pedidos: ids.length,
      apagados,
      horas: HORAS_VIDA,
    })
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 500 })
  }
}
