import { useState } from 'react'
import { addWeeks, currentMonday, weekLabel } from '../week'
import { COPYS, type Copy } from '../types'

export type VistaSemana = 'semana' | 'sem' | 'todas'
export type FiltroCopy = Copy | 'Todas' | 'Sem roteiro'

const COPY_OPCOES: FiltroCopy[] = ['Todas', ...COPYS, 'Sem roteiro']

// Barra do quadro: período (controle fixo c/ menu) | copy (rola) | ações fixas.
export default function QuadroToolbar({
  monday,
  vistaSem,
  onChangeSemana,
  filtro,
  onChangeFiltro,
  counts,
  selMode,
  onToggleSel,
  jaylton,
  onJaylton,
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
  jaylton: number
  onJaylton: () => void
  onSubir: () => void
  onNovo: () => void
}) {
  const [menuTempo, setMenuTempo] = useState(false)
  const ehSemana = vistaSem === 'semana'
  const ehAtual = ehSemana && monday === currentMonday()
  const base = ehSemana ? monday : currentMonday()

  const rotuloTempo = ehSemana
    ? weekLabel(monday) + (ehAtual ? ' · hoje' : '')
    : vistaSem === 'sem' ? 'Sem semana' : 'Todas as semanas'

  const chip = (ativo: boolean) =>
    'shrink-0 inline-flex items-center rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition-colors ' +
    (ativo ? 'bg-brand/12 border-brand/40 text-brand-2' : 'bg-surface/60 border-border text-ink-2 hover:border-border-strong hover:text-ink')

  const seta = 'h-9 w-8 grid place-items-center rounded-md text-muted hover:text-ink hover:bg-surface-2 transition-colors'
  const item = (ativo: boolean) =>
    'w-full text-left px-3 py-2 rounded-md text-[12px] font-semibold transition-colors ' +
    (ativo ? 'bg-brand/12 text-brand-2' : 'text-ink-2 hover:bg-surface-2')

  return (
    <div className="relative z-10 shrink-0 border-b border-border/60 bg-surface/30">
      <div className="flex items-center gap-1.5 px-4 sm:px-6 py-2.5">
        {/* período: controle fixo (fora da área que rola, pro menu não ser cortado) */}
        <div className={'relative shrink-0 flex items-center rounded-lg border p-0.5 bg-surface ' + (ehSemana ? 'border-brand/40' : 'border-border')}>
          <button onClick={() => onChangeSemana(addWeeks(base, -1), 'semana')} className={seta} aria-label="Semana anterior">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <button
            onClick={() => setMenuTempo((v) => !v)}
            title="Trocar período"
            className={'px-2 min-w-[124px] text-center text-[12px] font-bold inline-flex items-center justify-center gap-1.5 transition-colors ' + (ehAtual ? 'text-brand-2' : 'text-ink')}
          >
            {rotuloTempo}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={'shrink-0 transition-transform ' + (menuTempo ? 'rotate-180' : '')}><path d="M6 9l6 6 6-6" /></svg>
          </button>
          <button onClick={() => onChangeSemana(addWeeks(base, 1), 'semana')} className={seta} aria-label="Próxima semana">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>

          {menuTempo && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setMenuTempo(false)} />
              <div className="absolute top-full left-0 mt-1.5 z-30 w-52 rounded-xl border border-border-strong bg-elev p-1 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.7)]">
                <button onClick={() => { onChangeSemana(currentMonday(), 'semana'); setMenuTempo(false) }} className={item(ehAtual)}>Esta semana</button>
                <button onClick={() => { onChangeSemana(monday, 'sem'); setMenuTempo(false) }} className={item(vistaSem === 'sem')}>Sem semana</button>
                <button onClick={() => { onChangeSemana(monday, 'todas'); setMenuTempo(false) }} className={item(vistaSem === 'todas')}>Todas as semanas</button>
              </div>
            </>
          )}
        </div>

        <span className="shrink-0 w-px h-6 bg-border mx-0.5" />

        {/* copy (pessoa) — área que rola na horizontal */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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

          {jaylton > 0 && (
            <button
              onClick={onJaylton}
              title="Ir para a coluna do Jaylton"
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-2.5 py-1.5 text-[12px] font-semibold text-ink-2 hover:border-[#94a3b8] hover:text-ink transition-colors"
            >
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: '#94a3b8' }} />
              para Jaylton gravar
              <span className="tnum text-[11px] font-bold bg-surface-3 rounded-full px-1.5">{jaylton}</span>
            </button>
          )}
        </div>

        {/* ações fixas à direita */}
        <span className="shrink-0 w-px h-6 bg-border mx-0.5" />
        <button
          onClick={onToggleSel}
          title={selMode ? 'Cancelar seleção' : 'Selecionar vídeos pra baixar em lote'}
          className={
            'shrink-0 h-9 w-9 grid place-items-center rounded-lg border transition-colors ' +
            (selMode ? 'bg-brand/12 border-brand/40 text-brand-2' : 'bg-surface/60 border-border text-ink-2 hover:border-border-strong hover:text-ink')
          }
        >
          {selMode ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" /><path d="m8 12 3 3 5-6" /></svg>
          )}
        </button>

        {/* ações principais (desktop) — no celular vão pra barra fixa inferior */}
        <div className="hidden sm:flex items-center gap-0.5 shrink-0">
          <button onClick={onSubir} title="Subir roteiros" className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand-2 border border-brand/30 rounded-lg px-3 py-1.5 hover:bg-brand hover:text-white hover:border-brand transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M6 10l6-6 6 6M4 20h16" /></svg>
            Subir
          </button>
          <button onClick={onNovo} title="Novo card" className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-2 rounded-lg px-2.5 py-1.5 hover:bg-surface-2 hover:text-ink transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Novo
          </button>
        </div>
      </div>
    </div>
  )
}
