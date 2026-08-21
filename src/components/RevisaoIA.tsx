import { useEffect, useState } from 'react'
import { aprovar, listarPropostas, recusar, type Proposta } from '../data/revisao'

const COR_TIPO: Record<string, string> = {
  boa: 'text-emerald-300 bg-emerald-500/12 border-emerald-500/30',
  erro: 'text-rose-300 bg-rose-500/12 border-rose-500/30',
  gancho: 'text-amber bg-amber/12 border-amber/30',
  complemento: 'text-sky-300 bg-sky-500/12 border-sky-500/30',
}

// Fila de revisão do que foi montado automaticamente. Nada entra no fluxo sem alguém dizer "ok":
// aprovar mantém, recusar desfaz (solta as tomadas, devolve o nome de câmera e apaga o card).
export default function RevisaoIA({ onFechar, onMudou }: { onFechar: () => void; onMudou: () => void }) {
  const [itens, setItens] = useState<Proposta[] | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<string | null>(null)
  // assistir antes de aprovar: toca a prévia leve (mesmo proxy do Catálogo)
  const [tocando, setTocando] = useState<string | null>(null)
  const [srcs, setSrcs] = useState<Record<string, string>>({})
  async function tocar(id: string) {
    if (tocando === id) { setTocando(null); return }
    setTocando(id)
    if (srcs[id]) return
    try {
      const r = await fetch('/api/preview-url?id=' + encodeURIComponent(id))
      const d = r.ok ? await r.json() : null
      if (d?.url) setSrcs((m) => ({ ...m, [id]: d.url }))
    } catch { /* sem prévia */ }
  }

  async function carregar() {
    setItens(await listarPropostas().catch(() => []))
  }
  useEffect(() => { carregar() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onFechar])

  async function ok(p: Proposta) {
    setOcupado(p.card_id)
    await aprovar(p.card_id)
    setItens((xs) => (xs ? xs.filter((x) => x.card_id !== p.card_id) : xs))
    setOcupado(null)
    onMudou()
  }
  async function nao(p: Proposta) {
    setOcupado(p.card_id)
    await recusar(p.card_id, p.tomadas)
    setItens((xs) => (xs ? xs.filter((x) => x.card_id !== p.card_id) : xs))
    setOcupado(null)
    setConfirmando(null)
    onMudou()
  }
  async function aprovarTodos() {
    if (!itens) return
    setOcupado('todos')
    for (const p of itens) await aprovar(p.card_id)
    setItens([])
    setOcupado(null)
    onMudou()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fade-in absolute inset-0 bg-black/65" onClick={onFechar} />
      <div className="sheet-up relative w-full sm:max-w-2xl bg-elev border-t sm:border border-border-strong rounded-t-3xl sm:rounded-3xl max-h-[calc(var(--vh-real,100vh)*0.88)] flex flex-col shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.8)]">
        <div className="shrink-0 flex items-start gap-3 p-5 sm:p-6 pb-3 border-b border-border/70">
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-bold tracking-[-0.01em]">Revisar o que foi montado</h2>
            <p className="text-[12.5px] text-muted mt-0.5">
              Aprovar mantém a tarefa e os nomes. Recusar desfaz: as tomadas voltam ao nome de câmera e a tarefa some.
            </p>
          </div>
          {itens && itens.length > 1 && (
            <button onClick={aprovarTodos} disabled={!!ocupado} className="shrink-0 h-9 px-3 rounded-xl bg-brand text-white text-[12.5px] font-bold disabled:opacity-60">Aprovar todos</button>
          )}
          <button onClick={onFechar} aria-label="Fechar" className="shrink-0 h-9 w-9 grid place-items-center rounded-xl bg-surface-2 border border-border text-muted hover:text-ink transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6 pt-4 flex flex-col gap-2.5">
          {itens === null && <div className="grid place-items-center py-14"><div className="h-6 w-6 rounded-full border-2 border-border-strong border-t-brand animate-spin" /></div>}
          {itens?.length === 0 && <div className="text-center text-[13px] text-muted py-14">Nada para revisar — tudo aprovado.</div>}

          {itens?.map((p) => {
            const temBoa = p.tomadas.some((t) => t.tipo === 'boa')
            return (
              <div key={p.card_id} className={'rounded-2xl border bg-surface p-3.5 ' + (temBoa ? 'border-border' : 'border-amber/40')}>
                <div className="flex items-start gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold leading-snug">{p.titulo}</div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[11px]">
                      {p.categoria && <span className="font-semibold text-ink-2 bg-surface-2 rounded-full px-2 py-0.5">{p.categoria}</span>}
                      {p.produto && <span className="font-semibold text-ink-2 bg-surface-2 rounded-full px-2 py-0.5">{p.produto}</span>}
                      {p.semRoteiro && <span className="font-semibold text-muted bg-surface-2 rounded-full px-2 py-0.5">sem roteiro</span>}
                      {p.tomadas.length === 0
                        ? <span className="font-bold text-amber bg-amber/12 border border-amber/30 rounded-full px-2 py-0.5">sem tomada — nada gravado aproveitável</span>
                        : !temBoa && <span className="font-bold text-amber bg-amber/12 border border-amber/30 rounded-full px-2 py-0.5">só descarte — precisa regravar</span>}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1 mb-3">
                  {p.tomadas.map((t) => (
                    // capa + o que é falado: o apelido sozinho não diz qual gravação é
                    <div key={t.drive_id} className="flex items-start gap-2.5">
                      <button
                        onClick={() => tocar(t.drive_id)}
                        title="Assistir"
                        className="group/play relative shrink-0 h-12 w-[68px] rounded-lg bg-surface-2 border border-border overflow-hidden grid place-items-center text-muted"
                      >
                        {t.capa
                          ? <img src={t.capa} alt="" loading="lazy" className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                          : <svg width="16" height="16" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>}
                        <span className="absolute inset-0 grid place-items-center bg-black/35 group-hover/play:bg-black/55 transition-colors">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d={tocando === t.drive_id ? 'M6 5h4v14H6zM14 5h4v14h-4z' : 'M8 5v14l11-7z'} /></svg>
                        </span>
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={'shrink-0 rounded-md border px-1.5 py-0.5 text-[10.5px] font-bold ' + (COR_TIPO[t.tipo || ''] || 'text-muted bg-surface-2 border-border')}>{t.tipo || '—'}</span>
                          <span className="truncate text-[12px] text-ink-2">{t.nome}</span>
                          {t.seg != null && <span className="tnum shrink-0 text-[12px] text-muted">{Math.floor(t.seg / 60)}:{String(t.seg % 60).padStart(2, '0')}</span>}
                        </div>
                        {t.fala && <div className="text-[11.5px] text-muted leading-snug mt-0.5 line-clamp-2">“{t.fala.slice(0, 150)}”</div>}
                        {tocando === t.drive_id && (
                          srcs[t.drive_id]
                            ? <video src={srcs[t.drive_id]} controls autoPlay playsInline className="w-full mt-2 rounded-lg bg-black max-h-[46vh]" />
                            : <div className="w-full mt-2 h-24 grid place-items-center rounded-lg bg-black"><div className="h-5 w-5 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" /></div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {confirmando === p.card_id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-muted flex-1">Desfazer? Os arquivos voltam ao nome de câmera.</span>
                    <button onClick={() => nao(p)} disabled={ocupado === p.card_id} className="h-9 px-3 rounded-xl bg-red text-white text-[12.5px] font-bold disabled:opacity-60">{ocupado === p.card_id ? 'desfazendo…' : 'Sim, desfazer'}</button>
                    <button onClick={() => setConfirmando(null)} className="h-9 px-3 rounded-xl bg-surface-2 border border-border text-ink-2 text-[12.5px] font-semibold">Cancelar</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button onClick={() => ok(p)} disabled={!!ocupado} className="h-9 px-4 rounded-xl bg-brand text-white text-[12.5px] font-bold disabled:opacity-60 active:scale-[0.98] transition-transform">Aprovar</button>
                    <button onClick={() => setConfirmando(p.card_id)} disabled={!!ocupado} className="h-9 px-3 rounded-xl bg-surface-2 border border-border text-ink-2 text-[12.5px] font-semibold hover:border-border-strong disabled:opacity-60">Recusar</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
