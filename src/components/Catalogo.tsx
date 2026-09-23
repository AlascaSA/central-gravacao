import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { listarBrutos, renomearBruto, type Bruto } from '../data/brutos'
import { listarClassificacoes, confirmarTipo, ligarBruto, batizar, rejeitarSugestao, definirProdutoBruto, unirBrutos, irmaosDoGrupo, comentarBruto, listarDivisoes, renomearDivisao, moverParaDivisao, juntarDivisao, criarDivisao, moverVariosParaDivisao, type Classificacao, type TipoBruto, type Divisao } from '../data/catalogoBrutos'
import { getTeam, listarTimes } from '../data/team'
import { store } from '../data/store'
import ProdutoPicker from './ProdutoPicker'
import { CATEGORIAS, copysDoTime, type Card, type Categoria, type Copy } from '../types'
import { semanaDeGravacao } from '../week'
import { gravarParams, lerParam } from '../urlEstado'
import CasarRoteiro from './CasarRoteiro'

// download via worker da Cloudflare (link assinado): sem aviso de vírus, qualquer tamanho.
const baixarUrl = (b: Bruto) => `/api/download-url?id=${b.id}&name=${encodeURIComponent(b.nome)}`
// player: sempre o do próprio Drive (logado)
const drivePreview = (id: string) => `https://drive.google.com/file/d/${id}/preview`

const TIPOS: TipoBruto[] = ['boa', 'erro', 'gancho', 'complemento']
const TIPO_META: Record<TipoBruto, { label: string; badge: string; dot: string; btn: string }> = {
  boa: { label: 'Boa', badge: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30', dot: 'bg-emerald-400', btn: 'bg-emerald-500 border-emerald-500 text-white' },
  erro: { label: 'Erro', badge: 'text-rose-300 bg-rose-500/15 border-rose-500/30', dot: 'bg-rose-400', btn: 'bg-rose-500 border-rose-500 text-white' },
  gancho: { label: 'Gancho', badge: 'text-sky-300 bg-sky-500/15 border-sky-500/30', dot: 'bg-sky-400', btn: 'bg-sky-500 border-sky-500 text-white' },
  complemento: { label: 'Compl.', badge: 'text-amber-300 bg-amber-500/15 border-amber-500/30', dot: 'bg-amber-400', btn: 'bg-amber-500 border-amber-500 text-white' },
}

function fmtDur(seg: number | null): string {
  if (seg == null) return '–'
  const m = Math.floor(seg / 60)
  const s = seg % 60
  return m + ':' + String(s).padStart(2, '0')
}

// número do clipe da câmera (C0106 → 106, ou "06.mp4" → 6) pra ordenar na sequência de gravação.
// Nome renomeado (sem número no começo) vai pro fim.
function numDoClipe(nome: string): number {
  const s = (nome || '').trim()
  const m = s.match(/^C0*(\d+)/i) || s.match(/^0*(\d+)/)
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER
}

// pasta mês/dia: usa a PASTA REAL do Drive (b.mes/b.dia) quando existir; senão, a data do vídeo
const MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
function mesDiaDe(b: Bruto): { mes: string; dia: string; mesOrd: number; diaOrd: number } {
  if (b.mes && b.dia) {
    const iMes = MESES_PT.findIndex((m) => b.mes!.startsWith(m))
    const ano = parseInt((b.mes.match(/\d{4}/) || ['0'])[0], 10)
    return { mes: b.mes, dia: b.dia, mesOrd: ano * 12 + (iMes >= 0 ? iMes : 0), diaOrd: parseInt(b.dia, 10) || 0 }
  }
  const d = b.criado ? new Date(b.criado) : null
  if (!d || isNaN(d.getTime())) return { mes: 'Sem data', dia: '—', mesOrd: -1, diaOrd: -1 }
  return {
    mes: MESES_PT[d.getMonth()] + ' ' + d.getFullYear(),
    dia: String(d.getDate()).padStart(2, '0'),
    mesOrd: d.getFullYear() * 12 + d.getMonth(),
    diaOrd: d.getDate(),
  }
}

function FolderCard({ label, sub, onClick }: { label: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group text-left rounded-2xl border border-border bg-surface p-3 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[0_10px_30px_-8px_rgba(0,0,0,0.6)] transition-all">
      <div className="aspect-video rounded-xl bg-surface-2 border border-border grid place-items-center mb-2 text-brand-2/80 group-hover:text-brand-2 transition-colors">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" /></svg>
      </div>
      <div className="text-[14px] font-bold truncate">{label}</div>
      <div className="text-[12px] text-muted mt-0.5">{sub}</div>
    </button>
  )
}

// Um vídeo do projeto dentro da gravação: todos os takes dele (bons e ruins), com o nome editável.
// Clicar no nome troca por um campo; Enter ou sair do campo salva, Esc desiste.
function SecaoVideo({ nome, editavel, videos, classif, onRenomear, onJuntarAcima, destacado, onArrastarSobre, onSoltar, children }: {
  nome: string
  editavel: boolean
  videos: Bruto[]
  classif: Record<string, Classificacao>
  onRenomear: (nome: string) => void
  /** junta este vídeo ao de cima (a IA dividiu demais); ausente no primeiro */
  onJuntarAcima?: () => void
  destacado?: boolean
  onArrastarSobre?: () => void
  onSoltar?: (e: React.DragEvent) => void
  children: React.ReactNode
}) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(nome)
  useEffect(() => { if (!editando) setValor(nome) }, [nome, editando])
  const salvar = () => {
    setEditando(false)
    const v = valor.trim()
    if (v && v !== nome) onRenomear(v)
  }
  let bons = 0, erros = 0, semFala = 0
  for (const v of videos) {
    const c = classif[v.id]
    const t = c?.tipo || c?.ia_tipo
    if (t === 'erro') erros++
    else if (t) bons++
    else if (String(c?.ia_motivo || '').startsWith('sem fala')) semFala++
  }
  return (
    <section
      onDragOver={onSoltar ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onArrastarSobre?.() } : undefined}
      onDrop={onSoltar ? (e) => { e.preventDefault(); onSoltar(e) } : undefined}
      className={'rounded-2xl transition-colors ' + (destacado ? 'bg-brand/8 outline outline-2 outline-offset-8 outline-brand/60' : '')}
    >
      <div className="flex items-center gap-2.5 mb-3 flex-wrap">
        {editando ? (
          <input
            autoFocus
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onBlur={salvar}
            onKeyDown={(e) => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') { setValor(nome); setEditando(false) } }}
            aria-label="Nome do vídeo"
            className="h-9 w-full sm:w-auto sm:min-w-[280px] rounded-lg bg-surface-2 border border-brand/60 px-2.5 text-[16px] font-bold text-ink outline-none"
          />
        ) : (
          <button
            type="button"
            disabled={!editavel}
            onClick={() => setEditando(true)}
            title={editavel ? 'Renomear este vídeo' : undefined}
            className="group/nome inline-flex items-center gap-1.5 min-h-9 rounded-lg -ml-1.5 px-1.5 text-[16px] font-bold text-ink tracking-[-0.01em] enabled:hover:bg-surface-2 transition-colors"
          >
            {nome}
            {editavel && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted opacity-60 group-hover/nome:opacity-100 transition-opacity"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            )}
          </button>
        )}
        <span className="tnum text-[11px] font-bold text-brand-2 bg-brand/12 rounded-full px-2 py-0.5">{videos.length}</span>
        <span className="tnum flex items-center gap-2.5 text-[12px] text-muted">
          {bons > 0 && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{bons} {bons > 1 ? 'bons' : 'bom'}</span>}
          {erros > 0 && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-rose-400" />{erros} erro{erros > 1 ? 's' : ''}</span>}
          {semFala > 0 && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-white/40" />{semFala} sem fala</span>}
        </span>
        <span className="h-px flex-1 min-w-6 bg-border" />
        {onJuntarAcima && (
          <button
            type="button"
            onClick={onJuntarAcima}
            title="Os takes deste vídeo passam para o vídeo de cima"
            className="inline-flex items-center gap-1.5 h-8 rounded-lg border border-border bg-surface px-2.5 text-[12px] font-semibold text-muted hover:text-ink hover:border-border-strong transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg>
            Juntar com o de cima
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">{children}</div>
    </section>
  )
}

function Chevron() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted"><path d="M9 18l6-6-6-6" /></svg>
}

export default function Catalogo() {
  const [brutos, setBrutos] = useState<Bruto[] | null>(null)
  const [erro, setErro] = useState('')
  const [idx, setIdx] = useState<number | null>(null)
  const [classif, setClassif] = useState<Record<string, Classificacao>>({})
  const [divisoes, setDivisoes] = useState<Divisao[]>([]) // vídeos do projeto dentro de cada gravação
  const [salvandoTipo, setSalvandoTipo] = useState(false)
  const [cards, setCards] = useState<Card[]>([])
  const [linkOpen, setLinkOpen] = useState(false)
  const [buscaCard, setBuscaCard] = useState('')
  const [novaTarefa, setNovaTarefa] = useState('')
  const [novaCat, setNovaCat] = useState<Categoria>('Conteúdo')
  const [novaCopy, setNovaCopy] = useState<Copy | undefined>(undefined)
  const [ligando, setLigando] = useState(false)
  // a pasta aberta vive na URL (?mes=&dia=): recarregar continua aqui e o link pode ser compartilhado
  const [nav, setNav] = useState<{ mes: string | null; dia: string | null }>(() => ({ mes: lerParam('mes'), dia: lerParam('dia') }))
  function irPara(mes: string | null, dia: string | null) {
    setNav({ mes, dia })
    setIdx(null)
    gravarParams({ mes, dia })
  }
  const [proc, setProc] = useState<'idle' | 'indo' | 'ok' | 'erro'>('idle')
  const [procFase, setProcFase] = useState('')
  const [procPct, setProcPct] = useState(0)
  const [pastaLink, setPastaLink] = useState('')
  // pasta de brutos do time ativo (da tabela teams). "Processar novos" varre SÓ ela — nunca o Drive inteiro,
  // pra não sugar (e marcar como deste time) os brutos dos outros professores.
  const [brutosPadrao, setBrutosPadrao] = useState<string | null>(null)
  // Rodada da IA em andamento — detectada no GitHub, então continua aparecendo mesmo se recarregar a
  // página (antes o estado morria com o F5 e não dava pra saber se ainda estava identificando).
  const [iaRodando, setIaRodando] = useState<{ fase: string } | null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const creepRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const alvoRef = useRef(0)
  function pararPoll() {
    if (pollRef.current) clearTimeout(pollRef.current)
    if (creepRef.current) clearInterval(creepRef.current)
    pollRef.current = null
    creepRef.current = null
  }
  useEffect(() => () => pararPoll(), [])

  // traduz a resposta do /api/processar-status numa fase amigável + % (base real dos passos concluídos)
  function mapFase(d: { status: string; conclusion?: string; step?: string | null; stepIndex?: number; totalSteps?: number }): { fase: string; pct: number } {
    if (d.status === 'pending' || d.status === 'queued') return { fase: 'Na fila do GitHub…', pct: 8 }
    if (d.status === 'completed') return { fase: d.conclusion === 'success' ? 'Concluído' : 'Falhou no GitHub', pct: 100 }
    const s = (d.step || '').toLowerCase()
    let fase = 'Preparando o ambiente…'
    if (s.includes('capa')) fase = 'Gerando capas dos vídeos…'
    else if (s.includes('prox')) fase = 'Gerando prévias 720p…'
    else if (s.includes('classificar') || s.includes('ia')) fase = 'IA transcrevendo e classificando…'
    const base = d.totalSteps ? Math.round(((d.stepIndex || 0) / d.totalSteps) * 100) : 15
    return { fase, pct: Math.max(12, base) }
  }

  // acompanha a rodada da Action (a cada 5s) até concluir; recarrega os brutos no fim
  async function acompanhar(dispatchMs: number, tentativas = 0) {
    try {
      const d = await (await fetch('/api/processar-status?since=' + dispatchMs)).json()
      if (d.status === 'completed') {
        pararPoll()
        alvoRef.current = 100
        setProcPct(100)
        const ok = d.conclusion === 'success'
        setProcFase(ok ? 'Concluído' : 'Falhou no GitHub')
        setProc(ok ? 'ok' : 'erro')
        listarBrutos().then(setBrutos).catch(() => {}) // os novos já entraram no banco
        listarClassificacoes().then(setClassif).catch(() => {}); listarDivisoes().then(setDivisoes).catch(() => {})
        setTimeout(() => { setProc('idle'); setProcFase(''); setProcPct(0) }, 7000)
        return
      }
      const { fase, pct } = mapFase(d)
      setProcFase(fase)
      alvoRef.current = pct
      setProcPct((p) => Math.max(p, pct))
    } catch {
      /* erro de rede momentâneo: tenta de novo no próximo ciclo */
    }
    if (tentativas > 180) { pararPoll(); setProc('idle'); setProcFase('') ; return } // ~15min de teto
    pollRef.current = setTimeout(() => acompanhar(dispatchMs, tentativas + 1), 5000)
  }

  async function processarNovos(pasta?: string) {
    pararPoll()
    setProc('indo')
    setProcFase('Disparando no GitHub…')
    setProcPct(4)
    alvoRef.current = 4
    const dispatchMs = Date.now()
    try {
      // sempre manda o time ativo (grava na coluna team dos brutos do lote)
      // sem link manual, usa a pasta do time (nunca varre o Drive todo). Vazio só se o time não tiver pasta.
      const alvo = (pasta ?? brutosPadrao ?? '').trim()
      const qs = (alvo ? 'pasta=' + encodeURIComponent(alvo) + '&' : '') + 'team=' + encodeURIComponent(getTeam())
      const r = await fetch('/api/processar-brutos?' + qs, { method: 'POST' })
      if (!r.ok) { setProc('erro'); setProcFase(''); setTimeout(() => setProc('idle'), 5000); return }
      if (pasta) setPastaLink('')
      setProcFase('Na fila do GitHub…')
      setProcPct(8)
      alvoRef.current = 8
      // creep suave entre os polls: nunca parece travado (sobe devagar rumo ao alvo da fase + um pouco)
      creepRef.current = setInterval(() => setProcPct((p) => (p >= 99 ? p : Math.min(p + 0.4, alvoRef.current + 5))), 1200)
      acompanhar(dispatchMs)
    } catch {
      setProc('erro')
      setProcFase('')
      setTimeout(() => setProc('idle'), 5000)
    }
  }

  useEffect(() => {
    listarBrutos()
      .then(setBrutos)
      .catch((e) => setErro(e instanceof Error ? e.message : 'erro'))
    listarClassificacoes().then(setClassif).catch(() => {}); listarDivisoes().then(setDivisoes).catch(() => {})
    store.listCards().then(setCards).catch(() => {})
  }, [])

  // Detecta rodada da IA em andamento (inclusive uma disparada antes de recarregar a página) e
  // acompanha até acabar, atualizando a lista sozinho. Sem isso, ao dar F5 os vídeos apareciam sem
  // etiqueta e não dava pra saber se a IA ainda estava trabalhando ou se tinha parado.
  useEffect(() => {
    let vivo = true
    let timer: ReturnType<typeof setTimeout> | null = null
    async function ver() {
      try {
        const d = await (await fetch('/api/processar-status')).json()
        if (!vivo) return
        const ativo = d.status === 'queued' || d.status === 'in_progress'
        if (ativo) {
          setIaRodando({ fase: mapFase(d).fase })
          timer = setTimeout(ver, 12000)
        } else {
          setIaRodando((antes) => {
            // acabou de terminar (estava rodando e agora não está): recarrega pra trazer as etiquetas
            if (antes) {
              listarBrutos().then(setBrutos).catch(() => {})
              listarClassificacoes().then(setClassif).catch(() => {}); listarDivisoes().then(setDivisoes).catch(() => {})
            }
            return null
          })
          timer = setTimeout(ver, 45000)
        }
      } catch {
        if (vivo) timer = setTimeout(ver, 45000)
      }
    }
    ver()
    return () => { vivo = false; if (timer) clearTimeout(timer) }
  }, [])

  // pré-preenche o campo de pasta com a pasta de brutos do time ativo (se o campo estiver vazio)
  useEffect(() => {
    listarTimes()
      .then((times) => {
        const t = times.find((x) => x.id === getTeam())
        if (t?.brutosFolderId) setBrutosPadrao(t.brutosFolderId)
      })
      .catch(() => {})
  }, [])

  // une as tomadas selecionadas num grupo (ver data/catalogoBrutos.ts)
  const [unindo, setUnindo] = useState(false)
  async function unirSelecionados() {
    const ids = [...sel]
    if (ids.length < 2 || unindo) return
    setUnindo(true)
    const g = await unirBrutos(ids).catch(() => null)
    setUnindo(false)
    if (!g) {
      setAvisoNome('Não consegui unir. A coluna grupo_id já existe no banco?')
      setTimeout(() => setAvisoNome(''), 6000)
      return
    }
    setClassif((m) => {
      const n = { ...m }
      for (const x of ids) n[x] = { ...(n[x] || { drive_id: x }), grupo_id: g } as Classificacao
      return n
    })
    setSel(new Set())

    // Se ALGUÉM do grupo já estava ligado a um card, os outros vão junto agora — e ganham o nome dele.
    // Sem isso a união era torta: ligar-depois-unir espalhava, unir-depois-ligar não.
    const cards_ = [...new Set(ids.map((x) => classif[x]?.card_id).filter(Boolean))] as string[]
    if (cards_.length > 1) {
      setAvisoNome('Unidas, mas há tomadas em cards diferentes — desligue uma antes de eu igualar os nomes.')
      setTimeout(() => setAvisoNome(''), 7000)
      return
    }
    if (cards_.length === 1) {
      const cardId = cards_[0]
      setAvisoNome('Unindo ao card e renomeando…')
      for (const x of ids) if (classif[x]?.card_id !== cardId) await ligarBruto(x, cardId).catch(() => {})
      setClassif((m) => {
        const n = { ...m }
        for (const x of ids) n[x] = { ...(n[x] || { drive_id: x }), card_id: cardId } as Classificacao
        return n
      })
      // rebatiza TODAS (inclusive a que já tinha nome): a numeração das irmãs muda quando o grupo cresce
      for (const x of ids) {
        const novo = await batizar(x)
        if (novo) setBrutos((bs) => (bs ? bs.map((b) => (b.id === x ? { ...b, nome: novo } : b)) : bs))
      }
      setAvisoNome(`${ids.length} tomadas unidas e renomeadas pelo card`)
      setTimeout(() => setAvisoNome(''), 5000)
      return
    }
    setAvisoNome(`${ids.length} tomadas unidas — ligar uma num card leva todas`)
    setTimeout(() => setAvisoNome(''), 5000)
  }

  async function ligar(cardId: string) {
    if (!aberto) return
    const id = aberto.id, nome = aberto.nome
    setLinkOpen(false)
    // tomadas unidas vão JUNTAS pro card: ligar uma liga o grupo todo, e o batismo numera as irmãs
    const ids = await irmaosDoGrupo(id).catch(() => [id])
    setClassif((m) => {
      const n = { ...m }
      for (const x of ids) n[x] = { ...(n[x] || { drive_id: x }), card_id: cardId } as Classificacao
      return n
    })
    for (const x of ids) await ligarBruto(x, cardId, x === id ? nome : undefined).catch(() => {})
    for (const x of ids) {
      const novo = await batizar(x)
      if (novo) setBrutos((bs) => (bs ? bs.map((b) => (b.id === x ? { ...b, nome: novo } : b)) : bs))
    }
    setAvisoNome(ids.length > 1 ? `${ids.length} tomadas ligadas e renomeadas` : 'Renomeado')
    setTimeout(() => setAvisoNome(''), 4000)
  }
  async function desligar() {
    if (!aberto) return
    const ids = await irmaosDoGrupo(aberto.id).catch(() => [aberto.id])
    setClassif((m) => {
      const n = { ...m }
      for (const x of ids) n[x] = { ...(n[x] || { drive_id: x }), card_id: null } as Classificacao
      return n
    })
    for (const x of ids) {
      await ligarBruto(x, null).catch(() => {})
      const novo = await batizar(x)
      if (novo) setBrutos((bs) => (bs ? bs.map((b) => (b.id === x ? { ...b, nome: novo } : b)) : bs))
    }
  }
  async function definirProduto(produto: string | null) {
    if (!aberto) return
    const id = aberto.id
    setClassif((m) => ({ ...m, [id]: { ...(m[id] || { drive_id: id }), produto } as Classificacao }))
    await definirProdutoBruto(id, produto).catch(() => {})
  }
  async function criarELigar() {
    const t = novaTarefa.trim()
    if (!t || ligando) return
    setLigando(true)
    try {
      // a tarefa "Sem roteiro" cai na semana de produção do vídeo (Seg–Qua = semana da data; Qui–Dom = próxima)
      const semana = aberto?.criado ? semanaDeGravacao(new Date(aberto.criado)) : undefined
      const card = await store.createCard({ semRoteiro: true, copy: novaCopy, titulo: t, categoria: novaCat, fase: 'A editar', semana })
      setCards((cs) => [card, ...cs])
      await ligar(card.id)
      setNovaTarefa('')
      setNovaCopy(undefined)
    } finally {
      setLigando(false)
    }
  }

  // aprova a sugestão de card SR da IA: cria o card (sem roteiro, em "A editar"), liga e batiza
  async function aprovarSugestao(titulo: string) {
    if (!aberto || ligando) return
    setLigando(true)
    try {
      const semana = aberto.criado ? semanaDeGravacao(new Date(aberto.criado)) : undefined
      const card = await store.createCard({ semRoteiro: true, titulo, categoria: novaCat, fase: 'A editar', semana })
      setCards((cs) => [card, ...cs])
      await ligar(card.id)
    } finally {
      setLigando(false)
    }
  }
  async function rejeitarSug(id: string) {
    setClassif((m) => ({ ...m, [id]: { ...(m[id] || { drive_id: id }), sugestao_rejeitada: true } as Classificacao }))
    await rejeitarSugestao(id).catch(() => {})
  }

  async function confirmar(b: Bruto, tipo: TipoBruto) {
    const cl = classif[b.id]
    setSalvandoTipo(true)
    // otimista
    setClassif((m) => ({ ...m, [b.id]: { ...(m[b.id] || { drive_id: b.id }), tipo, confirmado: true } as Classificacao }))
    try {
      await confirmarTipo(b.id, tipo, cl?.transcricao ?? null, b.seg)
      // o nome do arquivo depende da classificação (descarte fica com nome de câmera, boa vira BR-…),
      // então reclassificar precisa rebatizar na hora — antes só acontecia ao ligar/desligar a tarefa.
      if (classif[b.id]?.card_id) {
        const novo = await batizar(b.id)
        if (novo) {
          setBrutos((bs) => (bs ? bs.map((x) => (x.id === b.id ? { ...x, nome: novo } : x)) : bs))
          setAvisoNome('Renomeado: ' + novo)
          setTimeout(() => setAvisoNome(''), 4000)
        }
      }
    } finally {
      setSalvandoTipo(false)
    }
  }

  // agrupa os brutos por mês → dia (pastas do catálogo)
  const arvore = useMemo(() => {
    const meses = new Map<string, { mes: string; mesOrd: number; dias: Map<string, { dia: string; diaOrd: number; videos: Bruto[] }> }>()
    for (const b of brutos || []) {
      const { mes, dia, mesOrd, diaOrd } = mesDiaDe(b)
      let m = meses.get(mes)
      if (!m) { m = { mes, mesOrd, dias: new Map() }; meses.set(mes, m) }
      let dd = m.dias.get(dia)
      if (!dd) { dd = { dia, diaOrd, videos: [] }; m.dias.set(dia, dd) }
      dd.videos.push(b)
    }
    // dentro de cada dia, ordena pela sequência do número do clipe (não pela data do upload)
    for (const m of meses.values()) for (const d of m.dias.values()) d.videos.sort((a, b) => numDoClipe(a.nome) - numDoClipe(b.nome))
    return [...meses.values()].sort((a, b) => b.mesOrd - a.mesOrd)
  }, [brutos])

  const mesAtual = nav.mes ? arvore.find((m) => m.mes === nav.mes) || null : null
  const diaAtual = mesAtual && nav.dia ? mesAtual.dias.get(nav.dia) || null : null

  // filtros do catálogo (quando algum está ativo, mostra grade plana de tudo que casa)
  const [fTipo, setFTipo] = useState<'todas' | TipoBruto>('todas')
  const [fProduto, setFProduto] = useState('')
  const [fSemana, setFSemana] = useState('')
  const [busca, setBusca] = useState('')
  const filtrando = fTipo !== 'todas' || !!fProduto || !!fSemana || !!busca.trim()
  const limparFiltros = () => { setFTipo('todas'); setFProduto(''); setFSemana(''); setBusca('') }
  const produtoDoBruto = (b: Bruto) => {
    const c = classif[b.id]
    if (c?.produto) return c.produto // produto marcado direto no take (triagem, independe de card)
    const cid = c?.card_id
    return cid ? cards.find((x) => x.id === cid)?.produto : undefined
  }
  const semanaDoBruto = (b: Bruto) => (b.criado ? semanaDeGravacao(new Date(b.criado)) : '')
  const filtrados = useMemo(() => {
    if (!brutos) return []
    return brutos.filter((b) => {
      if (fTipo !== 'todas' && (classif[b.id]?.tipo || classif[b.id]?.ia_tipo) !== fTipo) return false
      if (fProduto && produtoDoBruto(b) !== fProduto) return false
      if (fSemana && semanaDoBruto(b) !== fSemana) return false
      const q = busca.trim().toLowerCase()
      if (q) {
        // procura no nome do arquivo, no nome de câmera, no título do card ligado e na transcrição —
        // achar "inventário" pelo que ele FALA é o que mais serve na hora de montar uma peça
        const c = classif[b.id]
        const cid = c?.card_id
        const alvo = [b.nome, (b as { nomeOriginal?: string }).nomeOriginal, cid ? cards.find((x) => x.id === cid)?.titulo : '', c?.transcricao]
          .filter(Boolean).join(' ').toLowerCase()
        if (!alvo.includes(q)) return false
      }
      return true
    }).sort((a, b) => numDoClipe(a.nome) - numDoClipe(b.nome))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brutos, classif, cards, fTipo, fProduto, fSemana, busca])

  // Dia dividido em vídeos do projeto: a lista segue a ordem das divisões e, dentro de cada uma, o
  // horário real de gravação — o player anda pelos takes na mesma ordem em que aparecem na tela.
  const divDoDia = useMemo(() => {
    if (!diaAtual || !diaAtual.videos.some((v) => classif[v.id]?.divisao_id)) return null
    const porId = new Map(divisoes.map((d) => [d.id, d]))
    return { porId }
  }, [diaAtual, classif, divisoes])
  const videosDoDia = useMemo(() => {
    if (!diaAtual) return []
    if (!divDoDia) return diaAtual.videos
    // seções na ordem do take mais antigo de cada vídeo: vídeo criado ou remontado à mão cai no lugar
    // certo da gravação, sem depender do número do nome
    const quando = (v: Bruto) => classif[v.id]?.gravado_em || v.criado || ''
    const inicioDiv = new Map<string, string>()
    for (const v of diaAtual.videos) {
      const d = classif[v.id]?.divisao_id || ''
      const q = quando(v)
      if (!inicioDiv.has(d) || q < inicioDiv.get(d)!) inicioDiv.set(d, q)
    }
    const chave = (v: Bruto) => { const d = classif[v.id]?.divisao_id || ''; return d ? inicioDiv.get(d)! + '|' + d : '~' }
    return [...diaAtual.videos].sort((a, b) => chave(a).localeCompare(chave(b)) || quando(a).localeCompare(quando(b)))
  }, [diaAtual, divDoDia, classif])
  const videosVisiveis = filtrando ? filtrados : videosDoDia
  const produtosFiltro = [...new Set([...cards.map((c) => c.produto), ...Object.values(classif).map((c) => c.produto)].filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b))
  const semanasFiltro = [...new Set((brutos || []).map(semanaDoBruto).filter(Boolean))].sort().reverse()

  const aberto = idx != null ? videosVisiveis[idx] ?? null : null

  // Link direto pro vídeo (?bruto=<id>): navega até a pasta dele e abre o player. Em duas etapas
  // porque a lista visível só passa a conter o vídeo depois que a pasta muda.
  const [brutoPend, setBrutoPend] = useState<string | null>(() => lerParam('bruto'))
  useEffect(() => {
    if (!brutoPend || !brutos) return
    const b = brutos.find((x) => x.id === brutoPend)
    if (!b) { setBrutoPend(null); return } // link de um vídeo que não está mais no catálogo
    const { mes, dia } = mesDiaDe(b)
    if (nav.mes !== mes || nav.dia !== dia) { setNav({ mes, dia }); return }
    const i = videosVisiveis.findIndex((v) => v.id === brutoPend)
    if (i >= 0) { setIdx(i); setBrutoPend(null) }
  }, [brutoPend, brutos, nav, videosVisiveis])

  // mantém ?bruto= em dia: quem abrir/fechar o player pode copiar direto da barra de endereço
  useEffect(() => {
    if (brutoPend) return
    gravarParams({ bruto: aberto ? aberto.id : null })
  }, [aberto, brutoPend])
  const temPrev = idx != null && idx > 0
  const temNext = idx != null && idx < videosVisiveis.length - 1

  // seleção múltipla + baixar originais em lote
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [baixando, setBaixando] = useState(false)
  // Shift+clique marca o intervalo inteiro desde o último marcado — montar um vídeo com 20 takes
  // seguidos é um clique no primeiro e um Shift+clique no último.
  const ultimoSel = useRef<number | null>(null)
  function toggleSel(id: string, faixa = false) {
    const i = videosVisiveis.findIndex((v) => v.id === id)
    setSel((s) => {
      const n = new Set(s)
      if (faixa && ultimoSel.current != null && i >= 0) {
        const [a, b] = [Math.min(ultimoSel.current, i), Math.max(ultimoSel.current, i)]
        for (let k = a; k <= b; k++) n.add(videosVisiveis[k].id)
      } else if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
    if (i >= 0) ultimoSel.current = i
  }

  // ---- montar os vídeos do projeto à mão: selecionar vários e arrastar ----
  const [arrastando, setArrastando] = useState<string[] | null>(null)
  const [alvoDrop, setAlvoDrop] = useState<string | null>(null)
  const divsDoDiaLista = divDoDia
    ? ([...new Set(videosDoDia.map((v) => classif[v.id]?.divisao_id).filter(Boolean) as string[])].map((id) => divDoDia.porId.get(id)).filter(Boolean) as Divisao[])
    : []
  function iniciarArraste(e: React.DragEvent, id: string) {
    const ids = sel.has(id) ? [...sel] : [id]
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', ids.join(','))
    // etiqueta que acompanha o cursor: quantos takes vão junto
    const et = document.createElement('div')
    et.textContent = ids.length > 1 ? `${ids.length} takes` : '1 take'
    et.style.cssText = 'position:fixed;top:-100px;left:-100px;padding:6px 12px;border-radius:10px;background:#14a8f5;color:#fff;font:700 13px system-ui'
    document.body.appendChild(et)
    e.dataTransfer.setDragImage(et, 10, 10)
    setTimeout(() => et.remove(), 0)
    setArrastando(ids)
  }
  const idsDoDrop = (e: React.DragEvent) => (e.dataTransfer.getData('text/plain') || '').split(',').filter(Boolean)
  async function moverPara(ids: string[], para: string) {
    setArrastando(null); setAlvoDrop(null)
    if (!ids.length) return
    let destino = para
    if (para === 'novo') {
      const nums = divsDoDiaLista.map((d) => Number((d.nome.match(/^V[íi]deo (\d+)$/i) || [])[1] || 0))
      const n = Math.max(divsDoDiaLista.length, ...nums) + 1
      const d = await criarDivisao('Vídeo ' + String(n).padStart(2, '0'), n)
      if (!d) return
      setDivisoes((ds) => [...ds, d])
      destino = d.id
    }
    const origens = [...new Set(ids.map((id) => classif[id]?.divisao_id).filter(Boolean) as string[])]
    setClassif((m) => {
      const n = { ...m }
      for (const id of ids) n[id] = { ...(n[id] || { drive_id: id }), divisao_id: destino } as Classificacao
      return n
    })
    setSel(new Set())
    const ok = await moverVariosParaDivisao(ids, destino, origens)
    if (!ok) listarClassificacoes().then(setClassif).catch(() => {})
    listarDivisoes().then(setDivisoes).catch(() => {})
  }
  // LOTE = PASTA NO DRIVE. Disparar N downloads seguidos no navegador é frágil: o Chrome/Safari
  // bloqueia depois dos primeiros, cada arquivo vai pra pasta de Downloads solto e não dá pra retomar.
  // Aqui o Google copia os arquivos dentro dele mesmo (nenhum byte passa por nós) e abre a pasta.
  // Mesma mecânica que o Quadro já usava; o Catálogo tinha ficado pra trás. A pasta some em 12h.
  const [erroLote, setErroLote] = useState('')
  async function baixarOriginais() {
    if (!brutos || baixando) return
    const alvo = brutos.filter((b) => sel.has(b.id))
    if (!alvo.length) return
    setBaixando(true)
    setErroLote('')
    // a aba abre ANTES do await, dentro do clique — senão o navegador barra como pop-up
    const aba = window.open('', '_blank')
    try {
      const r = await fetch(`/api/pacote-drive?ids=${alvo.map((b) => b.id).join(',')}&team=${encodeURIComponent(getTeam())}`)
      const d = await r.json()
      if (!r.ok || !d.url) throw new Error(d.error || 'não consegui preparar')
      if (aba) aba.location.href = d.url
      else window.location.href = d.url
    } catch (e) {
      if (aba) aba.close()
      setErroLote(e instanceof Error ? e.message : 'não consegui preparar')
      setTimeout(() => setErroLote(''), 6000)
    } finally {
      setBaixando(false)
    }
  }

  // edição do nome
  const [editNome, setEditNome] = useState(false)
  const [nomeTmp, setNomeTmp] = useState('')
  const [salvNome, setSalvNome] = useState(false)
  const [erroNome, setErroNome] = useState('')

  // player: URL assinada da versão leve (proxy). null enquanto carrega; prevErro cai no iframe do Drive.
  const [prevUrl, setPrevUrl] = useState<string | null>(null)
  const [prevErro, setPrevErro] = useState(false)
  const [avisoNome, setAvisoNome] = useState('')
  const [sugTitulo, setSugTitulo] = useState<string | null>(null) // título editável da proposta SR

  useEffect(() => {
    setEditNome(false)
    setErroNome('')
    setLinkOpen(false)
    setBuscaCard('')
    setNovaTarefa('')
    setSugTitulo(null)
  }, [aberto?.id])

  // busca a URL da versão leve (proxy) ao abrir um vídeo que já a tem; erro cai no iframe do Drive
  useEffect(() => {
    setPrevUrl(null)
    setPrevErro(false)
    if (!aberto?.id || !aberto.temProxy) return
    let cancel = false
    fetch('/api/preview-url?id=' + encodeURIComponent(aberto.id))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('sem proxy'))))
      .then((d) => { if (!cancel) { if (d.url) setPrevUrl(d.url); else setPrevErro(true) } })
      .catch(() => { if (!cancel) setPrevErro(true) })
    return () => { cancel = true }
  }, [aberto?.id, aberto?.temProxy])

  // setas do teclado quando o player está aberto
  useEffect(() => {
    if (aberto == null || editNome) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && temNext) setIdx((i) => (i == null ? i : i + 1))
      else if (e.key === 'ArrowLeft' && temPrev) setIdx((i) => (i == null ? i : i - 1))
      else if (e.key === 'Escape') setIdx(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aberto, temPrev, temNext, editNome])

  async function salvarNome() {
    if (!aberto) return
    const novo = nomeTmp.trim()
    if (!novo || novo === aberto.nome) { setEditNome(false); return }
    setSalvNome(true)
    setErroNome('')
    try {
      const nomeFinal = await renomearBruto(aberto.id, novo)
      setBrutos((bs) => (bs ? bs.map((b) => (b.id === aberto.id ? { ...b, nome: nomeFinal } : b)) : bs))
      setEditNome(false)
    } catch (e) {
      setErroNome(e instanceof Error ? e.message : 'erro')
    } finally {
      setSalvNome(false)
    }
  }

  // copia o link que abre ESTE vídeo aqui na plataforma (leva o time e a pasta; o player abre sozinho)
  const [videoCopiado, setVideoCopiado] = useState(false)
  async function copiarLinkVideo(b: Bruto) {
    const u = new URL(window.location.origin)
    u.searchParams.set('t', getTeam())
    u.searchParams.set('v', 'catalogo')
    u.searchParams.set('bruto', b.id)
    try {
      await navigator.clipboard.writeText(u.toString())
      setVideoCopiado(true)
      setTimeout(() => setVideoCopiado(false), 1800)
    } catch { /* clipboard bloqueado */ }
  }

  // copia o endereço da pasta aberta pra mandar pra alguém (inclui o time, pra abrir no espaço certo)
  const [linkCopiado, setLinkCopiado] = useState(false)
  const [casarAberto, setCasarAberto] = useState(false)
  async function copiarLinkPasta() {
    const u = new URL(window.location.origin)
    u.searchParams.set('t', getTeam())
    u.searchParams.set('v', 'catalogo')
    if (nav.mes) u.searchParams.set('mes', nav.mes)
    if (nav.dia) u.searchParams.set('dia', nav.dia)
    try {
      await navigator.clipboard.writeText(u.toString())
      setLinkCopiado(true)
      setTimeout(() => setLinkCopiado(false), 1800)
    } catch { /* clipboard bloqueado */ }
  }

  // quantos ainda não têm etiqueta (nem da IA, nem confirmada por gente)
  const semAnalise = (brutos || []).filter((b) => !(classif[b.id]?.tipo || classif[b.id]?.ia_tipo)).length

  const navBtn = 'h-8 w-8 grid place-items-center rounded-lg bg-surface-2 border border-border text-muted disabled:opacity-30 hover:text-ink transition-colors text-[18px] leading-none'

  const cardEl = (b: Bruto, i: number) => {
    const marcado = sel.has(b.id)
    const cl = classif[b.id]
    const t = cl?.tipo || cl?.ia_tipo || null
    const confirmado = !!cl?.confirmado
    return (
      <button
        key={b.id}
        onClick={() => setIdx(i)}
        draggable={!!divDoDia}
        onDragStart={divDoDia ? (e) => iniciarArraste(e, b.id) : undefined}
        onDragEnd={() => { setArrastando(null); setAlvoDrop(null) }}
        className={'group text-left rounded-2xl border bg-surface p-3 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-8px_rgba(0,0,0,0.6)] transition-all ' + (marcado ? 'border-brand/70' : 'border-border hover:border-border-strong') + (arrastando?.includes(b.id) ? ' opacity-40' : '')}
      >
        <div className="relative aspect-video rounded-xl bg-surface-2 border border-border overflow-hidden mb-2 grid place-items-center text-muted">
          <svg width="26" height="26" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
          {b.thumb && <img src={b.thumb} alt="" loading="lazy" decoding="async" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} className="absolute inset-0 h-full w-full object-cover" />}
          <span className="absolute inset-0 grid place-items-center bg-black/0 group-hover:bg-black/25 transition-colors">
            <span className="h-9 w-9 rounded-full bg-black/0 group-hover:bg-black/55 backdrop-blur-sm grid place-items-center opacity-0 group-hover:opacity-100 transition-all">
              <svg width="15" height="15" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="white" /></svg>
            </span>
          </span>
          <span role="checkbox" aria-checked={marcado} aria-label="Selecionar vídeo" onClick={(e) => { e.stopPropagation(); toggleSel(b.id, e.shiftKey) }} className={'tap absolute top-1.5 left-1.5 h-5 w-5 rounded-md border grid place-items-center transition-all cursor-pointer ' + (marcado ? 'bg-brand border-brand opacity-100' : 'bg-black/45 border-white/50 opacity-50 group-hover:opacity-100')}>
            {marcado && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>}
          </span>
          {t ? (
            <span className={'absolute top-1.5 right-1.5 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-bold backdrop-blur-sm ' + TIPO_META[t].badge + (confirmado ? '' : ' opacity-90')}>
              {!confirmado && <span className="text-[8px] font-semibold opacity-70">IA</span>}
              {TIPO_META[t].label}
            </span>
          ) : (
            // ainda sem etiqueta: mostra que a IA vai passar por aqui (girando enquanto a rodada corre)
            <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 rounded-md border border-white/20 bg-black/55 px-1.5 py-0.5 text-[10.5px] font-bold text-white/80 backdrop-blur-sm">
              {iaRodando && <span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-white/30 border-t-white/90 animate-spin" />}
              {iaRodando ? 'identificando' : String(cl?.ia_motivo || '').startsWith('sem fala') ? 'sem fala' : 'sem análise'}
            </span>
          )}
        </div>
        <div className="text-[13px] font-bold truncate">{b.nome}</div>
        <div className="text-[12px] text-muted tnum mt-0.5 flex items-center gap-1.5">
          {fmtDur(b.seg)}
          {/* tomada unida: sem isso não dá pra saber, olhando a grade, o que anda junto com o quê */}
          {cl?.grupo_id && (
            <span title="Unida a outras tomadas — ligar uma num card leva todas" className="inline-flex items-center gap-1 rounded-md bg-brand/12 border border-brand/30 text-brand-2 px-1.5 py-px text-[10.5px] font-bold">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l2-2a5 5 0 0 0-7.07-7.07l-1 1" /><path d="M14 11a5 5 0 0 0-7.07 0l-2 2a5 5 0 0 0 7.07 7.07l1-1" /></svg>
              unida
            </span>
          )}
        </div>
      </button>
    )
  }

  return (
    <div className="relative z-10 px-4 sm:px-6 pb-24 max-w-5xl mx-auto">
      <div className="faixa-toque flex flex-wrap items-center gap-2 pt-3 pb-3">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-ink-2">Brutos no Drive</h2>
        {brutos && <span className="tnum text-[11px] font-bold text-brand-2 bg-brand/12 rounded-full px-2 py-0.5">{brutos.length}</span>}
        {sel.size > 0 ? (
          <button onClick={() => setSel(new Set())} className="ml-auto text-[12px] font-medium text-muted hover:text-ink">Limpar seleção</button>
        ) : (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
            <input
              value={pastaLink}
              onChange={(e) => setPastaLink(e.target.value)}
              placeholder="colar link de uma pasta…"
              className="hidden sm:block w-44 text-[12px] bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 text-ink-2 placeholder:text-muted focus:border-brand/50 outline-none"
            />
            {pastaLink.trim() && (
              <button onClick={() => processarNovos(pastaLink.trim())} disabled={proc === 'indo'} className="shrink-0 text-[12px] font-semibold rounded-lg px-2.5 py-1.5 border bg-surface-2 border-border text-brand-2 hover:border-brand/50 disabled:opacity-60 transition-colors">Escanear pasta</button>
            )}
            <button
              onClick={() => setCasarAberto(true)}
              title="Jogar um roteiro e ligar as gravações nele"
              className="shrink-0 inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-lg px-2.5 py-1.5 border bg-surface-2 border-border text-ink-2 hover:border-brand/50 hover:text-ink transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 14h6" /></svg>
              Casar roteiro
            </button>
            <button
              onClick={() => processarNovos()}
              disabled={proc === 'indo'}
              title="Gera capa + metadados dos vídeos novos (roda na nuvem)"
              className={'shrink-0 inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-lg px-2.5 py-1.5 border transition-colors disabled:opacity-60 ' + (proc === 'erro' ? 'bg-red/10 border-red/30 text-red' : proc === 'ok' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-surface-2 border-border text-brand-2 hover:border-brand/50')}
            >
              {proc === 'indo' ? (
                <span className="h-3.5 w-3.5 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" /></svg>
              )}
              {proc === 'indo' ? 'Processando…' : proc === 'ok' ? 'Concluído!' : proc === 'erro' ? 'Falhou' : 'Processar novos'}
            </button>
          </div>
        )}
      </div>

      {proc === 'indo' && (
        <div className="mb-3 rounded-xl border border-brand/20 bg-brand/[0.06] px-3 py-2.5">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[12px] font-semibold text-brand-2 truncate">{procFase || 'Processando…'}</span>
            <span className="tnum shrink-0 text-[12px] font-semibold text-muted">{Math.round(procPct)}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-2 transition-[width] duration-700 ease-out" style={{ width: procPct + '%' }} />
          </div>
          <div className="text-[11px] text-muted mt-1.5">Roda na nuvem — pode fechar essa aba que continua processando.</div>
        </div>
      )}

      {proc === 'ok' && procFase === 'Concluído' && (
        <div className="mb-3 text-[12px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">Processamento concluído — os vídeos novos já estão no catálogo.</div>
      )}

      {/* Rodada da IA em andamento (sobrevive ao F5): diz o que está acontecendo e quantos faltam,
          pra ninguém ficar olhando vídeo sem etiqueta sem saber se ainda vem análise. */}
      {iaRodando && proc !== 'indo' && (
        <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-brand/20 bg-brand/[0.06] px-3 py-2.5">
          <span className="h-4 w-4 shrink-0 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
          <span className="text-[12px] font-semibold text-brand-2 truncate">{iaRodando.fase}</span>
          {semAnalise > 0 && (
            <span className="tnum shrink-0 text-[12px] font-semibold text-muted">{semAnalise} sem etiqueta</span>
          )}
          <span className="hidden sm:block flex-1" />
          <span className="hidden sm:block text-[11px] text-muted shrink-0">Atualiza sozinho quando terminar</span>
        </div>
      )}

      {casarAberto && <CasarRoteiro onFechar={() => setCasarAberto(false)} onPronto={() => { listarBrutos().then(setBrutos).catch(() => {}); listarClassificacoes().then(setClassif).catch(() => {}); listarDivisoes().then(setDivisoes).catch(() => {}) }} />}

      {erro && <div className="text-[13px] text-red bg-red/10 border border-red/20 rounded-xl p-3">{erro}</div>}

      {!brutos && !erro && (
        <div className="grid place-items-center py-20">
          <div className="h-7 w-7 rounded-full border-[3px] border-border-strong border-t-brand animate-spin" />
        </div>
      )}

      {brutos && brutos.length === 0 && <div className="text-center text-muted py-16">Nenhum vídeo na pasta.</div>}

      {brutos && brutos.length > 0 && (
        <>
          {/* filtros */}
          <div className="faixa-toque flex items-center gap-1.5 flex-wrap mb-3">
            <div className="relative">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar vídeo…"
                className={'h-11 w-[190px] rounded-lg border bg-surface-2 pl-8 pr-7 text-[12.5px] text-ink outline-none placeholder:text-muted transition-colors ' + (busca ? 'border-brand/50' : 'border-border focus:border-brand/50')}
              />
              {busca && (
                <button onClick={() => setBusca('')} aria-label="Limpar busca" className="tap absolute right-1.5 top-1/2 -translate-y-1/2 h-5 w-5 grid place-items-center rounded text-muted hover:text-ink">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              )}
            </div>
            <span className="w-px h-5 bg-border mx-0.5" />
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted mr-0.5">Filtrar</span>
            <button onClick={() => setFTipo('todas')} className={'text-[12px] font-semibold rounded-lg px-2.5 py-1.5 border transition-colors ' + (fTipo === 'todas' ? 'bg-brand/12 border-brand/40 text-brand-2' : 'bg-surface-2 border-border text-muted hover:text-ink')}>Todas</button>
            {TIPOS.map((v) => (
              <button key={v} onClick={() => setFTipo(v)} className={'text-[12px] font-semibold rounded-lg px-2.5 py-1.5 border transition-colors ' + (fTipo === v ? TIPO_META[v].badge : 'bg-surface-2 border-border text-muted hover:text-ink')}>{TIPO_META[v].label}</button>
            ))}
            <span className="w-px h-5 bg-border mx-0.5" />
            <select value={fProduto} onChange={(e) => setFProduto(e.target.value)} className={'h-11 rounded-lg border bg-surface-2 px-2 text-[12px] outline-none cursor-pointer ' + (fProduto ? 'border-brand/50 text-ink' : 'border-border text-muted')}>
              <option value="">Produto: todos</option>
              {produtosFiltro.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={fSemana} onChange={(e) => setFSemana(e.target.value)} className={'h-11 rounded-lg border bg-surface-2 px-2 text-[12px] outline-none cursor-pointer ' + (fSemana ? 'border-brand/50 text-ink' : 'border-border text-muted')}>
              <option value="">Semana: todas</option>
              {semanasFiltro.map((s) => <option key={s} value={s}>{'Semana ' + s.slice(8, 10) + '/' + s.slice(5, 7)}</option>)}
            </select>
            {filtrando && <button onClick={limparFiltros} className="text-[12px] font-medium text-muted hover:text-rose-300 ml-0.5">limpar</button>}
          </div>

          {filtrando ? (
            filtrados.length === 0 ? (
              <div className="text-center text-muted py-16">
                Nenhum vídeo com esses filtros.
                <button onClick={limparFiltros} className="block mx-auto mt-2 text-[13px] font-semibold text-brand-2 hover:text-brand">limpar filtros</button>
              </div>
            ) : (
              <>
                <div className="text-[12px] text-muted mb-2 tnum">{filtrados.length} vídeo{filtrados.length === 1 ? '' : 's'}</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">{videosVisiveis.map(cardEl)}</div>
              </>
            )
          ) : (
            <>
              <div className="flex items-center gap-1 text-[13px] mb-3 flex-wrap text-muted">
                <button onClick={() => irPara(null, null)} className={nav.mes ? 'hover:text-ink' : 'text-ink font-bold'}>Catálogo</button>
                {nav.mes && <><Chevron /><button onClick={() => irPara(nav.mes, null)} className={nav.dia ? 'hover:text-ink' : 'text-ink font-bold'}>{nav.mes}</button></>}
                {nav.dia && <><Chevron /><span className="text-ink font-bold">Dia {nav.dia}</span></>}
                {nav.mes && (
                  <button
                    onClick={copiarLinkPasta}
                    title="Copiar o link desta pasta (abre direto aqui)"
                    className={'tap ml-1.5 inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11.5px] font-bold transition-colors ' + (linkCopiado ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-border bg-surface-2 text-muted hover:text-ink hover:border-border-strong')}
                  >
                    {linkCopiado ? (
                      <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>link copiado</>
                    ) : (
                      <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12 19" /></svg>copiar link</>
                    )}
                  </button>
                )}
              </div>

              {!nav.mes && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {arvore.map((m) => {
                    const tot = [...m.dias.values()].reduce((s, d) => s + d.videos.length, 0)
                    return <FolderCard key={m.mes} label={m.mes} sub={tot + ' vídeo' + (tot > 1 ? 's' : '')} onClick={() => irPara(m.mes, null)} />
                  })}
                </div>
              )}

              {nav.mes && !nav.dia && mesAtual && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {[...mesAtual.dias.values()].sort((a, b) => b.diaOrd - a.diaOrd).map((d) => (
                    <FolderCard key={d.dia} label={'Dia ' + d.dia} sub={d.videos.length + ' vídeo' + (d.videos.length > 1 ? 's' : '')} onClick={() => irPara(nav.mes, d.dia)} />
                  ))}
                </div>
              )}

              {/* Dentro do dia, separa pelas subpastas que a pessoa criou no Drive ("parte 2", "ganchos").
                  Sem subpasta nenhuma, cai na grade única de sempre — nada muda pra quem não usa. */}
              {nav.dia && divDoDia && (() => {
                const secoes: { id: string; nome: string; videos: Bruto[] }[] = []
                for (const v of videosVisiveis) {
                  const id = classif[v.id]?.divisao_id || ''
                  let sec = secoes[secoes.length - 1]
                  if (!sec || sec.id !== id) { sec = { id, nome: id ? divDoDia.porId.get(id)?.nome || 'Vídeo' : 'Sem vídeo', videos: [] }; secoes.push(sec) }
                  sec.videos.push(v)
                }
                return (
                  <div className="flex flex-col gap-7">
                    {secoes.map((sec, si) => (
                      <SecaoVideo
                        key={sec.id || 'sem'}
                        nome={sec.nome}
                        editavel={!!sec.id}
                        videos={sec.videos}
                        classif={classif}
                        onRenomear={async (nome) => {
                          setDivisoes((ds) => ds.map((d) => (d.id === sec.id ? { ...d, nome } : d)))
                          if (!(await renomearDivisao(sec.id, nome))) listarDivisoes().then(setDivisoes).catch(() => {})
                        }}
                        destacado={!!arrastando && alvoDrop === (sec.id || 'sem')}
                        onArrastarSobre={sec.id && arrastando ? () => setAlvoDrop(sec.id) : undefined}
                        onSoltar={sec.id ? (e) => moverPara(idsDoDrop(e), sec.id) : undefined}
                        onJuntarAcima={si > 0 && sec.id && secoes[si - 1].id ? async () => {
                          const para = secoes[si - 1].id
                          setClassif((m) => {
                            const n = { ...m }
                            for (const v of sec.videos) if (n[v.id]) n[v.id] = { ...n[v.id], divisao_id: para }
                            return n
                          })
                          setDivisoes((ds) => ds.filter((d) => d.id !== sec.id))
                          if (!(await juntarDivisao(sec.id, para))) {
                            listarClassificacoes().then(setClassif).catch(() => {}); listarDivisoes().then(setDivisoes).catch(() => {})
                          }
                        } : undefined}
                      >
                        {/* índice da lista COMPLETA: o player navega por posição no dia */}
                        {sec.videos.map((v) => cardEl(v, videosVisiveis.indexOf(v)))}
                      </SecaoVideo>
                    ))}
                  </div>
                )
              })()}
              {nav.dia && !divDoDia && (() => {
                const blocos = new Map<string, typeof videosVisiveis>()
                for (const v of videosVisiveis) {
                  const k = v.bloco || ''
                  if (!blocos.has(k)) blocos.set(k, [])
                  blocos.get(k)!.push(v)
                }
                const chaves = [...blocos.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b, 'pt-BR')))
                if (chaves.length <= 1) return <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">{videosVisiveis.map(cardEl)}</div>
                return (
                  <div className="flex flex-col gap-6">
                    {chaves.map((k) => (
                      <div key={k || 'raiz'}>
                        <div className="flex items-center gap-2 mb-2.5">
                          <h3 className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-2">{k || 'sem subpasta'}</h3>
                          <span className="tnum text-[11px] font-bold text-brand-2 bg-brand/12 rounded-full px-2 py-0.5">{blocos.get(k)!.length}</span>
                          <span className="h-px flex-1 bg-border" />
                        </div>
                        {/* índice da lista COMPLETA: o modal navega por posição, e contar por seção
                            fazia o primeiro card de cada bloco abrir o primeiro vídeo do dia */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">{blocos.get(k)!.map((v) => cardEl(v, videosVisiveis.indexOf(v)))}</div>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </>
          )}
        </>
      )}

      {/* Enquanto arrasta: todos os vídeos do dia num lugar só, pra soltar sem precisar rolar a página,
          e o "novo vídeo" pra criar um na hora com os takes arrastados. */}
      {arrastando && divDoDia && (
        <div className="bg-elev fixed bottom-0 left-0 right-0 z-50 px-4 sm:px-6 pt-3 pb-[calc(env(safe-area-inset-bottom)+14px)] border-t border-border-strong shadow-[0_-20px_50px_-10px_rgba(0,0,0,0.7)]">
          <div className="max-w-5xl mx-auto">
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted mb-2">Soltar {arrastando.length > 1 ? `os ${arrastando.length} takes` : 'o take'} em</div>
            <div className="flex flex-wrap gap-2">
              {divsDoDiaLista.map((d) => (
                <div
                  key={d.id}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setAlvoDrop(d.id) }}
                  onDragLeave={() => setAlvoDrop((a) => (a === d.id ? null : a))}
                  onDrop={(e) => { e.preventDefault(); moverPara(idsDoDrop(e), d.id) }}
                  className={'h-11 px-4 inline-flex items-center rounded-xl border text-[13px] font-semibold transition-all ' + (alvoDrop === d.id ? 'bg-brand text-white border-brand scale-[1.04]' : 'bg-surface-2 border-border text-ink')}
                >
                  {d.nome}
                </div>
              ))}
              <div
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setAlvoDrop('novo') }}
                onDragLeave={() => setAlvoDrop((a) => (a === 'novo' ? null : a))}
                onDrop={(e) => { e.preventDefault(); moverPara(idsDoDrop(e), 'novo') }}
                className={'h-11 px-4 inline-flex items-center gap-1.5 rounded-xl border-2 border-dashed text-[13px] font-bold transition-all ' + (alvoDrop === 'novo' ? 'bg-brand/15 border-brand text-brand-2 scale-[1.04]' : 'border-brand/50 text-brand-2')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                Novo vídeo
              </div>
            </div>
          </div>
        </div>
      )}

      {/* barra de seleção (some quando o player está aberto) */}
      {sel.size > 0 && !aberto && !arrastando && (
        <div className="glass fixed bottom-0 left-0 right-0 z-40 px-4 sm:px-6 pt-3 pb-[calc(env(safe-area-inset-bottom)+14px)] border-t border-border/70">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <span className="text-[13px] font-semibold">{sel.size} selecionado{sel.size > 1 ? 's' : ''}</span>
            <div className="flex-1" />
            <button onClick={() => setSel(new Set())} className="h-11 px-4 rounded-xl bg-surface-2 border border-border text-ink font-semibold text-[13px] hover:border-border-strong transition-all">Limpar</button>
            {divDoDia && (
              <select
                value=""
                onChange={(e) => { if (e.target.value) moverPara([...sel], e.target.value) }}
                aria-label="Mover os selecionados para um vídeo"
                className="h-11 max-w-[170px] rounded-xl bg-surface-2 border border-border px-3 text-[13px] font-semibold text-ink outline-none hover:border-border-strong"
              >
                <option value="">Mover para…</option>
                {divsDoDiaLista.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
                <option value="novo">+ Novo vídeo</option>
              </select>
            )}
            {/* Unir: as tomadas viram uma peça só. Depois disso, ligar uma num card leva todas. */}
            {sel.size > 1 && (
              <button
                onClick={unirSelecionados}
                disabled={unindo}
                title="Tratar como uma peça só: ligar uma num card leva todas"
                className="h-11 px-4 rounded-xl bg-surface-2 border border-border text-ink font-semibold text-[13px] hover:border-border-strong disabled:opacity-60 transition-all inline-flex items-center gap-1.5"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l2-2a5 5 0 0 0-7.07-7.07l-1 1" /><path d="M14 11a5 5 0 0 0-7.07 0l-2 2a5 5 0 0 0 7.07 7.07l1-1" /></svg>
                {unindo ? 'unindo…' : `Unir ${sel.size}`}
              </button>
            )}
            {erroLote && <span className="text-[12px] font-semibold text-red">{erroLote}</span>}
            <button
              onClick={baixarOriginais}
              disabled={baixando}
              title="Junta numa pasta do Drive e abre pra você baixar de lá (some em 12h)"
              className="h-11 px-5 inline-flex items-center gap-2 rounded-xl bg-brand text-white font-bold text-[14px] shadow-[0_10px_30px_-6px_rgba(20,168,245,0.5)] active:scale-[0.98] transition-transform disabled:opacity-70"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v12M6 10l6 6 6-6" /><path d="M4 20h16" /></svg>
              {baixando ? 'Preparando…' : `Baixar ${sel.size} no Drive`}
            </button>
          </div>
        </div>
      )}

      {aberto && createPortal((
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4">
          <div className="fade-in absolute inset-0 bg-black/70" onClick={() => setIdx(null)} />
          <div className="sheet-up relative w-full max-w-2xl h-[calc(var(--vh-real,100vh)*0.92)] sm:h-[86vh] flex flex-col bg-elev border border-border-strong rounded-2xl p-3 sm:p-4 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]">
            <div className="flex items-center gap-2 mb-3 shrink-0">
              <div className="flex items-center gap-1 shrink-0">
                <button disabled={!temPrev} onClick={() => setIdx((i) => (i == null ? i : i - 1))} aria-label="Vídeo anterior" className={navBtn}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg></button>
                <button disabled={!temNext} onClick={() => setIdx((i) => (i == null ? i : i + 1))} aria-label="Próximo vídeo" className={navBtn}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg></button>
              </div>
              <div className="min-w-0 flex-1">
                {editNome ? (
                  <input
                    autoFocus
                    value={nomeTmp}
                    onChange={(e) => setNomeTmp(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') salvarNome(); else if (e.key === 'Escape') setEditNome(false) }}
                    disabled={salvNome}
                    className="w-full bg-surface border border-brand/60 rounded-lg px-2 py-1 text-[14px] font-bold text-ink outline-none"
                  />
                ) : (
                  <button onClick={() => { setNomeTmp(aberto.nome); setErroNome(''); setEditNome(true) }} className="group/n flex items-center gap-1.5 max-w-full" title="Renomear (edita no Drive)">
                    <span className="text-[15px] font-bold truncate">{aberto.nome}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted opacity-60 group-hover/n:opacity-100"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                  </button>
                )}
                {erroNome ? (
                  <div className="text-[11px] text-red mt-0.5 truncate" title={erroNome}>{erroNome}</div>
                ) : (
                  <div className="text-[12px] text-muted tnum">{fmtDur(aberto.seg)} · {(idx ?? 0) + 1}/{brutos!.length}</div>
                )}
              </div>
              {editNome ? (
                <>
                  <button onClick={salvarNome} disabled={salvNome} className="shrink-0 text-[12px] font-semibold text-white bg-brand rounded-lg px-3 py-1.5 disabled:opacity-60">{salvNome ? '…' : 'Salvar'}</button>
                  <button onClick={() => setEditNome(false)} className="shrink-0 text-[12px] text-muted px-1.5 hover:text-ink">Cancelar</button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => copiarLinkVideo(aberto)}
                    title="Copiar o link do vídeo no Drive (pra colar no ClickUp, Slack…)"
                    className={'shrink-0 text-[12px] font-semibold rounded-lg px-3 py-1.5 border transition-colors ' + (videoCopiado ? 'text-green border-green/40 bg-green/10' : 'text-ink-2 bg-surface-2 border-border hover:border-border-strong hover:text-ink')}
                  >
                    {videoCopiado ? 'copiado' : 'Copiar link'}
                  </button>
                  <a href={baixarUrl(aberto)} className="shrink-0 text-[12px] font-semibold text-brand-2 bg-surface-2 border border-border rounded-lg px-3 py-1.5 hover:border-brand/50 transition-colors">Baixar</a>
                  <button onClick={() => setIdx(null)} aria-label="Fechar" className="shrink-0 h-9 w-9 grid place-items-center rounded-xl bg-surface-2 border border-border text-muted hover:text-ink transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </>
              )}
            </div>
            <div className="relative flex-1 min-h-0">
              {avisoNome && <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 text-[12px] font-semibold text-emerald-300 bg-black/75 rounded-full px-3 py-1">{avisoNome}</div>}
              {/* player: versão leve (proxy) quando existe — instantâneo, sem "processando"; senão, o do Drive */}
              {aberto.temProxy && !prevErro ? (
                prevUrl ? (
                  <video key={prevUrl} src={prevUrl} controls autoPlay playsInline onError={() => setPrevErro(true)} className="w-full h-full rounded-xl bg-black object-contain" />
                ) : (
                  <div className="w-full h-full rounded-xl bg-black grid place-items-center"><div className="h-7 w-7 rounded-full border-[3px] border-white/20 border-t-white/80 animate-spin" /></div>
                )
              ) : (
                <iframe
                  key={aberto.id}
                  src={drivePreview(aberto.id)}
                  title={aberto.nome}
                  allow="autoplay; fullscreen"
                  allowFullScreen
                  className="w-full h-full rounded-xl bg-black border-0"
                />
              )}
              {temPrev && (
                <button onClick={() => setIdx((i) => (i == null ? i : i - 1))} aria-label="Vídeo anterior" className="absolute left-1.5 top-1/2 -translate-y-1/2 h-10 w-10 hidden sm:grid place-items-center rounded-full bg-black/45 hover:bg-black/70 text-white backdrop-blur-sm transition-colors text-[20px] leading-none"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg></button>
              )}
              {temNext && (
                <button onClick={() => setIdx((i) => (i == null ? i : i + 1))} aria-label="Próximo vídeo" className="absolute right-1.5 top-1/2 -translate-y-1/2 h-10 w-10 hidden sm:grid place-items-center rounded-full bg-black/45 hover:bg-black/70 text-white backdrop-blur-sm transition-colors text-[20px] leading-none"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg></button>
              )}
            </div>
            {(() => {
              const clA = classif[aberto.id]
              const proposto = clA?.ia_tipo || null
              const confirmadoTipo = clA?.tipo || null
              const temTransc = clA && clA.transcricao !== undefined
              return (
                <div className="mt-3 border-t border-border pt-3 shrink-0 max-h-[34vh] overflow-y-auto">
                  {temTransc && (
                    <div className="mb-2.5">
                      <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted mb-1">O que ele fala</div>
                      <p className="text-[12px] text-ink-2 leading-snug max-h-24 overflow-auto whitespace-pre-wrap">{clA!.transcricao || '(silêncio / sem fala detectada)'}</p>
                    </div>
                  )}
                  {proposto && (
                    <div className="flex items-start gap-2 mb-2.5 text-[12px] text-muted">
                      <span className={'shrink-0 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-bold ' + TIPO_META[proposto].badge}>IA: {TIPO_META[proposto].label}</span>
                      {clA?.ia_resumo && <span className="leading-snug">{clA.ia_resumo}</span>}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-muted mr-0.5">{confirmadoTipo ? 'Confirmado:' : 'Classificar:'}</span>
                    {TIPOS.map((tp) => {
                      const ativo = confirmadoTipo === tp
                      return (
                        <button
                          key={tp}
                          disabled={salvandoTipo}
                          onClick={() => confirmar(aberto, tp)}
                          className={'rounded-lg border px-2.5 py-1 text-[12px] font-semibold transition-all disabled:opacity-60 ' + (ativo ? TIPO_META[tp].btn : 'bg-surface-2 border-border text-muted hover:text-ink hover:border-border-strong')}
                        >
                          {TIPO_META[tp].label}
                        </button>
                      )
                    })}
                    {confirmadoTipo && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400 ml-0.5"><path d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  {/* clipe sem fala: a IA descreveu a imagem — é por ela que dá pra saber de qual vídeo é */}
                  {!proposto && String(clA?.ia_resumo || '').startsWith('Imagem: ') && (
                    <div className="flex items-start gap-2 mb-2.5 text-[12px] text-muted">
                      <span className="shrink-0 inline-flex items-center rounded-md border border-white/20 bg-white/5 px-1.5 py-0.5 text-[11px] font-bold text-ink-2">sem fala</span>
                      <span className="leading-snug">{clA!.ia_resumo!.slice(8)}</span>
                    </div>
                  )}
                  {!proposto && !temTransc && (
                    <div className="text-[11px] text-muted mt-1.5">Ainda não classificado pela IA — você pode marcar manualmente.</div>
                  )}

                  {/* A IA dividiu a gravação em vídeos; se errou o lugar deste take, a pessoa troca aqui. */}
                  {divDoDia && clA?.divisao_id && (() => {
                    const doDia = [...new Set(videosDoDia.map((v) => classif[v.id]?.divisao_id).filter(Boolean) as string[])]
                      .map((id) => divDoDia.porId.get(id)).filter(Boolean) as Divisao[]
                    if (doDia.length < 2) return null
                    return (
                      <label className="mt-2.5 flex items-center gap-2 text-[12px] text-muted">
                        <span className="shrink-0">Vídeo do projeto:</span>
                        <select
                          value={clA.divisao_id || ''}
                          onChange={async (e) => {
                            const para = e.target.value
                            const id = aberto.id
                            setClassif((m) => ({ ...m, [id]: { ...m[id], divisao_id: para } }))
                            if (!(await moverParaDivisao(id, para))) listarClassificacoes().then(setClassif).catch(() => {})
                          }}
                          className="min-w-0 flex-1 max-w-[260px] h-8 rounded-lg bg-surface-2 border border-border px-2 text-[12px] text-ink outline-none focus:border-brand/60"
                        >
                          {doDia.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
                        </select>
                      </label>
                    )
                  })()}

                  {/* Tomadas unidas a esta: quem está classificando precisa ver a peça inteira, não só
                      o clipe aberto. Clicar pula direto pra outra tomada do grupo. */}
                  {clA?.grupo_id && (() => {
                    const irmas = (brutos || []).filter((v) => v.id !== aberto.id && classif[v.id]?.grupo_id === clA.grupo_id)
                    if (!irmas.length) return null
                    return (
                      <div className="mt-3 pt-3 border-t border-border">
                        <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted mb-1.5">
                          Unida a {irmas.length} tomada{irmas.length > 1 ? 's' : ''}
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {irmas.map((v) => {
                            const i = videosVisiveis.findIndex((x) => x.id === v.id)
                            return (
                              <button
                                key={v.id}
                                onClick={() => i >= 0 && setIdx(i)}
                                disabled={i < 0}
                                title={i < 0 ? v.nome + ' (está em outro dia/filtro)' : 'Abrir ' + v.nome}
                                className="shrink-0 w-[112px] text-left disabled:opacity-50"
                              >
                                <div className="relative aspect-video rounded-lg bg-surface-2 border border-border overflow-hidden">
                                  {v.thumb && <img src={v.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />}
                                  <span className="absolute bottom-0.5 right-0.5 tnum text-[10px] font-bold text-white bg-black/70 rounded px-1">{fmtDur(v.seg)}</span>
                                </div>
                                <div className="text-[11px] text-ink-2 truncate mt-0.5">{v.nome}</div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Recado da tomada. Vai junto pro card ligado — o editor trabalha pelo Quadro. */}
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted mb-1.5">Comentário {clA?.card_id && <span className="normal-case tracking-normal font-medium text-brand-2">— vai pro card</span>}</div>
                    <textarea
                      key={aberto.id}
                      defaultValue={clA?.comentario || ''}
                      onBlur={(e) => {
                        const t = e.target.value
                        if ((clA?.comentario || '') === t) return
                        setClassif((m) => ({ ...m, [aberto.id]: { ...(m[aberto.id] || { drive_id: aberto.id }), comentario: t } as Classificacao }))
                        comentarBruto(aberto.id, t)
                          .then(() => { setAvisoNome(clA?.card_id ? 'Comentário salvo e enviado pro card' : 'Comentário salvo'); setTimeout(() => setAvisoNome(''), 3000) })
                          .catch(() => { setAvisoNome('Não consegui salvar o comentário'); setTimeout(() => setAvisoNome(''), 4000) })
                      }}
                      rows={2}
                      placeholder="Ex.: cortar os 3s do começo, ele tossiu no meio…"
                      className="w-full rounded-lg bg-surface border border-border px-3 py-2 text-[13px] text-ink outline-none focus:border-brand/60 placeholder:text-muted resize-y"
                    />
                  </div>

                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">Produto</div>
                      {clA?.produto && <button onClick={() => definirProduto(null)} className="text-[11px] text-muted hover:text-rose-300">tirar</button>}
                    </div>
                    <ProdutoPicker value={clA?.produto || undefined} onChange={(p) => definirProduto(p)} />
                  </div>

                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted mb-1.5">Tarefa ligada</div>
                    {(() => {
                      const cardId = clA?.card_id || null
                      const cardLig = cardId ? cards.find((c) => c.id === cardId) : null
                      if (cardLig) {
                        return (
                          <div className="flex items-center gap-2">
                            {cardLig.copy && <span className="shrink-0 text-[11px] font-bold text-brand-2 bg-brand/12 rounded-full px-2 py-0.5">{cardLig.copy}</span>}
                            {cardLig.semRoteiro && <span className="shrink-0 text-[11px] font-bold text-amber bg-amber/12 rounded-full px-2 py-0.5">sem roteiro</span>}
                            <span className="text-[13px] font-semibold truncate flex-1">{cardLig.titulo}</span>
                            <button onClick={desligar} className="shrink-0 text-[11px] text-muted hover:text-rose-300">Desligar</button>
                          </div>
                        )
                      }
                      if (!linkOpen) {
                        const ehBoa = (clA?.tipo || clA?.ia_tipo) === 'boa'
                        const sugere = ehBoa && !clA?.card_id && !clA?.sugestao_rejeitada && !!clA?.sugestao_titulo
                        return (
                          <div className="flex flex-col gap-2">
                            {sugere && (() => {
                              const tituloEdit = sugTitulo ?? (clA!.sugestao_titulo || '')
                              return (
                                <div className="rounded-lg border border-brand/30 bg-brand/8 p-2.5">
                                  <div className="text-[11px] font-bold uppercase tracking-wide text-brand-2 mb-1.5">IA sugeriu um card — edite se quiser</div>
                                  <input value={tituloEdit} onChange={(e) => setSugTitulo(e.target.value)} className="w-full h-9 px-3 rounded-lg bg-surface border border-border text-[13px] text-ink outline-none focus:border-brand/60 mb-1" />
                                  {/* o arquivo fica com o NOME DO CARD (prefixo BR-, não o SR- antigo) */}
                                  <div className="text-[11px] text-muted mb-2">Vídeo no Drive: <span className="text-ink-2 font-medium">BR-{tituloEdit.trim() || '…'}</span></div>
                                  {/* a categoria era 'Conteúdo' fixa no código: anúncio virava conteúdo sem ninguém poder trocar */}
                                  <div className="flex flex-wrap items-center gap-1 mb-2">
                                    {CATEGORIAS.map((cat) => (
                                      <button key={cat} onClick={() => setNovaCat(cat)} className={'text-[11px] font-semibold rounded-lg border px-2 py-1 transition-colors ' + (novaCat === cat ? 'bg-brand/12 border-brand/40 text-brand-2' : 'bg-surface-2 border-border text-muted hover:text-ink')}>{cat}</button>
                                    ))}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button disabled={ligando || !tituloEdit.trim()} onClick={() => aprovarSugestao(tituloEdit.trim())} className="text-[12px] font-semibold text-white bg-brand rounded-lg px-3 py-1.5 disabled:opacity-50">Aprovar</button>
                                    <button onClick={() => rejeitarSug(aberto.id)} className="text-[12px] font-medium text-muted hover:text-rose-300 px-2">Rejeitar</button>
                                  </div>
                                </div>
                              )
                            })()}
                            <button onClick={() => setLinkOpen(true)} className="self-start text-[12px] font-semibold text-brand-2 bg-surface-2 border border-border rounded-lg px-3 py-1.5 hover:border-brand/50 transition-colors">+ Ligar a uma tarefa</button>
                          </div>
                        )
                      }
                      const filtradas = cards.filter((c) => !c.arquivado && (c.titulo + ' ' + (c.copy || '') + ' ' + (c.campanha || '')).toLowerCase().includes(buscaCard.toLowerCase())).slice(0, 8)
                      return (
                        <div className="flex flex-col gap-2">
                          <input value={buscaCard} onChange={(e) => setBuscaCard(e.target.value)} placeholder="Buscar tarefa existente…" autoFocus className="h-9 px-3 rounded-lg bg-surface border border-border text-[13px] text-ink outline-none focus:border-brand/60" />
                          <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                            {filtradas.map((c) => (
                              <button key={c.id} disabled={ligando} onClick={() => ligar(c.id)} className="text-left flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2 transition-colors disabled:opacity-50">
                                <span className="shrink-0 text-[11px] font-bold text-brand-2 bg-brand/12 rounded-full px-1.5 py-0.5">{c.copy ?? (c.semRoteiro ? 'sem rot.' : '—')}</span>
                                <span className="text-[12px] truncate">{c.titulo}</span>
                              </button>
                            ))}
                            {filtradas.length === 0 && <div className="text-[12px] text-muted px-2 py-1">Nenhuma tarefa encontrada.</div>}
                          </div>
                          <div className="border-t border-border pt-2">
                            <div className="text-[11px] font-bold uppercase tracking-wide text-muted mb-1.5">Ou criar tarefa "Sem roteiro"</div>
                            <input value={novaTarefa} onChange={(e) => setNovaTarefa(e.target.value)} placeholder="Título da gravação…" className="w-full h-9 px-3 rounded-lg bg-surface border border-border text-[13px] text-ink outline-none focus:border-brand/60 mb-2" />
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {CATEGORIAS.map((cat) => (
                                <button key={cat} onClick={() => setNovaCat(cat)} className={'text-[11px] font-semibold rounded-lg border px-2 py-1 transition-colors ' + (novaCat === cat ? 'bg-brand/12 border-brand/40 text-brand-2' : 'bg-surface-2 border-border text-muted hover:text-ink')}>{cat}</button>
                              ))}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mb-2">
                              <span className="text-[11px] font-bold uppercase tracking-wide text-muted mr-0.5">Copy</span>
                              {copysDoTime(getTeam()).map((c) => (
                                <button key={c} onClick={() => setNovaCopy(novaCopy === c ? undefined : c)} className={'text-[11px] font-semibold rounded-lg border px-2 py-1 transition-colors ' + (novaCopy === c ? 'text-brand-2 bg-brand/12 border-brand/40' : 'bg-surface-2 border-border text-muted hover:text-ink')}>{c}</button>
                              ))}
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => setLinkOpen(false)} className="text-[12px] text-muted px-2 hover:text-ink">Cancelar</button>
                              <button onClick={criarELigar} disabled={!novaTarefa.trim() || ligando} className="ml-auto text-[12px] font-semibold text-white bg-brand rounded-lg px-3 py-1.5 disabled:opacity-50">Criar e ligar</button>
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      ), document.body)}
    </div>
  )
}
