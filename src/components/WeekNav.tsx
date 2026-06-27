import { addWeeks, currentMonday, weekLabel } from '../week'

export type VistaSemana = 'semana' | 'sem' | 'todas'

export default function WeekNav({
  monday,
  vista,
  onChange,
}: {
  monday: string
  vista: VistaSemana
  onChange: (monday: string, vista: VistaSemana) => void
}) {
  const ehAtual = vista === 'semana' && monday === currentMonday()
  const label = vista === 'semana' ? 'Semana ' + weekLabel(monday) : vista === 'sem' ? 'Sem semana' : 'Todas'

  function pill(ativo: boolean) {
    return (
      'shrink-0 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ' +
      (ativo ? 'bg-brand border-brand text-white' : 'bg-surface/80 border-border text-ink-2 hover:border-border-strong')
    )
  }

  const base = vista === 'semana' ? monday : currentMonday()

  return (
    <div className="relative z-10 flex items-center gap-2 px-4 sm:px-6 pt-2 pb-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="shrink-0 flex items-center bg-surface border border-border rounded-xl p-1">
        <button
          onClick={() => onChange(addWeeks(base, -1), 'semana')}
          className="h-8 w-8 grid place-items-center rounded-lg text-muted hover:text-ink hover:bg-surface-2 transition-colors"
          aria-label="Semana anterior"
        >
          ‹
        </button>
        <button
          onClick={() => onChange(currentMonday(), 'semana')}
          className={'px-2 min-w-[150px] text-center text-[13px] font-bold transition-colors ' + (vista === 'semana' ? (ehAtual ? 'text-brand-2' : 'text-ink') : 'text-muted')}
          title="Ir para a semana atual"
        >
          {label}
          {ehAtual ? ' · hoje' : ''}
        </button>
        <button
          onClick={() => onChange(addWeeks(base, 1), 'semana')}
          className="h-8 w-8 grid place-items-center rounded-lg text-muted hover:text-ink hover:bg-surface-2 transition-colors"
          aria-label="Próxima semana"
        >
          ›
        </button>
      </div>
      <button onClick={() => onChange(monday, 'sem')} className={pill(vista === 'sem')}>
        Sem semana
      </button>
      <button onClick={() => onChange(monday, 'todas')} className={pill(vista === 'todas')}>
        Todas
      </button>
    </div>
  )
}
