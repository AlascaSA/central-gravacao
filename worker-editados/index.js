// Sincroniza os vídeos EDITADOS (pasta Editados do Drive): filtra meses >= Julho/2026 + a pasta de Cortes,
// a IA gera nome+descrição dos NOVOS, grava na tabela `editados`. Roda por CRON (de hora em hora) e por
// HTTP (botão "Atualizar" → devolve {novos, total}). NÃO mexe em postado/postado_em (isso é do humano).
// Não usa ffmpeg (só listar + IA de texto + Supabase), então roda de graça na Cloudflare — sem GitHub Actions.

const SUPA = 'https://kkvuioyferqbilfwdkqa.supabase.co'
const EDITADOS_ROOT = '1F_9Qd3yDQI-pnWmrxsyDe5a-Z-LJ8N_C'
const PASTA_CORTES = 'Cortes de caixinha - 2026'
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const MIN_ANO = 2026, MIN_MES = 6 // Julho (0-based) de 2026 pra frente

// --- Web Crypto: token do Google (conta de serviço) via JWT RS256 ---
function b64urlBytes(bytes) { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
function b64urlStr(str) { return b64urlBytes(new TextEncoder().encode(str)) }
function pemToDer(pem) { const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''); const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes.buffer }
let _tok = null
async function googleToken(env) {
  const now = Math.floor(Date.now() / 1000)
  if (_tok && _tok.exp - 60 > now) return _tok.token
  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY)
  const claims = { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/drive.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }
  const unsigned = b64urlStr(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64urlStr(JSON.stringify(claims))
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned))
  const jwt = unsigned + '.' + b64urlBytes(new Uint8Array(sig))
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt })
  const d = await r.json()
  if (!d.access_token) throw new Error('google token ' + JSON.stringify(d).slice(0, 150))
  _tok = { token: d.access_token, exp: now + (d.expires_in || 3600) }
  return _tok.token
}

// --- Drive ---
// `parents` entra porque a descida em lote junta filhos de vários pais numa consulta só — é por ele que
// cada vídeo sabe de qual pasta-raiz veio (e portanto se é vídeo ou corte).
// `properties` e `description` vêm junto na própria listagem (sem chamada extra por arquivo): é por
// onde o Renomeador — ou uma pessoa, pelo painel do Drive — diz que a peça é corte SEM mexer no nome.
const FIELDS = 'nextPageToken,files(id,name,mimeType,parents,properties,description,hasThumbnail,thumbnailLink,createdTime,lastModifyingUser(displayName,photoLink))'
const ehDir = (f) => f.mimeType === 'application/vnd.google-apps.folder'
const ehVid = (f) => (f.mimeType || '').includes('video')
function mesAno(nome) { const m = (nome || '').match(/^(\p{L}+)\s*\|\s*(\d{4})/u); if (!m) return null; const mi = MESES.findIndex((x) => x.toLowerCase() === m[1].toLowerCase()); return mi >= 0 ? { ano: Number(m[2]), mes: mi } : null }

// --- Modo CANAIS: <raiz>/<canal>/Audiovisual/<ano>/<ano-mês>/vídeos ---
// Estrutura das pastas de plataforma (01. YOUTUBE, 02. INSTAGRAM, 03. TIKTOK…): o que interessa mora
// só em Audiovisual/<ano>/<ano-mês>. Descemos UM NÍVEL POR VEZ, juntando todos os pais numa consulta
// ('a' in parents or 'b' in parents), pra 13+ canais caberem no limite de subrequests da Cloudflare.
const MIN_ANO_CANAIS = 2026
async function filhosDe(token, ids) {
  const out = []
  for (let i = 0; i < ids.length; i += 15) {
    const q = '(' + ids.slice(i, i + 15).map((id) => `'${id}' in parents`).join(' or ') + ') and trashed=false'
    let page = null
    do {
      const url = 'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=' + encodeURIComponent(FIELDS) + '&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true' + (page ? '&pageToken=' + page : '')
      const d = await (await fetch(url, { headers: { Authorization: 'Bearer ' + token } })).json()
      if (d.error) throw new Error(d.error.message)
      out.push(...(d.files || [])); page = d.nextPageToken
    } while (page)
  }
  return out
}
async function varrerCanais(token, raizId) {
  const canais = (await filhosDe(token, [raizId])).filter(ehDir)
  if (!canais.length) return []
  const avs = (await filhosDe(token, canais.map((c) => c.id))).filter((f) => ehDir(f) && f.name.trim().toLowerCase() === 'audiovisual')
  if (!avs.length) return []
  const anos = (await filhosDe(token, avs.map((f) => f.id))).filter((f) => ehDir(f) && /^\d{4}$/.test(f.name.trim()) && Number(f.name.trim()) >= MIN_ANO_CANAIS)
  if (!anos.length) return []
  const noAno = await filhosDe(token, anos.map((f) => f.id)) // as pastas de mês (2026-07, 2026-08…)
  const meses = noAno.filter(ehDir)
  const vids = noAno.filter(ehVid) // vídeo solto direto no ano também entra
  if (meses.length) vids.push(...(await filhosDe(token, meses.map((f) => f.id))).filter(ehVid))
  return vids.map((v) => ({ ...v, secao: 'video' }))
}
// "corte"/"cortes" no NOME DO ARQUIVO manda mais que a pasta: o editor marca o corte no próprio nome,
// e a peça cai direto na aba Cortes quando for aprovada.
const ehCortePeloNome = (nome) => /\bcortes?\b/i.test(nome || '')

// Tira o código de campanha do fim do nome ("… CONT-2608-S3-REEL.mp4" → "…"). Cópia da mesma regra
// que está em functions/api/editados.js — se mexer em uma, mexa na outra (runtimes separados).
const RE_CODIGO = /\s*[-–]?\s*((\d{4}|PERP)-[A-Z0-9]{2,8}-(CAP|VND|RMK)-AD\d{1,2}[A-Z]?(-[A-Z]{3})?(-(FEED|STORY))?(-V\d+)?|CONT-\d{4}-S\d+(-[A-Z]{3,5})?(-\d+)?)\s*$/i
function limparNome(arq) {
  const semExt = String(arq || '').replace(/\.[a-z0-9]{2,4}$/i, '')
  const limpo = semExt.replace(RE_CODIGO, '').replace(/\s+/g, ' ').trim()
  return limpo || semExt
}

// MARCADOR EXPLÍCITO, sem tocar no nome do arquivo. Duas formas, nessa ordem:
//   properties.secao = "corte" | "video"   → o Renomeador grava no upload (invisível, sobrevive a renomear/mover)
//   descrição do arquivo contendo "corte"  → alguém digita à mão no painel do Drive, sem ferramenta nenhuma
// Devolve 'corte' | 'video' | null (null = ninguém marcou, decide pelo nome/pasta como antes).
function secaoMarcada(f) {
  const p = (f.properties && (f.properties.secao || f.properties.corte)) || ''
  const v = String(p).trim().toLowerCase()
  if (v === 'corte' || v === '1' || v === 'true' || v === 'sim') return 'corte'
  if (v === 'video' || v === 'vídeo' || v === '0' || v === 'false' || v === 'nao' || v === 'não') return 'video'
  if (/\bcortes?\b/i.test(f.description || '')) return 'corte'
  return null
}

// nome base normalizado pra casar editado.nome_arquivo com bruto.nome (mesma peça, extensão/caixa diferentes)
function normNome(s) { return (s || '').normalize('NFC').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/\s+/g, ' ').trim().toLowerCase() }

// --- Groq: nomeia um LOTE de arquivos numa chamada só (Cloudflare limita subrequests por invocação) ---
async function nomeIALote(env, arquivos) {
  const vazio = arquivos.map(() => ({ nome: null, descricao: null }))
  try {
    const lista = arquivos.map((n, i) => `${i}: ${n}`).join('\n')
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + env.GROQ_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-oss-120b', temperature: 0.2, response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: 'Você recebe uma LISTA de nomes de arquivo de vídeos jurídicos editados (Direito Empresarial/Sucessório), um por linha no formato "indice: nome". Devolva SÓ JSON {itens:[{i (o índice), nome (título curto e limpo, SEM códigos/prefixos como [SHORT], CONTEÚDO, VÍDEO, CORTE/CORTES, números, códigos tipo CONT-2607-S5-REEL, ano ou extensão — só o assunto), descricao (1 frase curta sobre o assunto)}]} — um item por linha recebida, na mesma ordem. IMPORTANTE: "corte"/"cortes" no nome do arquivo é só um marcador interno de organização, NÃO é o assunto: nunca use essa palavra no nome nem na descrição.' },
        { role: 'user', content: lista.slice(0, 8000) },
      ] }),
    })
    if (!r.ok) return vazio
    const d = await r.json()
    const parsed = JSON.parse(d.choices[0].message.content)
    const porI = {}
    for (const it of (parsed.itens || [])) porI[it.i] = { nome: (it.nome && String(it.nome).trim()) || null, descricao: (it.descricao && String(it.descricao).trim()) || null }
    return arquivos.map((_, i) => porI[i] || { nome: null, descricao: null })
  } catch { return vazio }
}

// --- Supabase (service key) ---
async function sbGet(env, q) { const r = await fetch(`${SUPA}/rest/v1/${q}`, { headers: { apikey: env.SUPA_SECRET, Authorization: 'Bearer ' + env.SUPA_SECRET } }); try { return await r.json() } catch { return [] } }
async function sbUpsertMany(env, rows) { if (!rows.length) return; const r = await fetch(`${SUPA}/rest/v1/editados`, { method: 'POST', headers: { apikey: env.SUPA_SECRET, Authorization: 'Bearer ' + env.SUPA_SECRET, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) }); if (!r.ok) throw new Error('upsert ' + r.status + ' ' + (await r.text()).slice(0, 200)) }
async function sbDeleteIn(env, ids) { if (!ids.length) return; const lista = ids.map((x) => encodeURIComponent(x)).join(','); const r = await fetch(`${SUPA}/rest/v1/editados?drive_id=in.(${lista})`, { method: 'DELETE', headers: { apikey: env.SUPA_SECRET, Authorization: 'Bearer ' + env.SUPA_SECRET, Prefer: 'return=minimal' } }); if (!r.ok) throw new Error('delete ' + r.status + ' ' + (await r.text()).slice(0, 200)) }

// Varre as pastas Editados de UM time e devolve os vídeos (com secao: 'video' | 'corte'),
// mesma regra de sempre: meses >= Julho/2026 + a pasta de Cortes.
// DESCE UM NÍVEL POR VEZ, juntando todos os pais de cada nível numa consulta só. A versão antiga fazia
// uma chamada ao Drive POR PASTA (recursão): com as pastas novas cadastradas isso passou do limite de
// subrequisições da Cloudflare e o "Atualizar" morria com 500 depois de 30s.
async function varrerTime(token, editadosFolderIds) {
  const raizes = Array.isArray(editadosFolderIds) ? editadosFolderIds : [editadosFolderIds]
  const top = await filhosDe(token, raizes)
  // secao herdada da pasta-raiz: enquanto desce, cada pasta nova herda a seção do pai
  const secaoDaPasta = new Map()
  for (const f of top) {
    if (!ehDir(f)) continue
    if (f.name.trim() === PASTA_CORTES) { secaoDaPasta.set(f.id, 'corte'); continue }
    const ma = mesAno(f.name)
    if (ma && (ma.ano > MIN_ANO || (ma.ano === MIN_ANO && ma.mes >= MIN_MES))) secaoDaPasta.set(f.id, 'video')
  }
  const todos = []
  let nivel = [...secaoDaPasta.keys()]
  for (let d = 0; d < 4 && nivel.length; d++) {
    const filhos = await filhosDe(token, nivel)
    const proximo = []
    for (const f of filhos) {
      const pai = (f.parents || []).find((p) => secaoDaPasta.has(p))
      const secao = pai ? secaoDaPasta.get(pai) : 'video'
      if (ehVid(f)) todos.push({ ...f, secao })
      else if (ehDir(f)) { secaoDaPasta.set(f.id, secao); proximo.push(f.id) }
    }
    nivel = proximo
  }
  return todos
}

// Sincroniza UM time: varre a pasta Editados dele, nomeia os novos (IA), grava e faz o prune — tudo escopado
// no time. Rodar 1 time por invocação evita empilhar os subrequests dos 3 numa chamada só (limite da Cloudflare).
async function sincronizarTime(env, time) {
  // aceita VÁRIAS pastas separadas por vírgula (antigas + novas convivem; nada é tirado ao acrescentar)
  const pastas = (time.editados_folder_id || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!pastas.length) return { novos: 0, total: 0, removidos: 0, removidosNomes: [], autores: [] } // sem pasta: nada a fazer
  const token = await googleToken(env)
  const now = new Date().toISOString()
  // títulos dos cards DESTE time (pro vínculo editado→card) e já-nomeados DESTE time (pra não re-nomear à toa)
  const cardsInfo = await sbGet(env, `cards?select=id,titulo&team=eq.${time.id}`)
  const tituloPorCard = {}
  for (const c of (Array.isArray(cardsInfo) ? cardsInfo : [])) tituloPorCard[c.id] = c.titulo
  const jaTem = await sbGet(env, `editados?select=drive_id,secao&nome_ia=not.is.null&team=eq.${time.id}`)
  const comNome = new Set((Array.isArray(jaTem) ? jaTem : []).map((e) => e.drive_id))
  // secao que já está no banco. Precisa ser REENVIADA no upsert: omitir a coluna não a preserva —
  // o upsert do PostgREST devolve a coluna omitida ao valor padrão, desfazendo quem moveu a peça de aba.
  const secaoAtual = new Map((Array.isArray(jaTem) ? jaTem : []).map((e) => [e.drive_id, e.secao]))

  // "canais:<id>" → estrutura por plataforma (Audiovisual/<ano>/<ano-mês>); sem prefixo → pasta Editados clássica.
  // As clássicas vão TODAS numa varredura só (a descida em lote junta os pais), em vez de uma por pasta.
  const todos = []
  const classicas = pastas.filter((p) => !p.startsWith('canais:'))
  if (classicas.length) todos.push(...(await varrerTime(token, classicas)))
  for (const p of pastas.filter((p) => p.startsWith('canais:'))) todos.push(...(await varrerCanais(token, p.slice(7))))
  // vínculo com card: o editado herda o nome do bruto batizado → bruto.card_id → card. Brutos SÓ deste time.
  const brutosCard = await sbGet(env, `brutos?select=nome,card_id&card_id=not.is.null&team=eq.${time.id}`)
  // brutos batizados como {k: nome normalizado, card_id}. Casa por CONTÊM: o editado costuma ter prefixo
  // (ex.: "CONTEÚDO - 05 - 2026 - SR - {título}") antes do "SR - {título}" que o bruto tem.
  const brutosLista = (Array.isArray(brutosCard) ? brutosCard : [])
    .filter((b) => b.card_id)
    .map((b) => ({ k: normNome(b.nome), card_id: b.card_id }))
    .filter((b) => b.k.length >= 8)
  // card do editado pelo bruto de nome mais específico (mais longo) contido no nome do arquivo; null se ambíguo
  function cardDoEditado(nomeArq) {
    const alvo = normNome(nomeArq)
    let card = null, len = 0, ambiguo = false
    for (const b of brutosLista) {
      if (alvo === b.k || alvo.includes(b.k)) {
        if (b.k.length > len) { card = b.card_id; len = b.k.length; ambiguo = false }
        else if (b.k.length === len && b.card_id !== card) ambiguo = true
      }
    }
    return ambiguo ? null : card
  }

  const novos = todos.filter((v) => !comNome.has(v.id))
  // Só vai pra IA o que o nome do arquivo NÃO resolve. O Renomeador já escreve o apelido de gente na
  // frente ("poderes do inventariante CONT-2608-S3-REEL"): tirar o código dá um nome melhor do que a
  // IA daria, de graça e sem gastar cota da Groq — que é diária e acaba. Sobra a IA pro que vem com
  // nome de câmera (C0123.MP4, IMG_5842, "Meu Filme 7"), que é onde ela realmente ajuda.
  const precisaIA = (nome) => {
    const limpo = limparNome(nome)
    return limpo.split(/\s+/).filter(Boolean).length < 2 || limpo.length < 8 || /^(C\d{3,}|IMG[_-]?\d+|Meu Filme|MVI[_-]?\d+|\d+)/i.test(limpo)
  }
  const nomes = new Map()
  const paraIA = novos.filter((v) => precisaIA(v.name))
  for (let i = 0; i < paraIA.length; i += 18) {
    const chunk = paraIA.slice(i, i + 18)
    const res = await nomeIALote(env, chunk.map((v) => v.name))
    chunk.forEach((v, j) => nomes.set(v.id, res[j]))
  }

  const vistos = new Set(), novosRows = [], existRows = [], tally = {}
  for (const v of todos) {
    if (vistos.has(v.id)) continue // dedup por drive_id
    vistos.add(v.id)
    const thumb = v.hasThumbnail ? v.thumbnailLink : null
    const lmu = v.lastModifyingUser || {}
    const autor_nome = lmu.displayName || null
    const autor_foto = lmu.photoLink || null
    tally[autor_nome || '—'] = (tally[autor_nome || '—'] || 0) + 1 // diagnóstico: quem subiu cada arquivo
    const marcada = secaoMarcada(v)
    const card_id = cardDoEditado(v.name)
    const card_titulo = card_id ? (tituloPorCard[card_id] || null) : null
    if (comNome.has(v.id)) {
      // já nomeado: só refresca thumb/criado/autor/vínculo (SEM nome_ia/descricao, pra preservar)
      // já nomeado: mantém a secao que está no banco (respeita quem moveu a peça de aba à mão)
      // marcador explícito manda sempre (é instrução, não palpite); sem ele, respeita quem moveu de aba na Central
      existRows.push({ drive_id: v.id, nome_arquivo: v.name, secao: marcada ?? secaoAtual.get(v.id) ?? v.secao, thumb, criado: v.createdTime || null, atualizado_em: now, autor_nome, autor_foto, card_id, card_titulo, team: time.id })
    } else {
      const n = nomes.get(v.id) || { nome: null, descricao: null }
      // arquivo novo: marcador > palavra no nome > pasta
      const secao = marcada ?? (ehCortePeloNome(v.name) ? 'corte' : v.secao)
      novosRows.push({ drive_id: v.id, nome_arquivo: v.name, secao, thumb, criado: v.createdTime || null, atualizado_em: now, nome_ia: n.nome, descricao: n.descricao, autor_nome, autor_foto, card_id, card_titulo, team: time.id })
    }
  }
  // dois upserts com chaves uniformes cada (PostgREST exige mesmas chaves no lote)
  await sbUpsertMany(env, novosRows)
  await sbUpsertMany(env, existRows)

  // PRUNE DESTE time: tira da página o que sumiu do Drive (re-upload deixa o antigo órfão). Preserva postados.
  // Se a varredura vier vazia (possível erro/pasta indisponível), NÃO prune — evita apagar tudo por engano.
  let removidos = 0
  const removidosNomes = []
  const idsAtuais = new Set(todos.map((v) => v.id))
  if (idsAtuais.size > 0) {
    const naBase = await sbGet(env, `editados?select=drive_id,nome_arquivo,postado&team=eq.${time.id}`)
    const orfaos = (Array.isArray(naBase) ? naBase : []).filter((e) => !idsAtuais.has(e.drive_id) && !e.postado)
    if (orfaos.length > 0) {
      await sbDeleteIn(env, orfaos.map((e) => e.drive_id))
      removidos = orfaos.length
      for (const e of orfaos) removidosNomes.push(e.nome_arquivo)
    }
  }
  return { novos: novosRows.length, total: todos.length, removidos, removidosNomes, autores: Object.entries(tally).sort((a, b) => b[1] - a[1]) }
}

// Times ativos COM pasta de editados, em ordem estável (pro round-robin do cron).
async function timesComPasta(env) {
  const t = await sbGet(env, 'teams?select=id,editados_folder_id&ativo=eq.true&editados_folder_id=not.is.null&order=ordem')
  return Array.isArray(t) ? t : []
}

// Junta as stats de vários times (fetch manual sem team = fallback que roda todos).
function agrega(rs) {
  const out = { novos: 0, total: 0, removidos: 0, removidosNomes: [], autores: [] }
  const tally = {}
  for (const r of rs) {
    out.novos += r.novos; out.total += r.total; out.removidos += r.removidos
    out.removidosNomes.push(...r.removidosNomes)
    for (const [k, v] of r.autores) tally[k] = (tally[k] || 0) + v
  }
  out.autores = Object.entries(tally).sort((a, b) => b[1] - a[1])
  return out
}

export default {
  // CRON (a cada 20 min): sincroniza UM time por vez, em round-robin, pra não empilhar os subrequests dos
  // times numa rodada só. Com N times-com-pasta, cada um é sincronizado a cada N×20 min (3 times → de hora em hora).
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const times = await timesComPasta(env)
      if (!times.length) return
      const bucket = Math.floor((event.scheduledTime || Date.now()) / (20 * 60 * 1000))
      await sincronizarTime(env, times[bucket % times.length]).catch(() => {})
    })())
  },
  // HTTP (botão "Atualizar"): ?team=<id> sincroniza SÓ esse time; sem team, todos (fallback pra chamada manual).
  async fetch(request, env) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
    try {
      const teamId = new URL(request.url).searchParams.get('team')
      const times = await timesComPasta(env)
      const alvos = teamId ? times.filter((t) => t.id === teamId) : times
      const rs = []
      for (const t of alvos) rs.push(await sincronizarTime(env, t))
      return new Response(JSON.stringify(agrega(rs)), { headers: { 'Content-Type': 'application/json', ...cors } })
    } catch (e) {
      return new Response(JSON.stringify({ error: String((e && e.message) || e) }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } })
    }
  },
}
