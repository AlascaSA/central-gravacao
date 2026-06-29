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
  'para Jaylton gravar': '#94a3b8',
}

export default function Column({
  fase,
  cards,
  arrastando,
  onArchive,
  onPushSemana,
  onDelete,
  onOpen,
  selecionados,
  onToggleSel,
}: {
  fase: Fase
  cards: Card[]
  arrastando?: boolean
  onArchive: (id: string) => void
  onPushSemana?: (id: string) => void
  onDelete?: (id: string) => void
  onOpen?: (card: Card) => void
  selecionados?: Set<string>
  onToggleSel?: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: fase })
  const cor = FASE_COR[fase]
  return (
    <section className="shrink-0 w-[86vw] max-w-[300px] flex flex-col h-full [scroll-snap-align:start]">
      <div className="flex items-center gap-2 px-1.5 pb-2.5 shrink-0">
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: cor }} />
        <h2 className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-2 truncate">{fase}</h2>
        <span className="tnum text-[11px] font-semibold text-muted">{cards.length}</span>
      </div>
      <div
        ref={setNodeRef}
        data-col-scroll
        className={
          'flex flex-col gap-2.5 rounded-2xl p-2 flex-1 min-h-0 overflow-y-auto border transition-all duration-200 pb-20 sm:pb-3 ' +
          (isOver
            ? 'bg-elev border-brand/60 ring-2 ring-brand/25'
            : 'bg-elev/50 border-border/50')
        }
      >
        {cards.length === 0
          ? arrastando && (
              <div className="grid place-items-center text-[12px] text-muted py-9 rounded-xl border border-dashed border-brand/40">solte aqui</div>
            )
          : cards.map((card, i) => <DraggableCard key={card.id} card={card} onArchive={onArchive} onPushSemana={onPushSemana} onDelete={onDelete} onOpen={onOpen} index={i} selecionado={selecionados?.has(card.id)} onToggleSel={onToggleSel} />)}
      </div>
    </section>
  )
}
