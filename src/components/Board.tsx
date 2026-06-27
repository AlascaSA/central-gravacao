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
      <div
        ref={scrollRef}
        className={'relative z-10 flex gap-3.5 overflow-x-auto px-4 sm:px-6 pt-4 pb-32 sm:pb-14 ' + (activeId ? '' : '[scroll-snap-type:x_proximity]')}
      >
        {FASES.map((fase) => (
          <Column key={fase} fase={fase} arrastando={activeId != null} cards={cards.filter((c) => c.fase === fase)} onArchive={onArchive} onPushSemana={onPushSemana} onDelete={onDelete} onOpen={onOpen} />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeCard ? (
          <div style={{ width: 276 }} className="rotate-[2.5deg] cursor-grabbing">
            <CardView card={activeCard} onArchive={() => {}} overlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
