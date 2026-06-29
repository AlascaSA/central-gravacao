import { useEffect, useRef, useState } from 'react'
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
import { FASES, type Card, type Fase } from '../types'
import { listarBrutosDeCards } from '../data/catalogoBrutos'
import Column from './Column'
import { CardView } from './CardItem'

export default function Board({
  cards,
  onMove,
  onArchive,
  onPushSemana,
  onDelete,
  onOpen,
}: {
  cards: Card[]
  onMove: (id: string, fase: Fase) => void
  onArchive: (id: string) => void
  onPushSemana?: (id: string) => void
  onDelete?: (id: string) => void
  onOpen?: (card: Card) => void
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const ponteiro = useRef<{ x: number } | null>(null)

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
  const naJaylton = cards.filter((c) => c.fase === 'para Jaylton gravar').length
  function scrollToFim() {
    const el = scrollRef.current
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' })
  }

  // seleção de cards p/ baixar os vídeos ligados em lote
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [baixando, setBaixando] = useState(false)
  const [baixMsg, setBaixMsg] = useState('')
  function toggleSel(id: string) {
    setSel((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  async function baixarVideos() {
    if (sel.size === 0 || baixando) return
    setBaixando(true)
    setBaixMsg('buscando vídeos…')
    const brutos = await listarBrutosDeCards([...sel])
    if (brutos.length === 0) {
      setBaixMsg('Nenhum vídeo ligado nesses cards')
      setTimeout(() => { setBaixando(false); setBaixMsg('') }, 2500)
      return
    }
    for (let k = 0; k < brutos.length; k++) {
      setBaixMsg(`Baixando ${k + 1}/${brutos.length}…`)
      const a = document.createElement('a')
      a.href = `/api/bruto-video?id=${brutos[k].drive_id}&download=1&nome=${encodeURIComponent(brutos[k].nome || 'video.mp4')}`
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      await new Promise((r) => setTimeout(r, 1200))
    }
    setBaixando(false)
    setBaixMsg('')
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
      autoScroll={{ threshold: { x: 0, y: 0.2 } }}
    >
      <div className="relative z-10 h-full">
        <div
          ref={scrollRef}
          className={'flex gap-3.5 h-full overflow-x-auto px-4 sm:px-6 pt-4 ' + (activeId ? '' : '[scroll-snap-type:x_proximity]')}
        >
          {FASES.map((fase) => (
            <Column key={fase} fase={fase} arrastando={activeId != null} cards={cards.filter((c) => c.fase === fase)} onArchive={onArchive} onPushSemana={onPushSemana} onDelete={onDelete} onOpen={onOpen} selecionados={sel} onToggleSel={toggleSel} />
          ))}
        </div>

        {naJaylton > 0 && !activeId && (
          <button
            onClick={scrollToFim}
            title="Ir para a coluna do Jaylton"
            className="absolute top-3 right-4 sm:right-6 z-20 inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface/95 backdrop-blur px-3 py-1.5 text-[12px] font-semibold text-ink-2 shadow-[0_8px_22px_-8px_rgba(0,0,0,0.7)] hover:text-ink hover:border-[#94a3b8] transition-colors"
          >
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: '#94a3b8' }} />
            para Jaylton gravar
            <span className="tnum text-[11px] font-bold bg-surface-3 rounded-full px-1.5">{naJaylton}</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeCard ? (
          <div style={{ width: 276 }} className="rotate-[2.5deg] cursor-grabbing">
            <CardView card={activeCard} onArchive={() => {}} overlay />
          </div>
        ) : null}
      </DragOverlay>

      {sel.size > 0 && !activeId && (
        <div className="fixed bottom-0 left-0 right-0 z-40 glass border-t border-border/70 px-4 sm:px-6 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <span className="text-[13px] font-semibold">{sel.size} card{sel.size > 1 ? 's' : ''} selecionado{sel.size > 1 ? 's' : ''}</span>
            <div className="flex-1" />
            <button onClick={() => setSel(new Set())} className="h-11 px-4 rounded-xl bg-surface-2 border border-border text-ink font-semibold text-[13px] hover:border-border-strong transition-all">Limpar</button>
            <button onClick={baixarVideos} disabled={baixando} className="h-11 px-5 inline-flex items-center gap-2 rounded-xl bg-brand text-white font-bold text-[14px] shadow-[0_10px_30px_-6px_rgba(20,168,245,0.5)] active:scale-[0.98] transition-transform disabled:opacity-70">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v12M6 10l6 6 6-6" /><path d="M4 20h16" /></svg>
              {baixMsg || 'Baixar vídeos'}
            </button>
          </div>
        </div>
      )}
    </DndContext>
  )
}
