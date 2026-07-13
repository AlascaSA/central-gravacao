export type Vista = 'quadro' | 'arquivo' | 'catalogo' | 'links' | 'postar' | 'postados'

const LABEL: Record<Vista, string> = { quadro: 'Quadro', arquivo: 'Arquivo', catalogo: 'Catálogo', links: 'Links', postar: 'Para postar', postados: 'Postados' }

export default function Header({ vista, onVista }: { vista: Vista; onVista: (v: Vista) => void }) {
  return (
    <header className="glass shrink-0 z-30 flex items-center justify-between gap-3 px-4 sm:px-6 pt-[calc(env(safe-area-inset-top)+14px)] pb-3 border-b border-border/70">
      <div className="flex items-center gap-3 min-w-0">
        <img src="/alasca-logo.png" alt="Alasca" className="h-[22px] sm:h-6 w-auto shrink-0" />
        <span className="hidden sm:block h-5 w-px bg-border-strong shrink-0" aria-hidden />
        <h1 className="hidden sm:block text-[15px] font-bold tracking-[-0.01em] text-ink-2 truncate">Central de Gravação</h1>
      </div>
      <div className="flex bg-surface/80 border border-border rounded-xl p-1 text-[12px] sm:text-[13px] font-semibold min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(Object.keys(LABEL) as Vista[]).map((v) => (
          <button
            key={v}
            onClick={() => onVista(v)}
            className={
              'shrink-0 whitespace-nowrap px-2.5 sm:px-3.5 py-1.5 rounded-lg transition-all duration-200 ' +
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
