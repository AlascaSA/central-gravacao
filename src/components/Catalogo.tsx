import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { listarBrutos, renomearBruto, type Bruto } from '../data/brutos'
import { listarClassificacoes, confirmarTipo, ligarBruto, type Classificacao, type TipoBruto } from '../data/catalogoBrutos'
import { store } from '../data/store'
import { CATEGORIAS, type Card, type Categoria } from '../types'
import { semanaDeGravacao } from '../week'

// proxy leve (1080p + áudio AAC, faststart) no Supabase Storage; quando existe, toca com som
const SUPA = import.meta.env.VITE_SUPABASE_URL as string
const proxyDe = (id: string) => `${SUPA}/storage/v1/object/public/proxies/${id}.mp4`
const baixarUrl = (b: Bruto) => `/api/bruto-video?id=${b.id}&download=1&nome=${encodeURIComponent(b.nome)}`

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

// pasta mês/dia derivada da data do vídeo (estilo Finder, sem mexer no Drive)
const MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
function mesDiaDe(criado?: string | null): { mes: string; dia: string; mesOrd: number; diaOrd: number } {
  const d = criado ? new Date(criado) : null
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
      <div className="aspect-video rounded-xl bg-surface-2 border border-border grid place-items-center mb-2 text-brand-2/70 group-hover:text-brand-2 transition-colors">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" /></svg>
      </div>
      <div className="text-[13.5px] font-bold truncate">{label}</div>
      <div className="text-[11.5px] text-muted mt-0.5">{sub}</div>
    </button>
  )
}

export default function Catalogo() {
  const [brutos, setBrutos] = useState<Bruto[] | null>(null)
  const [erro, setErro] = useState('')
  const [idx, setIdx] = useState<number | null>(null)
  const [classif, setClassif] = useState<Record<string, Classificacao>>({})
  const [salvandoTipo, setSalvandoTipo] = useState(false)
  const [cards, setCards] = useState<Card[]>([])
  const [linkOpen, setLinkOpen] = useState(false)
  const [buscaCard, setBuscaCard] = useState('')
  const [novaTarefa, setNovaTarefa] = useState('')
  const [novaCat, setNovaCat] = useState<Categoria>('Conteúdo')
  const [ligando, setLigando] = useState(false)
  const [nav, setNav] = useState<{ mes: string | null; dia: string | null }>({ mes: null, dia: null })
  function irPara(mes: string | null, dia: string | null) { setNav({ mes, dia }); setIdx(null) }
  const [proc, setProc] = useState<'idle' | 'indo' | 'ok' | 'erro'>('idle')
  async function processarNovos() {
    setProc('indo')
    try {
      const r = await fetch('/api/processar-brutos', { method: 'POST' })
      setProc(r.ok ? 'ok' : 'erro')
    } catch {
      setProc('erro')
    }
    setTimeout(() => setProc('idle'), 5000)
  }

  useEffect(() => {
    listarBrutos()
      .then(setBrutos)
      .catch((e) => setErro(e instanceof Error ? e.message : 'erro'))
    listarClassificacoes().then(setClassif).catch(() => {})
    store.listCards().then(setCards).catch(() => {})
  }, [])

  async function ligar(cardId: string) {
    if (!aberto) return
    const id = aberto.id, nome = aberto.nome
    setClassif((m) => ({ ...m, [id]: { ...(m[id] || { drive_id: id }), card_id: cardId } as Classificacao }))
    setLinkOpen(false)
    await ligarBruto(id, cardId, nome).catch(() => {})
  }
  async function desligar() {
    if (!aberto) return
    const id = aberto.id
    setClassif((m) => ({ ...m, [id]: { ...(m[id] || { drive_id: id }), card_id: null } as Classificacao }))
    await ligarBruto(id, null).catch(() => {})
  }
  async function criarELigar() {
    const t = novaTarefa.trim()
    if (!t || ligando) return
    setLigando(true)
    try {
      // a tarefa "Sem roteiro" cai na semana de produção do vídeo (Seg–Qua = semana da data; Qui–Dom = próxima)
      const semana = aberto?.criado ? semanaDeGravacao(new Date(aberto.criado)) : undefined
      const card = await store.createCard({ copy: 'Sem roteiro', titulo: t, categoria: novaCat, fase: 'A editar', semana })
      setCards((cs) => [card, ...cs])
      await ligar(card.id)
      setNovaTarefa('')
    } finally {
      setLigando(false)
    }
  }

  async function confirmar(b: Bruto, tipo: TipoBruto) {
    const cl = classif[b.id]
    setSalvandoTipo(true)
    // otimista
    setClassif((m) => ({ ...m, [b.id]: { ...(m[b.id] || { drive_id: b.id }), tipo, confirmado: true } as Classificacao }))
    try {
      await confirmarTipo(b.id, tipo, cl?.transcricao ?? null, b.seg)
    } finally {
      setSalvandoTipo(false)
    }
  }

  // agrupa os brutos por mês → dia (pastas do catálogo)
  const arvore = useMemo(() => {
    const meses = new Map<string, { mes: string; mesOrd: number; dias: Map<string, { dia: string; diaOrd: number; videos: Bruto[] }> }>()
    for (const b of brutos || []) {
      const { mes, dia, mesOrd, diaOrd } = mesDiaDe(b.criado)
      let m = meses.get(mes)
      if (!m) { m = { mes, mesOrd, dias: new Map() }; meses.set(mes, m) }
      let dd = m.dias.get(dia)
      if (!dd) { dd = { dia, diaOrd, videos: [] }; m.dias.set(dia, dd) }
      dd.videos.push(b)
    }
    return [...meses.values()].sort((a, b) => b.mesOrd - a.mesOrd)
  }, [brutos])

  const mesAtual = nav.mes ? arvore.find((m) => m.mes === nav.mes) || null : null
  const diaAtual = mesAtual && nav.dia ? mesAtual.dias.get(nav.dia) || null : null

  // filtros do catálogo (quando algum está ativo, mostra grade plana de tudo que casa)
  const [fTipo, setFTipo] = useState<'todas' | TipoBruto>('todas')
  const [fProduto, setFProduto] = useState('')
  const [fSemana, setFSemana] = useState('')
  const filtrando = fTipo !== 'todas' || !!fProduto || !!fSemana
  const produtoDoBruto = (b: Bruto) => { const cid = classif[b.id]?.card_id; return cid ? cards.find((c) => c.id === cid)?.produto : undefined }
  const semanaDoBruto = (b: Bruto) => (b.criado ? semanaDeGravacao(new Date(b.criado)) : '')
  const filtrados = useMemo(() => {
    if (!brutos) return []
    return brutos.filter((b) => {
      if (fTipo !== 'todas' && (classif[b.id]?.tipo || classif[b.id]?.ia_tipo) !== fTipo) return false
      if (fProduto && produtoDoBruto(b) !== fProduto) return false
      if (fSemana && semanaDoBruto(b) !== fSemana) return false
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brutos, classif, cards, fTipo, fProduto, fSemana])

  const videosVisiveis = filtrando ? filtrados : diaAtual ? diaAtual.videos : []
  const produtosFiltro = [...new Set(cards.map((c) => c.produto).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b))
  const semanasFiltro = [...new Set((brutos || []).map(semanaDoBruto).filter(Boolean))].sort().reverse()

  const aberto = idx != null ? videosVisiveis[idx] ?? null : null
  const temPrev = idx != null && idx > 0
  const temNext = idx != null && idx < videosVisiveis.length - 1

  // seleção múltipla + baixar originais em lote
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [baixando, setBaixando] = useState(false)
  const [baixIdx, setBaixIdx] = useState(0)
  function toggleSel(id: string) {
    setSel((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  async function baixarOriginais() {
    if (!brutos) return
    const alvo = brutos.filter((b) => sel.has(b.id))
    setBaixando(true)
    for (let k = 0; k < alvo.length; k++) {
      setBaixIdx(k + 1)
      const a = document.createElement('a')
      a.href = baixarUrl(alvo[k])
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      await new Promise((r) => setTimeout(r, 1200))
    }
    setBaixando(false)
    setBaixIdx(0)
  }

  // estado do player
  const [pronto, setPronto] = useState(false)
  const [buff, setBuff] = useState(true)
  const [vidErro, setVidErro] = useState(false)
  // 'proxy' = versão leve com áudio; 'raw' = bruto 4K direto (mudo); 'checando' = decidindo
  const [fonte, setFonte] = useState<'checando' | 'proxy' | 'raw'>('checando')
  // edição do nome
  const [editNome, setEditNome] = useState(false)
  const [nomeTmp, setNomeTmp] = useState('')
  const [salvNome, setSalvNome] = useState(false)
  const [erroNome, setErroNome] = useState('')

  useEffect(() => {
    setPronto(false)
    setBuff(true)
    setVidErro(false)
    setEditNome(false)
    setErroNome('')
    setLinkOpen(false)
    setBuscaCard('')
    setNovaTarefa('')
    if (!aberto) { setFonte('checando'); return }
    let vivo = true
    setFonte('checando')
    fetch(proxyDe(aberto.id), { method: 'GET', headers: { Range: 'bytes=0-0' } })
      .then((r) => { if (vivo) setFonte(r.ok ? 'proxy' : 'raw') })
      .catch(() => { if (vivo) setFonte('raw') })
    return () => { vivo = false }
  }, [aberto?.id])

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

  const navBtn = 'h-8 w-8 grid place-items-center rounded-lg bg-surface-2 border border-border text-muted disabled:opacity-30 hover:text-ink transition-colors text-[18px] leading-none'

  const cardEl = (b: Bruto, i: number) => {
    const marcado = sel.has(b.id)
    const cl = classif[b.id]
    const t = cl?.tipo || cl?.ia_tipo || null
    const confirmado = !!cl?.confirmado
    return (
      <button key={b.id} onClick={() => setIdx(i)} className={'group text-left rounded-2xl border bg-surface p-3 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-8px_rgba(0,0,0,0.6)] transition-all ' + (marcado ? 'border-brand/70' : 'border-border hover:border-border-strong')}>
        <div className="relative aspect-video rounded-xl bg-surface-2 border border-border overflow-hidden mb-2 grid place-items-center text-muted">
          <svg width="26" height="26" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
          {b.thumb && <img src={b.thumb} alt="" loading="lazy" decoding="async" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} className="absolute inset-0 h-full w-full object-cover" />}
          <span className="absolute inset-0 grid place-items-center bg-black/0 group-hover:bg-black/25 transition-colors">
            <span className="h-9 w-9 rounded-full bg-black/0 group-hover:bg-black/55 backdrop-blur-sm grid place-items-center opacity-0 group-hover:opacity-100 transition-all">
              <svg width="15" height="15" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="white" /></svg>
            </span>
          </span>
          <span role="checkbox" aria-checked={marcado} onClick={(e) => { e.stopPropagation(); toggleSel(b.id) }} className={'absolute top-1.5 left-1.5 h-5 w-5 rounded-md border grid place-items-center transition-all cursor-pointer ' + (marcado ? 'bg-brand border-brand opacity-100' : 'bg-black/45 border-white/50 opacity-0 group-hover:opacity-100 ' + (sel.size > 0 ? 'opacity-70' : ''))}>
            {marcado && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>}
          </span>
          {t && (
            <span className={'absolute top-1.5 right-1.5 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold backdrop-blur-sm ' + TIPO_META[t].badge + (confirmado ? '' : ' opacity-90')}>
              {!confirmado && <span className="text-[8px] font-semibold opacity-70">IA</span>}
              {TIPO_META[t].label}
            </span>
          )}
        </div>
        <div className="text-[13px] font-bold truncate">{b.nome}</div>
        <div className="text-[11.5px] text-muted tnum mt-0.5">{fmtDur(b.seg)}</div>
      </button>
    )
  }

  return (
    <div className="relative z-10 px-4 sm:px-6 pb-24 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 pt-3 pb-3">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-ink-2">Brutos no Drive</h2>
        {brutos && <span className="tnum text-[11px] font-bold text-brand-2 bg-brand/12 rounded-full px-2 py-0.5">{brutos.length}</span>}
        {sel.size > 0 ? (
          <button onClick={() => setSel(new Set())} className="ml-auto text-[12px] font-medium text-muted hover:text-ink">Limpar seleção</button>
        ) : (
          <button
            onClick={processarNovos}
            disabled={proc === 'indo'}
            title="Gera versão leve + classificação dos vídeos novos (roda na nuvem)"
            className={'ml-auto inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-lg px-2.5 py-1.5 border transition-colors disabled:opacity-60 ' + (proc === 'erro' ? 'bg-red/10 border-red/30 text-red' : proc === 'ok' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-surface-2 border-border text-brand-2 hover:border-brand/50')}
          >
            {proc === 'indo' ? (
              <span className="h-3.5 w-3.5 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" /></svg>
            )}
            {proc === 'indo' ? 'Disparando…' : proc === 'ok' ? 'Disparado!' : proc === 'erro' ? 'Falhou' : 'Processar novos'}
          </button>
        )}
      </div>

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
          <div className="flex items-center gap-1.5 flex-wrap mb-3">
            <button onClick={() => setFTipo('todas')} className={'text-[12px] font-semibold rounded-lg px-2.5 py-1.5 border transition-colors ' + (fTipo === 'todas' ? 'bg-brand/15 border-brand/50 text-brand-2' : 'bg-surface-2 border-border text-muted hover:text-ink')}>Todas</button>
            {TIPOS.map((v) => (
              <button key={v} onClick={() => setFTipo(v)} className={'text-[12px] font-semibold rounded-lg px-2.5 py-1.5 border transition-colors ' + (fTipo === v ? TIPO_META[v].badge : 'bg-surface-2 border-border text-muted hover:text-ink')}>{TIPO_META[v].label}</button>
            ))}
            <span className="w-px h-5 bg-border mx-0.5" />
            <select value={fProduto} onChange={(e) => setFProduto(e.target.value)} className={'h-[34px] rounded-lg border bg-surface-2 px-2 text-[12.5px] outline-none cursor-pointer ' + (fProduto ? 'border-brand/50 text-ink' : 'border-border text-muted')}>
              <option value="">Produto: todos</option>
              {produtosFiltro.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={fSemana} onChange={(e) => setFSemana(e.target.value)} className={'h-[34px] rounded-lg border bg-surface-2 px-2 text-[12.5px] outline-none cursor-pointer ' + (fSemana ? 'border-brand/50 text-ink' : 'border-border text-muted')}>
              <option value="">Semana: todas</option>
              {semanasFiltro.map((s) => <option key={s} value={s}>{'Semana ' + s.slice(8, 10) + '/' + s.slice(5, 7)}</option>)}
            </select>
            {filtrando && <button onClick={() => { setFTipo('todas'); setFProduto(''); setFSemana('') }} className="text-[12px] font-medium text-muted hover:text-rose-300 ml-0.5">limpar</button>}
          </div>

          {filtrando ? (
            <>
              <div className="text-[12px] text-muted mb-2 tnum">{filtrados.length} vídeo{filtrados.length === 1 ? '' : 's'}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">{videosVisiveis.map(cardEl)}</div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5 text-[13px] mb-3 flex-wrap">
                <button onClick={() => irPara(null, null)} className={nav.mes ? 'text-muted hover:text-ink' : 'text-ink font-bold'}>Tudo</button>
                {nav.mes && <><span className="text-muted">›</span><button onClick={() => irPara(nav.mes, null)} className={nav.dia ? 'text-muted hover:text-ink' : 'text-ink font-bold'}>{nav.mes}</button></>}
                {nav.dia && <><span className="text-muted">›</span><span className="text-ink font-bold">Dia {nav.dia}</span></>}
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

              {nav.dia && <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">{videosVisiveis.map(cardEl)}</div>}
            </>
          )}
        </>
      )}

      {/* barra de seleção (some quando o player está aberto) */}
      {sel.size > 0 && !aberto && (
        <div className="glass fixed bottom-0 left-0 right-0 z-40 px-4 sm:px-6 pt-3 pb-[calc(env(safe-area-inset-bottom)+14px)] border-t border-border/70">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <span className="text-[13.5px] font-semibold">{sel.size} selecionado{sel.size > 1 ? 's' : ''}</span>
            <div className="flex-1" />
            <button onClick={() => setSel(new Set())} className="h-11 px-4 rounded-xl bg-surface-2 border border-border text-ink font-semibold text-[13px] hover:border-border-strong transition-all">Limpar</button>
            <button
              onClick={baixarOriginais}
              disabled={baixando}
              className="h-11 px-5 inline-flex items-center gap-2 rounded-xl bg-brand text-white font-bold text-[14px] shadow-[0_10px_30px_-6px_rgba(20,168,245,0.5)] active:scale-[0.98] transition-transform disabled:opacity-70"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v12M6 10l6 6 6-6" /><path d="M4 20h16" /></svg>
              {baixando ? `Baixando ${baixIdx}/${sel.size}…` : 'Baixar originais'}
            </button>
          </div>
        </div>
      )}

      {aberto && createPortal((
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fade-in absolute inset-0 bg-black/70" onClick={() => setIdx(null)} />
          <div className="sheet-up relative w-full max-w-2xl h-[86vh] flex flex-col bg-elev border border-border-strong rounded-2xl p-4 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]">
            <div className="flex items-center gap-2 mb-3 shrink-0">
              <div className="flex items-center gap-1 shrink-0">
                <button disabled={!temPrev} onClick={() => setIdx((i) => (i == null ? i : i - 1))} aria-label="Vídeo anterior" className={navBtn}>‹</button>
                <button disabled={!temNext} onClick={() => setIdx((i) => (i == null ? i : i + 1))} aria-label="Próximo vídeo" className={navBtn}>›</button>
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
                  <a href={baixarUrl(aberto)} className="shrink-0 text-[12px] font-semibold text-brand-2 bg-surface-2 border border-border rounded-lg px-3 py-1.5 hover:border-brand/50 transition-colors">Baixar</a>
                  <button onClick={() => setIdx(null)} aria-label="Fechar" className="shrink-0 h-9 w-9 grid place-items-center rounded-xl bg-surface-2 border border-border text-muted hover:text-ink transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </>
              )}
            </div>
            <div className="relative flex-1 min-h-0">
              {fonte === 'checando' ? (
                <div className="w-full h-full grid place-items-center rounded-xl bg-black">
                  <div className="h-8 w-8 rounded-full border-[3px] border-white/25 border-t-white animate-spin" />
                </div>
              ) : (
                <video
                  key={aberto.id + fonte}
                  ref={(el) => { if (el) el.muted = fonte !== 'proxy' }}
                  src={fonte === 'proxy' ? proxyDe(aberto.id) : `/api/bruto-video?id=${aberto.id}`}
                  poster={aberto.thumb || undefined}
                  controls
                  muted={fonte !== 'proxy'}
                  autoPlay
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-contain rounded-xl bg-black"
                  onLoadStart={() => { setPronto(false); setBuff(true); setVidErro(false) }}
                  onCanPlay={(e) => { setPronto(true); setBuff(false); e.currentTarget.play().catch(() => {}) }}
                  onPlaying={() => { setPronto(true); setBuff(false) }}
                  onWaiting={() => setBuff(true)}
                  onError={() => setVidErro(true)}
                />
              )}
              {fonte !== 'checando' && !vidErro && (!pronto || buff) && (
                <div className="absolute inset-0 grid place-items-center rounded-xl bg-black/45 pointer-events-none">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-8 w-8 rounded-full border-[3px] border-white/25 border-t-white animate-spin" />
                    <span className="text-[12px] font-medium text-white/85">{pronto ? 'Bufferizando…' : fonte === 'raw' ? 'Carregando 4K…' : 'Carregando…'}</span>
                  </div>
                </div>
              )}
              {vidErro && (
                <div className="absolute inset-0 grid place-items-center rounded-xl bg-black/60 p-4 text-center">
                  <div>
                    <div className="text-[13px] font-semibold text-white mb-1">Não consegui carregar o vídeo</div>
                    <div className="text-[12px] text-white/70 mb-3">Tente baixar para assistir.</div>
                    <a href={baixarUrl(aberto)} className="inline-block text-[12px] font-semibold text-white bg-brand rounded-lg px-3 py-1.5">Baixar vídeo</a>
                  </div>
                </div>
              )}
              {fonte !== 'checando' && temPrev && (
                <button onClick={() => setIdx((i) => (i == null ? i : i - 1))} aria-label="Vídeo anterior" className="absolute left-1.5 top-1/2 -translate-y-1/2 h-10 w-10 grid place-items-center rounded-full bg-black/45 hover:bg-black/70 text-white backdrop-blur-sm transition-colors text-[20px] leading-none">‹</button>
              )}
              {fonte !== 'checando' && temNext && (
                <button onClick={() => setIdx((i) => (i == null ? i : i + 1))} aria-label="Próximo vídeo" className="absolute right-1.5 top-1/2 -translate-y-1/2 h-10 w-10 grid place-items-center rounded-full bg-black/45 hover:bg-black/70 text-white backdrop-blur-sm transition-colors text-[20px] leading-none">›</button>
              )}
            </div>
            {fonte === 'raw' && (
              <div className="mt-2 flex items-center gap-1.5 text-[11.5px] text-muted">
                <div className="h-3.5 w-3.5 rounded-full border-2 border-border-strong border-t-brand animate-spin shrink-0" />
                <span>Gerando versão leve com áudio… por ora, prévia 4K sem som (baixe para ouvir).</span>
              </div>
            )}
            {(() => {
              const clA = classif[aberto.id]
              const proposto = clA?.ia_tipo || null
              const confirmadoTipo = clA?.tipo || null
              const temTransc = clA && clA.transcricao !== undefined
              return (
                <div className="mt-3 border-t border-border pt-3 shrink-0 max-h-[34vh] overflow-y-auto">
                  {temTransc && (
                    <div className="mb-2.5">
                      <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted mb-1">O que ele fala</div>
                      <p className="text-[12.5px] text-ink-2 leading-snug max-h-24 overflow-auto whitespace-pre-wrap">{clA!.transcricao || '(silêncio / sem fala detectada)'}</p>
                    </div>
                  )}
                  {proposto && (
                    <div className="flex items-start gap-2 mb-2.5 text-[12px] text-muted">
                      <span className={'shrink-0 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold ' + TIPO_META[proposto].badge}>IA: {TIPO_META[proposto].label}</span>
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
                  {!proposto && !temTransc && (
                    <div className="text-[11px] text-muted mt-1.5">Ainda não classificado pela IA — você pode marcar manualmente.</div>
                  )}

                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted mb-1.5">Tarefa ligada</div>
                    {(() => {
                      const cardId = clA?.card_id || null
                      const cardLig = cardId ? cards.find((c) => c.id === cardId) : null
                      if (cardLig) {
                        return (
                          <div className="flex items-center gap-2">
                            <span className="shrink-0 text-[10.5px] font-bold text-brand-2 bg-brand/12 rounded-full px-2 py-0.5">{cardLig.copy}</span>
                            <span className="text-[13px] font-semibold truncate flex-1">{cardLig.titulo}</span>
                            <button onClick={desligar} className="shrink-0 text-[11px] text-muted hover:text-rose-300">Desligar</button>
                          </div>
                        )
                      }
                      if (!linkOpen) {
                        return <button onClick={() => setLinkOpen(true)} className="text-[12px] font-semibold text-brand-2 bg-surface-2 border border-border rounded-lg px-3 py-1.5 hover:border-brand/50 transition-colors">+ Ligar a uma tarefa</button>
                      }
                      const filtradas = cards.filter((c) => !c.arquivado && (c.titulo + ' ' + c.copy + ' ' + (c.campanha || '')).toLowerCase().includes(buscaCard.toLowerCase())).slice(0, 8)
                      return (
                        <div className="flex flex-col gap-2">
                          <input value={buscaCard} onChange={(e) => setBuscaCard(e.target.value)} placeholder="Buscar tarefa existente…" autoFocus className="h-9 px-3 rounded-lg bg-surface border border-border text-[13px] text-ink outline-none focus:border-brand/60" />
                          <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                            {filtradas.map((c) => (
                              <button key={c.id} disabled={ligando} onClick={() => ligar(c.id)} className="text-left flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2 transition-colors disabled:opacity-50">
                                <span className="shrink-0 text-[10px] font-bold text-brand-2 bg-brand/12 rounded-full px-1.5 py-0.5">{c.copy}</span>
                                <span className="text-[12.5px] truncate">{c.titulo}</span>
                              </button>
                            ))}
                            {filtradas.length === 0 && <div className="text-[11.5px] text-muted px-2 py-1">Nenhuma tarefa encontrada.</div>}
                          </div>
                          <div className="border-t border-border pt-2">
                            <div className="text-[10px] font-bold uppercase tracking-wide text-muted mb-1.5">Ou criar tarefa "Sem roteiro"</div>
                            <input value={novaTarefa} onChange={(e) => setNovaTarefa(e.target.value)} placeholder="Título da gravação…" className="w-full h-9 px-3 rounded-lg bg-surface border border-border text-[13px] text-ink outline-none focus:border-brand/60 mb-2" />
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {CATEGORIAS.map((cat) => (
                                <button key={cat} onClick={() => setNovaCat(cat)} className={'text-[11px] font-semibold rounded-lg border px-2 py-1 transition-colors ' + (novaCat === cat ? 'bg-brand border-brand text-white' : 'bg-surface-2 border-border text-muted hover:text-ink')}>{cat}</button>
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
