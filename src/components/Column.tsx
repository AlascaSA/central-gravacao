import { useDroppable } from '@dnd-kit/core'
import type { Card, Fase } from '../types'
import DraggableCard from './CardItem'

// progressão fria (ciano → verde) = sensação de avanço no pipeline
const FASE_COR: Record<Fase, string> = {
  'A gravar': '#14a8f5',
  'A editar': '#39b9ef',
  'Em edição': '#22c1c3',
  Finalizado: '#2bd47f',
  'No tráfego': '#7ce38b',
  'Jaylton deve gravar': '#f5a524',
}

export default function Column({
  fase,
  cards,
  onArchive,
  onPushSemana,
  onDelete,
  onOpen,
}: {
  fase: Fase
  cards: Card[]
  onArchive: (id: string) => void
  onPushSemana?: (id: string) => void
  onDelete?: (id: string) => void
  onOpen?: (card: Card) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: fase })
  const cor = FASE_COR[fase]
  return (
    <section className="shrink-0 w-[86vw] max-w-[300px] [scroll-snap-align:start]">
      <div className="flex items-center gap-2 px-1.5 pb-2.5">
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: cor, boxShadow: `0 0 8px ${cor}80` }} />
        <h2 className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-2">{fase}</h2>
        <span className="tnum text-[11px] font-bold text-muted bg-surface-2 rounded-full px-1.5 min-w-[20px] text-center">
          {cards.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={
          'flex flex-col gap-2.5 rounded-2xl p-2 min-h-[140px] border transition-all duration-200 ' +
          (isOver
            ? 'bg-elev border-brand/60 ring-2 ring-brand/25 scale-[1.01]'
            : 'bg-elev/50 border-border/50')
        }
      >
        {cards.length === 0 ? (
          <div className="grid place-items-center text-[12.5px] text-muted py-9 rounded-xl border border-dashed border-border/60">
            solte aqui
          </div>
        ) : (
          cards.map((card, i) => <DraggableCard key={card.id} card={card} onArchive={onArchive} onPushSemana={onPushSemana} onDelete={onDelete} onOpen={onOpen} index={i} />)
        )}
      </div>
    </section>
  )
}
