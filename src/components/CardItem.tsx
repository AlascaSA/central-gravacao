import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import type { Card } from '../types'
import { viewerUrl } from '../viewer'
import { corPontoProduto } from '../produtoCor'

export const CAT_COR: Record<string, string> = {
  'Conteúdo': 'text-sky-300 bg-sky-500/15',
  'Anúncio': 'text-amber-300 bg-amber-500/15',
  'Institucional': 'text-violet-300 bg-violet-500/15',
  'Captação': 'text-emerald-300 bg-emerald-500/15',
}

// pontinhos sólidos por categoria (chip neutro + ponto colorido)
export const CAT_DOT: Record<string, string> = {
  'Conteúdo': 'bg-sky-400',
  'Anúncio': 'bg-amber-400',
  'Institucional': 'bg-violet-400',
  'Captação': 'bg-emerald-400',
}

// chip neutro padrão do card (cor fica só nos pontos e na urgência Alta)
const chipNeutro = 'inline-flex items-center gap-1 text-[11px] font-semibold text-ink-2 bg-surface-2 rounded-full px-2 py-0.5'

function IconDoc() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h5M9 17h3.5" />
    </svg>
  )
}

/** Visual puro do card. Usado na coluna e no DragOverlay. */
export function CardView({
  card,
  onArchive,
  onPushSemana,
  onDelete,
  onOpen,
  dragging,
  overlay,
  index,
  dragRef,
  dragProps,
  selecionado,
  onToggleSel,
}: {
  card: Card
  onArchive: (id: string) => void
  onPushSemana?: (id: string) => void
  onDelete?: (id: string) => void
  onOpen?: (card: Card) => void
  dragging?: boolean
  overlay?: boolean
  index?: number
  dragRef?: (el: HTMLElement | null) => void
  dragProps?: Record<string, unknown>
  selecionado?: boolean
  onToggleSel?: (id: string) => void
}) {
  const podeConcluir = card.fase === 'Finalizado' || card.fase === 'No tráfego'
  const [confirmar, setConfirmar] = useState(false)
  const base =
    'group rounded-2xl border bg-surface p-3.5 select-none touch-none cursor-grab active:cursor-grabbing transition-[transform,box-shadow,border-color] duration-200 '
  const interactive = !dragging && !overlay ? 'hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[0_10px_30px_-8px_rgba(0,0,0,0.6)] active:scale-[0.985] ' : ''
  const stateCls = overlay
    ? 'border-brand/50 shadow-[0_18px_40px_-10px_rgba(0,0,0,0.7)] '
    : dragging
      ? 'opacity-40 border-border '
      : 'border-border shadow-[0_2px_8px_-2px_rgba(0,0,0,0.4)] rise '

  return (
    <div
      ref={dragRef}
      {...(dragProps ?? {})}
      onClick={() => {
        if (onOpen && !overlay) onOpen(card)
      }}
      style={index != null && !overlay ? { animationDelay: `${Math.min(index * 45, 320)}ms` } : undefined}
      className={base + interactive + stateCls + (selecionado && !overlay ? 'ring-2 ring-brand/50 ' : '')}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold leading-snug tracking-[-0.01em]">{card.titulo}</div>
          {card.campanha && <div className="text-[12px] text-muted mt-0.5">{card.campanha}</div>}
        </div>
        {card.comentario?.trim() && (
          <span title={card.comentario} aria-label="Tem aviso" className="shrink-0 grid place-items-center h-[18px] w-[18px] rounded-full bg-amber/15 text-amber">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          </span>
        )}
        {card.urgencia === 'alta' && (
          <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 text-red bg-red/15">alta</span>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {card.copy && <span className={chipNeutro}>{card.copy}</span>}
        {card.categoria && (
          <span className={chipNeutro}>
            <span className={'h-1.5 w-1.5 rounded-full shrink-0 ' + (CAT_DOT[card.categoria] ?? 'bg-border-strong')} />
            {card.categoria}
          </span>
        )}
        {card.produto && (
          <span className={chipNeutro + ' max-w-[160px]'}>
            <span className={'h-1.5 w-1.5 rounded-full shrink-0 ' + corPontoProduto(card.produto)} />
            <span className="truncate">{card.produto}</span>
          </span>
        )}
        {card.semRoteiro && <span className="text-[11px] font-semibold text-muted bg-surface-2 rounded-full px-2 py-0.5">sem roteiro</span>}
        {card.prazo && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted tnum">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            {card.prazo}
          </span>
        )}
      </div>

      {card.documentos.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-1.5">
          {card.documentos.map((d, i) => (
            <a
              key={i}
              href={viewerUrl(d.nome, d.url)}
              target="_blank"
              rel="noopener noreferrer"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 text-[12px] text-brand-2 bg-surface-2 border border-border rounded-lg px-2 py-1.5 hover:border-brand/50 hover:bg-surface-3 transition-colors"
            >
              <IconDoc />
              <span className="truncate">{d.nome}</span>
            </a>
          ))}
        </div>
      )}

      {(onPushSemana || podeConcluir || onDelete || onToggleSel) && (
        <div className="mt-3 flex items-center gap-2">
          {onToggleSel && !overlay && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onToggleSel(card.id) }}
              title="Selecionar pra baixar os vídeos"
              aria-label="Selecionar card"
              className={'tap shrink-0 grid place-items-center h-5 w-5 rounded-md border transition-colors ' + (selecionado ? 'bg-brand border-brand text-white' : 'border-border-strong text-transparent hover:border-brand')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </button>
          )}
          {onPushSemana && !overlay && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onPushSemana(card.id) }}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-brand-2 transition-colors"
              title="Mover para a próxima semana"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 9h18M8 2v4M16 2v4M13 15l2 2-2 2" /></svg>
              Adiar 1 semana
            </button>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {podeConcluir && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onArchive(card.id) }}
                className="inline-flex items-center gap-1.5 text-[12px] font-bold text-green hover:text-[#03210f] hover:bg-green rounded-lg px-3 py-1.5 border border-green/40 transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                Concluir
              </button>
            )}
            {onDelete && !overlay && !confirmar && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); setConfirmar(true) }}
                className="tap h-7 w-7 grid place-items-center rounded-lg text-muted hover:text-red transition-colors"
                title="Apagar card"
                aria-label="Apagar card"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>
              </button>
            )}
            {onDelete && !overlay && confirmar && (
              <span className="inline-flex items-center gap-1 text-[12px]">
                <span className="text-muted">Apagar?</span>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(card.id)
                    setConfirmar(false)
                  }}
                  className="font-bold text-red px-2 py-1 rounded-lg hover:bg-red hover:text-white transition-colors"
                  aria-label="Confirmar apagar"
                >
                  Sim
                </button>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); setConfirmar(false) }}
                  className="font-semibold text-muted px-2 py-1 rounded-lg hover:text-ink transition-colors"
                >
                  Não
                </button>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Card arrastável (na coluna). */
export default function DraggableCard({
  card,
  onArchive,
  onPushSemana,
  onDelete,
  onOpen,
  index,
  selecionado,
  onToggleSel,
}: {
  card: Card
  onArchive: (id: string) => void
  onPushSemana?: (id: string) => void
  onDelete?: (id: string) => void
  onOpen?: (card: Card) => void
  index?: number
  selecionado?: boolean
  onToggleSel?: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id })
  return (
    <CardView
      card={card}
      onArchive={onArchive}
      onPushSemana={onPushSemana}
      onDelete={onDelete}
      onOpen={onOpen}
      dragging={isDragging}
      index={index}
      dragRef={setNodeRef}
      dragProps={{ ...attributes, ...listeners }}
      selecionado={selecionado}
      onToggleSel={onToggleSel}
    />
  )
}
