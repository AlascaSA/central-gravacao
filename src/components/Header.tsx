import { useEffect, useState } from 'react'
import { getTeam, getTeamNome, sairDoTime, listarTimes, temTime, type Time } from '../data/team'

export type Vista = 'quadro' | 'arquivo' | 'catalogo' | 'links' | 'videos' | 'virais' | 'multiplicar'

const LABEL: Record<Vista, string> = { quadro: 'Quadro', arquivo: 'Arquivo', catalogo: 'Catálogo', links: 'Links', videos: 'Vídeos', virais: 'Virais', multiplicar: 'Multiplicar' }

export default function Header({ vista, onVista }: { vista: Vista; onVista: (v: Vista) => void }) {
  // Chip do especialista ativo: mostra quem você é; clicar volta pra tela de escolha (trocar de time).
  const [times, setTimes] = useState<Time[]>([])
  const [menu, setMenu] = useState(false)
  useEffect(() => {
    if (temTime()) listarTimes().then(setTimes).catch(() => {})
  }, [])
  const ativo = times.find((t) => t.id === getTeam())

  return (
    <header className="glass shrink-0 z-30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3 px-4 sm:px-6 pt-[calc(env(safe-area-inset-top)+14px)] pb-3 border-b border-border/70">
      <div className="flex items-center gap-3 min-w-0">
        <img src="/alasca-logo.png" alt="Alasca" className="h-[22px] sm:h-6 w-auto shrink-0" />
        {/* Chip do especialista ativo — clicar troca de time (volta pra tela de escolha) */}
        {temTime() && (
          <button
            onClick={sairDoTime}
            title="Trocar de especialista"
            aria-label="Trocar de especialista"
            className="group inline-flex items-center gap-2 shrink-0 bg-surface-2/80 border border-border rounded-xl pl-2 pr-2.5 py-1.5 hover:border-border-strong transition-colors max-w-[10rem]"
          >
            <span className="h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-surface-2" style={{ background: ativo?.cor || '#14a8f5' }} />
            <span className="text-[12px] sm:text-[13px] font-semibold text-ink-2 group-hover:text-ink transition-colors truncate">{ativo?.nome || getTeamNome()}</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-muted shrink-0" aria-hidden><path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" /></svg>
          </button>
        )}
        <span className="hidden sm:block h-5 w-px bg-border-strong shrink-0" aria-hidden />
        <h1 className="hidden sm:block text-[15px] font-bold tracking-[-0.01em] text-ink-2 truncate">Central de Audiovisual</h1>
      </div>
      {/* MOBILE: as 6 abas num seletor de uma linha — em grade elas comiam meia tela de cabeçalho.
          Toca e abre a lista inteira; nada rola escondido, nada ocupa espaço à toa.
          DESKTOP (sm+): a barra de sempre, com tudo à vista. */}
      <div className="relative sm:hidden">
        <button
          onClick={() => setMenu((v) => !v)}
          className="w-full h-11 px-3 inline-flex items-center justify-between gap-2 rounded-xl bg-surface/80 border border-border text-[14px] font-bold text-ink"
        >
          {LABEL[vista]}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={'text-muted transition-transform ' + (menu ? 'rotate-180' : '')}><path d="M6 9l6 6 6-6" /></svg>
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
            <div className="absolute top-full left-0 right-0 mt-1.5 z-40 rounded-2xl border border-border-strong bg-elev p-1.5 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.75)]">
              {(Object.keys(LABEL) as Vista[]).map((v) => (
                <button
                  key={v}
                  onClick={() => { onVista(v); setMenu(false) }}
                  className={'w-full min-h-11 px-3 text-left rounded-xl text-[14px] font-semibold transition-colors ' + (vista === v ? 'bg-brand text-white' : 'text-ink-2 active:bg-surface-2')}
                >
                  {LABEL[v]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="hidden sm:flex bg-surface/80 border border-border rounded-xl p-1 gap-0.5 text-[13px] font-semibold">
        {(Object.keys(LABEL) as Vista[]).map((v) => (
          <button
            key={v}
            onClick={() => onVista(v)}
            className={
              'whitespace-nowrap px-3.5 py-1.5 rounded-lg transition-all duration-200 ' +
              (vista === v ? 'bg-brand text-white shadow-[0_4px_14px_rgba(20,168,245,0.4)]' : 'text-muted hover:text-ink')
            }
          >
            {LABEL[v]}
          </button>
        ))}
      </div>
    </header>
  )
}
