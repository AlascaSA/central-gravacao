import { SUPA_URL } from './_util.js'

// Recebe o TEXTO de um roteiro e casa cada peça dele com as tomadas já gravadas, comparando com a
// transcrição de cada bruto. Devolve propostas (peça → tomadas) pra virarem tarefas na fila de
// revisão. Não grava nada aqui: quem cria é o app, e nada entra no fluxo sem alguém aprovar.
const GROQ_MODEL = 'openai/gpt-oss-120b'
const MAX_BRUTOS = 60
// O gpt-oss-120b tem teto de 8 mil tokens/min: 60 tomadas com 380 caracteres cada mais o
// roteiro inteiro passavam de 9 mil e tomavam 429. Com 240 caracteres por tomada o pedido
// fica em ~6,5 mil e a fala continua identificável — corta o excesso, não a cobertura.

export async function onRequest({ request, env }) {
  try {
    if (request.method !== 'POST') return Response.json({ error: 'método inválido' }, { status: 405 })
    const { texto, team, dia, mes } = await request.json().catch(() => ({}))
    if (!texto || String(texto).trim().length < 40) return Response.json({ error: 'cole o texto do roteiro' }, { status: 400 })
    if (!env.GROQ_API_KEY) return Response.json({ error: 'GROQ_API_KEY ausente' }, { status: 500 })

    const S = SUPA_URL(env), KEY = env.VITE_SUPABASE_ANON_KEY
    const hdr = { apikey: KEY, Authorization: 'Bearer ' + KEY }

    // só tomadas SEM tarefa e COM transcrição — o resto não tem como casar nem precisa
    let q = `brutos?select=drive_id,nome,duracao,transcricao,tipo,ia_tipo&team=eq.${encodeURIComponent(team || 'jaylton')}&card_id=is.null&transcricao=not.is.null&order=criado.asc`
    if (dia) q += `&dia=eq.${encodeURIComponent(dia)}`
    if (mes) q += `&mes=eq.${encodeURIComponent(mes)}`
    const brutos = await (await fetch(`${S}/rest/v1/${q}`, { headers: hdr })).json()
    if (!Array.isArray(brutos) || !brutos.length) return Response.json({ error: 'nenhuma tomada solta com transcrição nesse período' }, { status: 404 })

    const lista = brutos.slice(0, MAX_BRUTOS)
    const resumo = lista.map((b, i) => `[${i}] ${b.nome} (${b.duracao || '?'}s, ${b.tipo || b.ia_tipo || 'sem etiqueta'}): "${String(b.transcricao).slice(0, 240)}"`).join('\n')

    const sys = `Você casa PEÇAS DE ROTEIRO com as TOMADAS gravadas de um criador jurídico.
Cada peça do roteiro pode ter várias tomadas (o professor repete até acertar; as ruins ficam marcadas como "erro").
Responda SÓ JSON: {"pecas":[{"titulo","tomadas":[índices],"trecho"}]}.

"titulo" é o APELIDO da peça, tirado do QUE ELA DIZ — nunca copie o rótulo da seção do documento
(ACOMPANHAMENTO, SOLUÇÃO, OPORTUNIDADE, AD01, CTA…), esses nomes não dizem nada pra quem edita.
Ex.: uma peça sobre tempo perdido em tarefa operacional vira "tarefa operacional consome tempo".
Regras: 2 a 4 palavras, em português correto e ACENTUADO, minúsculas, só letras e espaços;
sem números, sem código, sem nome de produto e sem as palavras "vídeo"/"anúncio"/"reel".

"tomadas" são os índices [n] cuja FALA é claramente o texto daquela peça — mesmas ideias e palavras.
Inclua também as tomadas ruins da mesma peça (são as regravações dela).
NÃO case por tema parecido: um vídeo longo de outro assunto (aula, VSL, entrevista) que por acaso
toca no mesmo tema NÃO é a peça. Na dúvida, deixe de fora — é melhor faltar do que casar errado.
Uma tomada pertence a no máximo uma peça.

CONFIRA A DURAÇÃO antes de casar: o texto da peça, lido em voz alta, dá a duração esperada
(~150 palavras por minuto). Uma tomada muito mais longa que isso é outra coisa — um anúncio de
poucos parágrafos nunca é uma tomada de 10, 15 ou 20 minutos, por mais que o assunto pareça o mesmo.

"trecho" é a primeira linha do roteiro daquela peça, pra pessoa conferir.
Se nada casar com segurança, devolva {"pecas":[]}.`

    // ROTEIRO EM PARTES: antes só os primeiros 7 mil caracteres eram lidos — num documento de 20 mil
    // (sete esquetes) só o primeiro anúncio era casado. Cada parte vai numa chamada (o teto é 8 mil
    // tokens/min) e a tomada que já foi casada sai das partes seguintes.
    const partes = []
    {
      let atual = ''
      for (const par of String(texto).split(/\n\s*\n/)) {
        if (atual && (atual.length + par.length) > 5500) { partes.push(atual); atual = '' }
        atual += (atual ? '\n\n' : '') + par
      }
      if (atual.trim()) partes.push(atual)
    }
    const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
    const pedir = (roteiro) => fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.GROQ_API_KEY },
      // raciocínio baixo: com o padrão o gpt-oss esvaziava a resposta ("json_validate_failed")
      body: JSON.stringify({ model: GROQ_MODEL, temperature: 0.2, reasoning_effort: 'low', max_completion_tokens: 1500, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: sys }, { role: 'user', content: `ROTEIRO:\n${roteiro.slice(0, 6000)}\n\nTOMADAS DISPONÍVEIS:\n${resumo}` }] }),
    })
    const parsed = { pecas: [] }
    const usadas = new Set()
    for (const parte of partes.slice(0, 8)) {
      let r = null, ok = null
      for (let t = 0; t < 3 && !ok; t++) {
        r = await pedir(parte)
        if (r.status === 429) { await dormir(Math.min(Number(r.headers.get('retry-after') || 5), 20) * 1000); continue }
        if (!r.ok) continue
        const d = await r.json().catch(() => null)
        try { ok = JSON.parse(d.choices[0].message.content) } catch { ok = null }
      }
      if (!ok) continue
      for (const p of ok.pecas || []) {
        const tomadas = (p.tomadas || []).filter((i) => !usadas.has(Number(i)))
        tomadas.forEach((i) => usadas.add(Number(i)))
        if (tomadas.length) parsed.pecas.push({ ...p, tomadas })
      }
    }

    const pecas = (parsed.pecas || [])
      .map((p) => ({
        titulo: String(p.titulo || '').trim(),
        trecho: String(p.trecho || '').slice(0, 160),
        tomadas: (p.tomadas || [])
          .map((i) => lista[Number(i)])
          .filter(Boolean)
          .map((b) => ({ drive_id: b.drive_id, nome: b.nome, seg: b.duracao, tipo: b.tipo || b.ia_tipo })),
      }))
      .filter((p) => p.titulo && p.tomadas.length)

    return Response.json({ pecas, analisadas: lista.length, total: brutos.length })
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 500 })
  }
}
