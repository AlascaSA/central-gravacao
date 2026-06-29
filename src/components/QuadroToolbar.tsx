import { addWeeks, currentMonday, weekLabel } from '../week'
import { COPYS, type Copy } from '../types'

export type VistaSemana = 'semana' | 'sem' | 'todas'
export type FiltroCopy = Copy | 'Todas' | 'Sem roteiro'

const COPY_OPCOES: FiltroCopy[] = ['Todas', ...COPYS, 'Sem roteiro']

// Barra única do quadro: tempo (navegação de semana) | escopo | copy | ações.
// Substitui as antigas faixas separadas WeekNav + Filters pra criar a hierarquia
// "abas (tela) > controles do quadro > colunas".
export default function QuadroToolbar({
  monday,
  vistaSem,
  onChangeSemana,
  filtro,
  onChangeFiltro,
  counts,
  selMode,
  onToggleSel,
  onSubir,
  onNovo,
}: {
  monday: string
  vistaSem: VistaSemana
  onChangeSemana: (monday: string, vista: VistaSemana) => void
  filtro: FiltroCopy
  onChangeFiltro: (v: FiltroCopy) => void
  counts: Record<string, number>
  selMode: boolean
  onToggleSel: () => void
  onSubir: () => void
  onNovo: () => void
}) {
  const ehSemana = vistaSem === 'semana'
  const ehAtual = ehSemana && monday === currentMonday()
  const base = ehSemana ? monday : currentMonday()

  const chip = (ativo: boolean) =>
    'shrink-0 inline-flex items-center rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition-colors ' +
    (ativo ? 'bg-brand/12 border-brand/40 text-brand-2' : 'bg-surface/60 border-border text-ink-2 hover:border-border-strong hover:text-ink')

  const seta = 'h-9 w-9 grid place-items-center rounded-md text-muted hover:text-ink hover:bg-surface-2 transition-colors'

  return (
    <div className="relative z-10 shrink-0 border-b border-border/60 bg-surface/30">
      <div className="flex items-center gap-1.5 px-4 sm:px-6 py-2.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* tempo */}
        <div className={'shrink-0 flex items-center rounded-lg border p-0.5 bg-surface ' + (ehSemana ? 'border-brand/40' : 'border-border')}>
          <button onClick={() => onChangeSemana(addWeeks(base, -1), 'semana')} className={seta} aria-label="Semana anterior">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <button
            onClick={() => onChangeSemana(currentMonday(), 'semana')}
            title="Ir para a semana atual"
            className={'px-1.5 min-w-[150px] text-center text-[12px] font-bold transition-colors ' + (ehSemana ? (ehAtual ? 'text-brand-2' : 'text-ink') : 'text-muted')}
          >
            {ehSemana ? 'Semana ' + weekLabel(monday) + (ehAtual ? ' · hoje' : '') : 'Semana'}
          </button>
          <button onClick={() => onChangeSemana(addWeeks(base, 1), 'semana')} className={seta} aria-label="Próxima semana">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </div>
        <button onClick={() => onChangeSemana(monday, 'sem')} className={chip(vistaSem === 'sem')}>Sem semana</button>
        <button onClick={() => onChangeSemana(monday, 'todas')} className={chip(vistaSem === 'todas')}>Todas as semanas</button>

        <span className="shrink-0 w-px h-6 bg-border mx-1.5" />

        {/* copy (pessoa) */}
        {COPY_OPCOES.map((op) => {
          const ativo = filtro === op
          const n = op === 'Todas' ? counts.__total ?? 0 : counts[op] ?? 0
          return (
            <button key={op} onClick={() => onChangeFiltro(op)} className={chip(ativo)}>
              {op === 'Todas' ? 'Tudo' : op}
              <span className={'tnum ml-1.5 text-[11px] font-bold rounded-full px-1.5 ' + (ativo ? 'bg-brand/20 text-brand-2' : 'bg-surface-3 text-muted')}>{n}</span>
            </button>
          )
        })}

        <span className="shrink-0 w-px h-6 bg-border mx-1.5" />

        {/* modo seleção pra baixar vídeos em lote (some o checkbox do card até ligar aqui) */}
        <button
          onClick={onToggleSel}
          title="Selecionar cards pra baixar os vídeos em lote"
          className={
            'shrink-0 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition-colors ' +
            (selMode ? 'bg-brand/12 border-brand/40 text-brand-2' : 'bg-surface/60 border-border text-ink-2 hover:border-border-strong hover:text-ink')
          }
        >
          {selMode ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" /><path d="m8 12 3 3 5-6" /></svg>
          )}
          {selMode ? 'Cancelar' : 'Selecionar'}
        </button>

        {/* ações (desktop) — no celular vão pra barra fixa inferior */}
        <div className="hidden sm:flex items-center gap-0.5 ml-auto pl-2 shrink-0">
          <button onClick={onSubir} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand-2 border border-brand/30 rounded-lg px-3 py-1.5 hover:bg-brand hover:text-white hover:border-brand transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M6 10l6-6 6 6M4 20h16" /></svg>
            Subir roteiros
          </button>
          <button onClick={onNovo} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-2 rounded-lg px-2.5 py-1.5 hover:bg-surface-2 hover:text-ink transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Novo
          </button>
        </div>
      </div>
    </div>
  )
}
