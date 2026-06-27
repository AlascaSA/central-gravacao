import type { Card } from '../types'

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function rotuloMes(ym: string): string {
  // ym = "yyyy-MM"
  const [y, m] = ym.split('-')
  const mi = parseInt(m, 10) - 1
  return (MESES[mi] ?? '?') + ' / ' + y
}

export default function Archive({ cards }: { cards: Card[] }) {
  const grupos: Record<string, Card[]> = {}
  for (const c of cards) {
    const ym = (c.finalizadoEm ?? '').substring(0, 7) || 'sem-data'
    ;(grupos[ym] = grupos[ym] ?? []).push(c)
  }
  const chaves = Object.keys(grupos).sort().reverse()

  if (chaves.length === 0) {
    return <div className="relative z-10 text-center text-muted py-20 px-6">Nada finalizado ainda.</div>
  }

  return (
    <div className="relative z-10 px-4 pb-28 max-w-2xl mx-auto">
      {chaves.map((ym) => (
        <section key={ym} className="mb-7">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-2">
              {ym === 'sem-data' ? 'Sem data' : rotuloMes(ym)}
            </h2>
            <span className="text-[11px] font-bold text-brand-2 bg-brand/12 rounded-full px-2 py-0.5">{grupos[ym].length}</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="flex flex-col gap-2">
            {grupos[ym].map((c) => (
              <div key={c.id} className="rounded-xl border border-border bg-surface px-3.5 py-2.5 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold truncate">{c.titulo}</div>
                  <div className="text-[12px] text-muted">
                    {c.copy}
                    {c.campanha ? ' · ' + c.campanha : ''}
                  </div>
                </div>
                {c.documentos.length > 0 && (
                  <a href={c.documentos[0].url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-brand-2 shrink-0">
                    {c.documentos.length} doc{c.documentos.length > 1 ? 's' : ''}
                  </a>
                )}
                <span className="text-[11px] text-muted shrink-0">{(c.finalizadoEm ?? '').substring(8, 10)}/{(c.finalizadoEm ?? '').substring(5, 7)}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
