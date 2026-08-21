import { useDroppable } from '@dnd-kit/core'
import type { Card, Fase } from '../types'
import { labelFase } from '../data/team'
import DraggableCard from './CardItem'

// progressão fria (ciano → verde) = sensação de avanço no pipeline
export const FASE_COR: Record<Fase, string> = {
  'A gravar': '#14a8f5',
  'A editar': '#39b9ef',
  'Em edição': '#22c1c3',
  'Em revisão': '#fbbf24', // revisão = atenção (mesmo âmbar do "Em revisão" da aba Vídeos)
  Finalizado: '#2bd47f',
  'No tráfego': '#7ce38b',
  'para Jaylton gravar': '#94a3b8',
}

export default function Column({
  soLista,
  fase,
  cards,
  arrastando,
  semanaVista,
  onArchive,
  onPushSemana,
  onDelete,
  onOpen,
  selecionados,
  onToggleSel,
  proxima,
  onAvancar,
  onEscolherFase,
}: {
  fase: Fase
  cards: Card[]
  proxima?: Fase | null
  onAvancar?: (card: Card) => void
  onEscolherFase?: (card: Card) => void
  arrastando?: boolean
  semanaVista?: string | null
  onArchive: (id: string) => void
  onPushSemana?: (id: string) => void
  onDelete?: (id: string) => void
  onOpen?: (card: Card) => void
  selecionados?: Set<string>
  onToggleSel?: (id: string) => void
  soLista?: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: fase })
  const cor = FASE_COR[fase]
  return (
    // flex-col + a área de soltar em flex-1: a coluna acompanha a altura da mais cheia, então dá pra
    // soltar o card na altura em que ele já está — sem ter que subir a página até o topo da coluna destino.
    <section className={(soLista ? "w-full" : "coluna-bloco shrink-0 w-[calc(100vw-2rem)] sm:w-[300px] max-w-[300px] sm:max-w-[300px]") + " flex flex-col"} data-fase={fase}>
      <div className={"coluna-topo items-center gap-2 px-1.5 pb-2.5 " + (soLista ? "hidden" : "flex")}>
        <span className="coluna-ponto h-2 w-2 rounded-full shrink-0" style={{ background: cor }} />
        <h2 className="coluna-titulo text-[12px] font-bold uppercase tracking-[0.06em] text-ink-2 truncate">{labelFase(fase)}</h2>
        <span className="coluna-contagem tnum text-[11px] font-semibold text-muted">{cards.length}</span>
      </div>
      {/* Alvo do arraste: invisível e vai até o rodapé, pra dar onde soltar na altura em que o card já
          está. A moldura fica só na caixa de dentro — senão a coluna curta virava um retângulo vazio
          descendo a tela inteira. */}
      <div ref={setNodeRef} data-fase={fase} className="flex-1 flex flex-col">
        <div
          className={
            'coluna flex flex-col gap-3 rounded-2xl min-h-[140px] transition-all duration-200 ' + (soLista ? 'p-0 border-0 bg-transparent! ' : 'p-2 border ') +
            (isOver
              ? 'bg-elev border-brand/60 ring-2 ring-brand/25'
              : 'bg-elev/50 border-border/50')
          }
        >
          {cards.length === 0
            ? arrastando && (
                <div className="grid place-items-center text-[12px] text-muted py-9 rounded-xl border border-dashed border-brand/40">solte aqui</div>
              )
            : cards.map((card, i) => <DraggableCard key={card.id} card={card} semanaVista={semanaVista} onArchive={onArchive} onPushSemana={onPushSemana} onDelete={onDelete} onOpen={onOpen} index={i} selecionado={selecionados?.has(card.id)} onToggleSel={onToggleSel} proxima={proxima} onAvancar={onAvancar} onEscolherFase={onEscolherFase} />)}
        </div>
        {/* faixa que sobra abaixo da caixa: continua sendo alvo, só marca de leve durante o arraste */}
        {arrastando && <div className={'flex-1 min-h-[40px] mt-2 rounded-xl transition-colors ' + (isOver ? 'bg-brand/[0.07] border border-dashed border-brand/30' : '')} />}
      </div>
    </section>
  )
}
