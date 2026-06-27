import { COPYS, type Copy } from '../types'

export type FiltroCopy = Copy | 'Todas'

export default function Filters({
  value,
  onChange,
  counts,
}: {
  value: FiltroCopy
  onChange: (v: FiltroCopy) => void
  counts: Record<string, number>
}) {
  const opcoes: FiltroCopy[] = ['Todas', ...COPYS]
  return (
    <div className="relative z-10 flex gap-2 overflow-x-auto px-4 sm:px-6 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {opcoes.map((op) => {
        const ativo = value === op
        const n = op === 'Todas' ? counts.__total ?? 0 : counts[op] ?? 0
        return (
          <button
            key={op}
            onClick={() => onChange(op)}
            className={
              'shrink-0 flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-all duration-200 active:scale-95 ' +
              (ativo
                ? 'bg-brand border-brand text-white shadow-[0_4px_14px_rgba(20,168,245,0.35)]'
                : 'bg-surface/80 border-border text-ink-2 hover:border-border-strong hover:text-ink')
            }
          >
            {op}
            <span
              className={
                'tnum text-[11px] font-bold rounded-full px-1.5 py-px min-w-[18px] text-center ' +
                (ativo ? 'bg-white/20' : 'bg-surface-3 text-muted')
              }
            >
              {n}
            </span>
          </button>
        )
      })}
    </div>
  )
}
