import { useEffect, useRef, useState, type RefObject } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { FASES, fasesDoTime, type Card, type Fase } from '../types'
import { getTeam, labelFase } from '../data/team'
import { listarBrutosDeCards } from '../data/catalogoBrutos'
import Column, { FASE_COR } from './Column'
import { CardView } from './CardItem'

export default function Board({
  cards,
  selMode,
  scrollRef,
  semanaVista,
  onMove,
  onArchive,
  onPushSemana,
  onDelete,
  onOpen,
}: {
  cards: Card[]
  selMode?: boolean
  scrollRef: RefObject<HTMLDivElement | null>
  semanaVista?: string | null
  onMove: (id: string, fase: Fase) => void
  onArchive: (id: string) => void
  onPushSemana?: (id: string) => void
  onDelete?: (id: string) => void
  onOpen?: (card: Card) => void
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const fasesTime = fasesDoTime(getTeam())
  // no celular o quadro vira acordeão: um estágio aberto por vez
  const [faseMobile, setFaseMobile] = useState<Fase>(() => fasesTime[0])
  // card cujo destino está sendo escolhido na folha de estágios (só celular)
  const [movendo, setMovendo] = useState<Card | null>(null)
  // confirmação curta depois de mover — o card sai da lista e some da vista sem isso
  const [aviso, setAviso] = useState<{ titulo: string; fase: Fase } | null>(null)
  const ponteiro = useRef<{ x: number } | null>(null)

  function proximaDe(f: Fase): Fase | null {
    const i = fasesTime.indexOf(f)
    return i >= 0 && i < fasesTime.length - 1 ? fasesTime[i + 1] : null
  }

  function mover(card: Card, destino: Fase) {
    if (card.fase === destino) return
    onMove(card.id, destino)
    setMovendo(null)
    setAviso({ titulo: card.titulo, fase: destino })
  }
  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 4000)
    return () => clearTimeout(t)
  }, [aviso])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  // auto-scroll horizontal do quadro enquanto arrasta um card perto das bordas
  useEffect(() => {
    if (!activeId) return
    const el = scrollRef.current
    if (!el) return
    const captura = (e: PointerEvent | TouchEvent) => {
      const t = 'touches' in e ? e.touches[0] : (e as PointerEvent)
      if (t) ponteiro.current = { x: t.clientX }
    }
    window.addEventListener('pointermove', captura, { passive: true })
    window.addEventListener('touchmove', captura, { passive: true })
    const BORDA = 90
    const VEL = 22
    let raf = 0
    const passo = () => {
      const p = ponteiro.current
      if (p) {
        const r = el.getBoundingClientRect()
        if (p.x > r.right - BORDA) el.scrollLeft += VEL * Math.min(1, (p.x - (r.right - BORDA)) / BORDA)
        else if (p.x < r.left + BORDA) el.scrollLeft -= VEL * Math.min(1, (r.left + BORDA - p.x) / BORDA)
      }
      raf = requestAnimationFrame(passo)
    }
    raf = requestAnimationFrame(passo)
    return () => {
      window.removeEventListener('pointermove', captura)
      window.removeEventListener('touchmove', captura)
      cancelAnimationFrame(raf)
      ponteiro.current = null
    }
  }, [activeId])

  const activeCard = activeId ? cards.find((c) => c.id === activeId) ?? null : null

  // seleção de cards p/ baixar os vídeos ligados em lote
  const [sel, setSel] = useState<Set<string>>(new Set())
  // arquivos ligados aos cards selecionados, pré-carregados (1 card pode ter mais de um vídeo)
  const [arquivos, setArquivos] = useState<{ drive_id: string; nome?: string | null; capa_url?: string | null; mb?: number | null }[]>([])
  function toggleSel(id: string) {
    setSel((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  // ao desligar o modo seleção, zera o que estava marcado
  useEffect(() => {
    if (!selMode) { setSel(new Set()); setArquivos([]) }
  }, [selMode])

  // Os vídeos ligados são buscados ENQUANTO você seleciona, só pra já saber quantos são e quanto
  // pesam antes de clicar (um card pode ter mais de um vídeo ligado).
  useEffect(() => {
    if (!selMode || sel.size === 0) { setArquivos([]); return }
    let vivo = true
    listarBrutosDeCards([...sel])
      .then((bs) => { if (vivo) setArquivos(bs) })
      .catch(() => { if (vivo) setArquivos([]) })
    return () => { vivo = false }
  }, [sel, selMode])

  // Lote = pasta no próprio Drive. O .tar montado no nosso servidor estourava o limite de CPU e vinha
  // truncado (KB/MB no lugar de GB); aqui o Google copia dentro dele mesmo, sem limite de tamanho.
  // A pasta se apaga sozinha em 12h.
  const totalMb = arquivos.reduce((t, b) => t + (b.mb || 0), 0)
  const tamanho = totalMb >= 1024 ? (totalMb / 1024).toFixed(1).replace('.', ',') + ' GB' : totalMb + ' MB'
  const [preparando, setPreparando] = useState(false)
  const [erroLote, setErroLote] = useState('')

  async function abrirPacote() {
    if (preparando) return
    setPreparando(true)
    setErroLote('')
    // a aba é aberta ANTES do await: aberta dentro do clique, nenhum navegador bloqueia como pop-up
    const aba = window.open('', '_blank')
    try {
      const r = await fetch(`/api/pacote-drive?ids=${arquivos.map((b) => b.drive_id).join(',')}&team=${encodeURIComponent(getTeam())}`)
      const d = await r.json()
      if (!r.ok || !d.url) throw new Error(d.error || 'falhou')
      if (aba) aba.location.href = d.url
      else window.location.href = d.url
    } catch (e) {
      if (aba) aba.close()
      setErroLote(e instanceof Error ? e.message : 'não consegui preparar')
      setTimeout(() => setErroLote(''), 6000)
    } finally {
      setPreparando(false)
    }
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const over = e.over
    if (!over) return
    const fase = String(over.id) as Fase
    const card = cards.find((c) => c.id === String(e.active.id))
    if (card && (FASES as readonly string[]).includes(fase) && card.fase !== fase) {
      onMove(card.id, fase)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
      autoScroll={{ threshold: { x: 0, y: 0.25 }, acceleration: 18 }}
    >
      <div className="relative z-10 h-full">
        <div
          ref={scrollRef}
          className="scroll-quadro h-full overflow-auto px-4 sm:px-6 pt-5 pb-32 sm:pb-6"
        >
          {/* MOBILE: os estágios viram grupos recolhidos — a tela mostra 6 linhas em vez de 73 cards.
              Abre um estágio por vez; o resto continua à vista, só que fechado. Como não há coluna
              vizinha pra soltar o card, o movimento é por botão (ver CardView). */}
          <div className="sm:hidden flex flex-col gap-1.5">
            {fasesTime.map((f) => {
              const daFase = cards.filter((c) => c.fase === f)
              const aberto = faseMobile === f
              return (
                <div key={f} className="rounded-2xl border border-border bg-surface/60 overflow-hidden" data-fase={f}>
                  <button
                    onClick={() => setFaseMobile(aberto ? ('' as Fase) : f)}
                    className="w-full flex items-center gap-2.5 min-h-14 px-3.5 text-left"
                  >
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: FASE_COR[f] }} />
                    <span className="flex-1 text-[14px] font-bold text-ink truncate">{labelFase(f)}</span>
                    <span className="tnum text-[15px] font-black text-muted">{daFase.length}</span>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={'shrink-0 text-muted transition-transform ' + (aberto ? 'rotate-180' : '')}><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                  {aberto && (
                    <div className="px-2 pb-2">
                      {daFase.length === 0
                        ? <div className="py-6 text-center text-[12.5px] text-muted">nada neste estágio</div>
                        : <Column fase={f} soLista arrastando={activeId != null} cards={daFase} semanaVista={semanaVista} onArchive={onArchive} onPushSemana={onPushSemana} onDelete={onDelete} onOpen={onOpen} selecionados={sel} onToggleSel={selMode ? toggleSel : undefined} proxima={proximaDe(f)} onAvancar={(c) => { const p = proximaDe(f); if (p) mover(c, p) }} onEscolherFase={setMovendo} />}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* DESKTOP: o quadro de sempre. items-stretch estica todas as colunas até a altura da mais
              cheia, então há onde soltar o card na altura em que ele já está. */}
          <div className="hidden sm:flex items-stretch gap-5 sm:gap-6 min-h-full">
            {fasesTime.map((fase) => (
              <Column key={fase} fase={fase} arrastando={activeId != null} cards={cards.filter((c) => c.fase === fase)} semanaVista={semanaVista} onArchive={onArchive} onPushSemana={onPushSemana} onDelete={onDelete} onOpen={onOpen} selecionados={sel} onToggleSel={selMode ? toggleSel : undefined} />
            ))}
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeCard ? (
          <div style={{ width: 276 }} className="rotate-[2.5deg] cursor-grabbing">
            <CardView card={activeCard} onArchive={() => {}} overlay />
          </div>
        ) : null}
      </DragOverlay>

      {/* Folha de estágios (celular): pular etapas ou voltar. Sobe do rodapé, onde o polegar alcança. */}
      {movendo && (
        <div className="sm:hidden fixed inset-0 z-50 flex items-end">
          <div className="fade-in absolute inset-0 bg-black/65" onClick={() => setMovendo(null)} />
          <div className="sheet-up relative w-full bg-elev border-t border-border-strong rounded-t-3xl p-4 pb-[calc(env(safe-area-inset-bottom)+14px)] max-h-[calc(var(--vh-real,100vh)*0.86)] overflow-y-auto shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.8)]">
            <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Mover para</div>
            <div className="text-[15px] font-bold leading-snug mt-0.5 mb-3 line-clamp-2">{movendo.titulo}</div>
            <div className="flex flex-col gap-1.5">
              {fasesTime.map((f) => {
                const aqui = f === movendo.fase
                return (
                  <button
                    key={f}
                    onClick={() => mover(movendo, f)}
                    disabled={aqui}
                    className={
                      'w-full flex items-center gap-2.5 min-h-14 px-4 rounded-2xl border text-left transition-colors ' +
                      (aqui ? 'border-border bg-surface-2/60 opacity-70' : 'border-border bg-surface active:bg-surface-2 hover:border-border-strong')
                    }
                  >
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: FASE_COR[f] }} />
                    <span className="flex-1 text-[14.5px] font-bold text-ink truncate">{labelFase(f)}</span>
                    {aqui && <span className="shrink-0 text-[11.5px] font-semibold text-muted">está aqui</span>}
                  </button>
                )
              })}
            </div>
            <button onClick={() => setMovendo(null)} className="mt-2.5 w-full min-h-12 rounded-2xl bg-surface-2 border border-border text-ink-2 font-semibold text-[13.5px]">Cancelar</button>
          </div>
        </div>
      )}

      {/* O card sai da lista assim que anda; sem isso o toque não teria resposta nenhuma. Fica acima
          da barra fixa de "Subir roteiros / + Novo" (79px + safe-area), senão cai em cima dela. */}
      {aviso && !movendo && (
        <div className="sm:hidden fixed left-4 right-4 bottom-[calc(env(safe-area-inset-bottom)+90px)] z-40 fade-in">
          <button
            onClick={() => { setFaseMobile(aviso.fase); setAviso(null); document.querySelector(`[data-fase="${aviso.fase}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
            className="w-full flex items-center gap-2.5 min-h-14 px-4 rounded-2xl bg-elev border border-border-strong text-left shadow-[0_16px_40px_-10px_rgba(0,0,0,0.9)]"
          >
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: FASE_COR[aviso.fase] }} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold text-ink truncate">{aviso.titulo}</span>
              {/* "foi para" quebrava na fase "para Jaylton gravar" — virava "foi para para Jaylton gravar" */}
              <span className="block text-[12px] text-muted">agora em {labelFase(aviso.fase)}</span>
            </span>
            <span className="shrink-0 text-[12.5px] font-bold text-brand-2">ver</span>
          </button>
        </div>
      )}

      {selMode && !activeId && (
        <div className="fixed bottom-0 left-0 right-0 z-40 glass border-t border-border/70 px-4 sm:px-6 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3">
              <span className="text-[13px] font-semibold min-w-0">
                {sel.size === 0 ? 'Toque nos cards para baixar os vídeos' : `${sel.size} card${sel.size > 1 ? 's' : ''} selecionado${sel.size > 1 ? 's' : ''}`}
                {arquivos.length > 0 && (
                  <span className="hidden sm:block text-[11.5px] font-medium text-muted mt-0.5">Abre uma pasta no Drive com os vídeos — baixe por lá. Ela some sozinha em 12h.</span>
                )}
              </span>
              <div className="flex-1" />
              {sel.size > 0 && (
                <button onClick={() => setSel(new Set())} className="h-11 px-4 rounded-xl bg-surface-2 border border-border text-ink font-semibold text-[13px] hover:border-border-strong transition-all">Limpar</button>
              )}
              {erroLote && <span className="text-[12px] font-semibold text-red">{erroLote}</span>}
              {arquivos.length > 0 && (
                <button
                  onClick={abrirPacote}
                  disabled={preparando}
                  title="Junta os vídeos numa pasta do Drive e abre pra você baixar"
                  className="h-11 px-5 inline-flex items-center gap-2 rounded-xl bg-brand text-white font-bold text-[14px] shadow-[0_10px_30px_-6px_rgba(20,168,245,0.5)] active:scale-[0.98] disabled:opacity-70 transition-transform"
                >
                  {preparando ? (
                    <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  ) : (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v12M6 10l6 6 6-6" /><path d="M4 20h16" /></svg>
                  )}
                  {preparando ? 'Preparando…' : arquivos.length > 1 ? `Baixar ${arquivos.length} vídeos` : 'Baixar vídeo'}
                  {!preparando && <span className="tnum text-[12px] font-bold opacity-80">{tamanho}</span>}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </DndContext>
  )
}
