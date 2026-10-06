import { extrairTexto } from './_texto.js'

// IA (Groq) que lê o doc de roteiros e destrincha em vários vídeos (cards).
const GROQ_MODEL = 'openai/gpt-oss-120b'

async function chamarGroq(env, texto, copy) {
  const sys =
    'Voce recebe o texto de um documento de roteiros de uma equipe de producao de video (copy responsavel: ' +
    (copy || 'desconhecida') + ').\n' +
    'Extraia CADA video individual presente no documento.\n' +
    'Responda SOMENTE em JSON valido no formato:\n' +
    '{"videos":[{"titulo":"...","campanha":"...","inicio":"..."}]}\n' +
    'Regras:\n' +
    '- "titulo": titulo curto e claro do video (ate ~8 palavras).\n' +
    '- "campanha": a campanha/categoria se aparecer no documento, senao "".\n' +
    '- "inicio": as PRIMEIRAS 10 PALAVRAS do roteiro daquele video, copiadas EXATAMENTE do documento ' +
    '(nao resuma, nao reescreva) — e por elas que o roteiro completo e recortado depois.\n' +
    '- Se o documento for de um unico video, retorne UM item.\n' +
    '- Nao invente videos que nao estao no texto. Nada fora do JSON.'

  // TEXTO INTEIRO até 28 mil caracteres (~7 mil tokens). Raciocínio BAIXO e teto de saída: com o
  // raciocínio padrão o gpt-oss esvaziava a resposta e a Groq devolvia "json_validate_failed" — o
  // PDF "Leva 1 - ADS Vídeo (Fora do Padrão) - MBFV" falhou 4 de 4 assim e acertou 4 de 4 (10 vídeos)
  // com raciocínio baixo (02/10/2026). O teto respeita os 8 mil tokens/min da conta grátis, que
  // contam o pedido inteiro (texto + saída reservada).
  const doc = String(texto).slice(0, 28000)
  const estPedido = Math.ceil(doc.length / 3.5) + 500
  const teto = Math.max(1500, Math.min(4000, 7900 - estPedido))
  const pedir = (modelo) =>
    fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.GROQ_API_KEY },
      body: JSON.stringify({
        model: modelo,
        temperature: 0.2,
        reasoning_effort: 'low',
        max_completion_tokens: teto,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: sys }, { role: 'user', content: doc }],
      }),
    })
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

  // Falha de JSON é sorteio do modelo: repete o MESMO pedido (cortar o documento só perdia vídeos).
  // Limite por minuto: espera o que a Groq pedir. Se o 120b não der, o 20b tem cota própria.
  let resp
  const tentativas = [GROQ_MODEL, GROQ_MODEL, 'openai/gpt-oss-20b']
  for (let i = 0; i < tentativas.length; i++) {
    resp = await pedir(tentativas[i])
    if (resp.status === 429) {
      await dormir(Math.min(Number(resp.headers.get('retry-after') || 3), 10) * 1000)
      resp = await pedir(tentativas[i])
    }
    if (resp.ok) {
      const d = await resp.clone().json().catch(() => null)
      const txt = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content
      if (txt) { try { JSON.parse(txt); break } catch { /* JSON inválido apesar do 200: tenta de novo */ } }
    }
  }
  if (!resp.ok) {
    const t = await resp.text()
    console.log('Groq ' + resp.status + ': ' + t.slice(0, 300))
    throw new Error(resp.status === 429
      ? 'A IA está no limite de uso por minuto. Espere 1 minuto e suba o documento de novo.'
      : 'A IA não conseguiu ler este documento agora (' + resp.status + '). Tente de novo em instantes.')
  }
  const data = await resp.json()
  const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '{}'
  let parsed
  try { parsed = JSON.parse(content) } catch { parsed = { videos: [] } }
  const videos = (Array.isArray(parsed.videos) ? parsed.videos : []).slice(0, 50)

  // O ROTEIRO É RECORTADO AQUI, não devolvido pela IA. Antes o prompt pedia o texto inteiro de volta
  // dentro do JSON: num documento longo (VSL) a resposta estourava o limite de saída e o JSON vinha
  // cortado — "completion tokens reached before generating a valid document". Agora a IA devolve só
  // as primeiras palavras de cada vídeo e nós fatiamos o documento original entre uma marca e a outra.
  // Comparação só por LETRAS E NÚMEROS (sem acento, pontuação nem caixa): a IA copia o começo da
  // fala com uma vírgula ou aspas diferentes e o trecho não era achado — o roteiro daquele vídeo ia
  // parar no card anterior. Cada letra do texto comparado aponta pra posição dela no original.
  const base = (c) => c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const plano = []
  const mapa = []
  {
    let espaco = true
    for (let i = 0; i < texto.length; i++) {
      const b = base(texto[i])
      if (/[a-z0-9]/.test(b)) { plano.push(b[0]); mapa.push(i); espaco = false }
      else if (!espaco) { plano.push(' '); mapa.push(i); espaco = true }
    }
  }
  const alvo = plano.join('')
  const limpar = (t) => Array.from(String(t || '')).map(base).join('').replace(/[^a-z0-9]+/g, ' ').trim()
  // procura com as 10 palavras; se não achar, com 7, depois 5 (a IA às vezes troca uma palavra no fim)
  const achar = (inicio) => {
    const pal = limpar(inicio).split(' ').filter(Boolean)
    for (const n of [10, 7, 5]) {
      const trecho = pal.slice(0, n).join(' ')
      if (trecho.length < 12) continue
      const pos = alvo.indexOf(trecho)
      if (pos >= 0) return pos
    }
    return -1
  }
  const marcas = videos.map((v) => achar(v.inicio))
  const paraOriginal = (pos) => (pos < 0 ? -1 : mapa[Math.min(pos, mapa.length - 1)] ?? -1)

  return videos.map((v, i) => {
    let roteiro = ''
    const de = paraOriginal(marcas[i])
    if (de >= 0) {
      // vai até a marca do próximo vídeo que foi encontrada (ou até o fim do documento)
      let ate = texto.length
      for (let j = i + 1; j < marcas.length; j++) {
        const p = paraOriginal(marcas[j])
        if (p > de) { ate = p; break }
      }
      roteiro = texto.slice(de, ate).trim()
    }
    return {
      titulo: String(v.titulo || '').trim() || 'Sem titulo',
      campanha: String(v.campanha || '').trim(),
      roteiro,
    }
  })
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return Response.json({ error: 'Metodo nao permitido' }, { status: 405 })
  try {
    const body = await request.json().catch(() => ({}))
    const { url, nome, copy } = body
    if (!url) return Response.json({ error: 'Falta a url do arquivo' }, { status: 400 })
    if (!env.GROQ_API_KEY) return Response.json({ error: 'GROQ_API_KEY nao configurada' }, { status: 500 })

    const r = await fetch(url)
    if (!r.ok) return Response.json({ error: 'Nao consegui baixar o arquivo' }, { status: 400 })
    const buf = await r.arrayBuffer()

    const texto = (await extrairTexto(buf, nome)).trim()
    if (!texto) return Response.json({ videos: [], aviso: 'Nao consegui ler texto do arquivo' })

    const videos = await chamarGroq(env, texto, copy)
    return Response.json({ videos })
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 500 })
  }
}
