import { driveToken } from './_google.mjs'

// Renomeia o bruto no Google Drive conforme o card ligado (título do card, ou "SR - {título}" no sem-roteiro),
// preservando o nome original (pra reverter ao desligar) e a extensão. DB via chave anon (RLS de brutos libera).
const SUPA = process.env.VITE_SUPABASE_URL || 'https://kkvuioyferqbilfwdkqa.supabase.co'
const KEY = process.env.VITE_SUPABASE_ANON_KEY

// Apelido no padrão Alasca. O bruto batizado carrega "BR-<apelido>"; o Renomeador lê este nome,
// tira o "BR-" e normaliza. Apelido = minúsculas, só letras e espaços (acentos ok);
// sem números, pontuação, símbolos ou código (o \p{L} mantém letras acentuadas, tira o resto).
function apelidoDe(titulo) {
  // Só normalização de caractere: minúsculas, letras (com acento) e espaço; tira números, pontuação, símbolos.
  // NÃO remove palavras "proibidas" (vídeo/anúncio/reel) à força — estragaria título legítimo tipo
  // "Story da Julia". Essa regra fica com a IA (prompt) e com quem digita o título do card.
  const s = (titulo || '').toLowerCase().replace(/[^\p{L}\s]+/gu, ' ').replace(/\s+/g, ' ').trim()
  return s || 'clipe'
}

export default async (req) => {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'método inválido' }, { status: 405 })
    const { drive_id } = await req.json().catch(() => ({}))
    if (!drive_id) return Response.json({ error: 'falta drive_id' }, { status: 400 })
    const hdr = { apikey: KEY, Authorization: 'Bearer ' + KEY }
    const idq = encodeURIComponent(drive_id)

    const b = (await (await fetch(`${SUPA}/rest/v1/brutos?select=drive_id,card_id,nome,nome_original,tipo,ia_tipo&drive_id=eq.${idq}`, { headers: hdr })).json())[0]
    if (!b) return Response.json({ error: 'bruto não encontrado' }, { status: 404 })

    // Descarte NÃO ganha apelido: fica com o nome de câmera. Assim o editor bate o olho e sabe qual
    // é a tomada boa, e o Renomeador não oferece um descarte como apelido do vídeo final.
    const ehDescarte = (b.tipo || b.ia_tipo) === 'erro'

    let alvo
    if (!b.card_id || ehDescarte) {
      if (!b.nome_original) return Response.json({ ok: true, nome: b.nome }) // nunca foi batizado
      alvo = b.nome_original
    } else {
      const card = (await (await fetch(`${SUPA}/rest/v1/cards?select=titulo,sem_roteiro,produto,team&id=eq.${encodeURIComponent(b.card_id)}`, { headers: hdr })).json())[0]
      if (!card) return Response.json({ error: 'card não encontrado' }, { status: 404 })
      // o bruto batizado carrega o APELIDO no padrão: "BR-<apelido>" (o "BR-" agora é da Central, não do Renomeador)
      let base = 'BR-' + apelidoDe(card.titulo || 'video')

      // COLISÃO ENTRE CARDS DIFERENTES: dois cards podem ter o mesmo título (aconteceu com "subir de
      // nível", um do PGDI e outro do MAI) e sairiam com o MESMO nome de arquivo. O sufixo (2) mais
      // abaixo não pega isso: ele numera tomadas DENTRO de um card. A comparação é pelo APELIDO, não
      // pelo título cru — é assim que "Subir de nível" e "subir de nível" aparecem como a mesma
      // colisão que o Drive enxerga. Desempate em cascata, do mais legível pro garantido:
      // produto → data de criação do card → pedaço do id (nunca deixa dois arquivos com o mesmo nome).
      const apelido = apelidoDe(card.titulo || 'video')
      // sem filtrar arquivados: se o card antigo for arquivado depois, o nome do arquivo não pode mudar sozinho
      const doTime = await (await fetch(`${SUPA}/rest/v1/cards?select=id,titulo,produto,criado_em&team=eq.${encodeURIComponent(card.team)}`, { headers: hdr })).json()
      const mesmoNome = (Array.isArray(doTime) ? doTime : []).filter((c) => apelidoDe(c.titulo || '') === apelido)
      if (mesmoNome.length > 1) {
        const soEuComEsseProduto = card.produto && mesmoNome.filter((c) => (c.produto || '') === card.produto).length === 1
        const dia = (card.criado_em || '').slice(0, 10)
        const soEuNesseDia = dia && mesmoNome.filter((c) => (c.criado_em || '').slice(0, 10) === dia).length === 1
        if (soEuComEsseProduto) base = `BR-${apelido} ${card.produto}`
        else if (soEuNesseDia) base = `BR-${apelido} ${dia.slice(8, 10)}-${dia.slice(5, 7)}`
        else base = `BR-${apelido} ${String(b.card_id).slice(0, 4)}`
      }
      // sufixo pela POSIÇÃO na ordem de gravação — não pela quantidade de irmãos, senão todas as
      // tomadas do mesmo card sairiam com o mesmo nome (3 tomadas viravam três "(3)" no Drive).
      // desempate por drive_id (NÃO por nome: o nome é justamente o que estamos mudando, então a
      // ordem virava outra a cada renomeação e duas tomadas acabavam com o mesmo número)
      const irmaos = await (await fetch(`${SUPA}/rest/v1/brutos?select=drive_id,criado,tipo,ia_tipo&card_id=eq.${encodeURIComponent(b.card_id)}&order=criado.asc,drive_id.asc`, { headers: hdr })).json()
      // conta só as tomadas aproveitáveis: com os descartes no meio, as boas ficariam (2), (4)…
      const lista = (Array.isArray(irmaos) ? irmaos : []).filter((x) => (x.tipo || x.ia_tipo) !== 'erro')
      const pos = lista.findIndex((x) => x.drive_id === drive_id) // 0 = primeira tomada, fica sem sufixo
      const n = pos > 0 ? pos : 0
      alvo = n > 0 ? `${base} (${n + 1})` : base
    }
    // preserva a extensão original
    const m = b.nome && b.nome.match(/\.[a-z0-9]{2,4}$/i)
    const ext = m ? m[0] : ''
    const nomeFinal = ext && !alvo.toLowerCase().endsWith(ext.toLowerCase()) ? alvo + ext : alvo

    // renomeia no Drive
    const token = await driveToken()
    const dr = await fetch(`https://www.googleapis.com/drive/v3/files/${drive_id}?supportsAllDrives=true&fields=id,name`, {
      method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nomeFinal }),
    })
    if (!dr.ok) {
      const msg = dr.status === 403 ? 'Conta de serviço sem permissão de edição no Drive.' : 'Drive ' + dr.status
      return Response.json({ error: msg }, { status: dr.status })
    }

    // atualiza o banco (nome; nome_original só na 1ª renomeação com card)
    const patch = { nome: nomeFinal }
    if (b.card_id && !b.nome_original) patch.nome_original = b.nome
    await fetch(`${SUPA}/rest/v1/brutos?drive_id=eq.${idq}`, {
      method: 'PATCH',
      headers: { ...hdr, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    })
    return Response.json({ ok: true, nome: nomeFinal })
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 500 })
  }
}
