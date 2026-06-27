import { useEffect, useState } from 'react'
import type { Card, Categoria } from '../types'
import { CATEGORIAS } from '../types'
import { viewerUrl } from '../viewer'
import { store } from '../data/store'
import { listarBrutosDoCard, ligarBruto, comentarBruto, type BrutoLigado } from '../data/catalogoBrutos'
import { CAT_COR } from './CardItem'
import ProdutoPicker from './ProdutoPicker'
import { addWeeks, currentMonday, weekLabel } from '../week'

const urgColor: Record<string, string> = {
  alta: 'text-red bg-red/15',
  média: 'text-amber bg-amber/15',
  baixa: 'text-green bg-green/15',
}

const SUPA = import.meta.env.VITE_SUPABASE_URL as string
const proxyDe = (id: string) => `${SUPA}/storage/v1/object/public/proxies/${id}.mp4`
const baixarDe = (id: string, nome: string) => `/api/bruto-video?id=${id}&download=1&nome=${encodeURIComponent(nome)}`

const TIPO_COR: Record<string, string> = {
  boa: 'text-emerald-300 bg-emerald-500/15',
  erro: 'text-rose-300 bg-rose-500/15',
  gancho: 'text-sky-300 bg-sky-500/15',
  complemento: 'text-amber-300 bg-amber-500/15',
}

export default function CardDetail({ card, onClose }: { card: Card | null; onClose: () => void }) {
  const [cat, setCat] = useState<Categoria | undefined>(card?.categoria)
  const [prod, setProd] = useState<string | undefined>(card?.produto)
  const [linked, setLinked] = useState<BrutoLigado[]>([])
  const [playing, setPlaying] = useState<string | null>(null)
  const [tit, setTit] = useState(card?.titulo || '')
  const [editTit, setEditTit] = useState(false)
  const [titTmp, setTitTmp] = useState('')
  const [coment, setComent] = useState(card?.comentario || '')
  const [sem, setSem] = useState<string | undefined>(card?.semana)

  useEffect(() => {
    setCat(card?.categoria)
    setProd(card?.produto)
    setTit(card?.titulo || '')
    setEditTit(false)
    setComent(card?.comentario || '')
    setSem(card?.semana)
    setPlaying(null)
    if (card) listarBrutosDoCard(card.id).then(setLinked).catch(() => setLinked([]))
    else setLinked([])
  }, [card?.id])

  if (!card) return null

  function trocarCat(c: Categoria) {
    setCat(c)
    store.definirCategoria(card!.id, c).catch(() => {})
  }
  function trocarProd(p: string) {
    setProd(p)
    store.definirProduto(card!.id, p).catch(() => {})
  }
  function trocarSemana(nova: string | null) {
    setSem(nova ?? undefined)
    store.moverSemana(card!.id, nova).catch(() => {})
  }
  function retirar(drive_id: string) {
    setLinked((ls) => ls.filter((b) => b.drive_id !== drive_id))
    if (playing === drive_id) setPlaying(null)
    ligarBruto(drive_id, null).catch(() => {})
  }
  function salvarTitulo() {
    const novo = titTmp.trim()
    if (novo && novo !== tit) {
      setTit(novo)
      store.definirTitulo(card!.id, novo).catch(() => {})
    }
    setEditTit(false)
  }
  function salvarComentario() {
    store.definirComentario(card!.id, coment).catch(() => {})
  }
  function mudarComentTomada(drive_id: string, txt: string) {
    setLinked((ls) => ls.map((b) => (b.drive_id === drive_id ? { ...b, comentario: txt } : b)))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fade-in absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="sheet-up relative w-full sm:max-w-lg bg-elev border-t sm:border border-border-strong rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 pb-[calc(env(safe-area-inset-bottom)+22px)] max-h-[86vh] flex flex-col shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.8)]">
        <div className="mx-auto sm:hidden mb-4 h-1 w-10 rounded-full bg-border-strong shrink-0" />

        <div className="flex items-start gap-3 shrink-0">
          <div className="min-w-0 flex-1">
            {editTit ? (
              <input
                autoFocus
                value={titTmp}
                onChange={(e) => setTitTmp(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') salvarTitulo(); else if (e.key === 'Escape') setEditTit(false) }}
                onBlur={salvarTitulo}
                className="w-full text-[18px] font-black tracking-[-0.02em] leading-tight bg-surface border border-brand/60 rounded-lg px-2 py-1 outline-none text-ink"
              />
            ) : (
              <button onClick={() => { setTitTmp(tit); setEditTit(true) }} className="group/t flex items-start gap-1.5 text-left max-w-full" title="Renomear card">
                <h3 className="text-[19px] font-black tracking-[-0.02em] leading-tight">{tit}</h3>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-1.5 shrink-0 text-muted opacity-50 group-hover/t:opacity-100"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              </button>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-brand-2 bg-brand/12 rounded-full px-2 py-0.5">{card.copy}</span>
              {card.campanha && <span className="text-[12px] text-muted">{card.campanha}</span>}
              <span className={'text-[9.5px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ' + (urgColor[card.urgencia] ?? 'text-muted bg-surface-2')}>
                {card.urgencia}
              </span>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="shrink-0 h-9 w-9 grid place-items-center rounded-xl bg-surface-2 border border-border text-muted hover:text-ink transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        {/* corpo rolável */}
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {/* categoria */}
          <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted mb-1.5">Categoria</div>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {CATEGORIAS.map((c) => (
              <button
                key={c}
                onClick={() => trocarCat(c)}
                className={'text-[12px] font-semibold rounded-lg border px-2.5 py-1 transition-colors ' + (cat === c ? (CAT_COR[c] + ' border-transparent') : 'bg-surface-2 border-border text-muted hover:text-ink')}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted mb-1.5">Semana</div>
          <div className="mb-4 flex items-center gap-1.5">
            <button
              onClick={() => trocarSemana(addWeeks(sem ?? currentMonday(), -1))}
              className="h-9 w-9 shrink-0 grid place-items-center rounded-lg bg-surface-2 border border-border text-muted hover:text-ink transition-colors text-[18px] leading-none"
              title="Semana anterior"
            >‹</button>
            <div className="flex-1 text-center text-[13.5px] font-semibold text-ink bg-surface border border-border rounded-lg py-2 tnum">
              {sem ? 'Semana ' + weekLabel(sem) : 'Sem semana'}
            </div>
            <button
              onClick={() => trocarSemana(addWeeks(sem ?? currentMonday(), 1))}
              className="h-9 w-9 shrink-0 grid place-items-center rounded-lg bg-surface-2 border border-border text-muted hover:text-ink transition-colors text-[18px] leading-none"
              title="Próxima semana"
            >›</button>
            {sem && (
              <button onClick={() => trocarSemana(null)} className="shrink-0 text-[12px] font-medium text-muted hover:text-rose-300 transition-colors px-1.5" title="Tirar da semana">
                tirar
              </button>
            )}
          </div>

          <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted mb-1.5">Produto</div>
          <div className="mb-4"><ProdutoPicker value={prod} onChange={trocarProd} /></div>

          <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted mb-1.5">Comentário</div>
          <textarea
            value={coment}
            onChange={(e) => setComent(e.target.value)}
            onBlur={salvarComentario}
            placeholder="Anotação sobre a tarefa…"
            rows={2}
            className="w-full mb-4 px-3 py-2 rounded-xl bg-surface border border-border text-[14px] text-ink outline-none focus:border-brand/60 resize-none placeholder:text-muted"
          />

          {card.documentos.length > 0 && (
            <div className="flex flex-col gap-2 mb-4">
              {card.documentos.map((d, i) => (
                <a
                  key={i}
                  href={viewerUrl(d.nome, d.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-[14px] font-semibold text-white bg-brand rounded-xl px-3.5 py-2.5 shadow-[0_6px_18px_-6px_rgba(20,168,245,0.5)] active:scale-[0.98] transition-transform"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
                  Abrir {d.nome}
                </a>
              ))}
            </div>
          )}

          {/* brutos ligados */}
          {linked.length > 0 && (
            <div className="mb-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted mb-2">Tomadas ligadas ({linked.length})</div>
              <div className="flex flex-col gap-2">
                {linked.map((b) => {
                  const t = b.tipo || b.ia_tipo
                  const tocando = playing === b.drive_id
                  return (
                    <div key={b.drive_id} className="rounded-xl border border-border bg-surface p-2.5">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setPlaying(tocando ? null : b.drive_id)} className="shrink-0 h-8 w-8 grid place-items-center rounded-lg bg-surface-2 border border-border text-ink hover:border-brand/50 transition-colors">
                          {tocando
                            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                            : <svg width="14" height="14" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>}
                        </button>
                        <span className="text-[13px] font-semibold truncate flex-1">{b.nome || b.drive_id}</span>
                        {t && <span className={'shrink-0 text-[10px] font-bold rounded-md px-1.5 py-0.5 ' + (TIPO_COR[t] ?? 'text-muted bg-surface-2')}>{t}</span>}
                        <a href={baixarDe(b.drive_id, b.nome || 'video.mp4')} className="shrink-0 text-[11px] font-semibold text-brand-2 hover:text-brand">Baixar</a>
                        <button onClick={() => retirar(b.drive_id)} title="Retirar da tarefa" className="shrink-0 h-7 w-7 grid place-items-center rounded-lg text-muted hover:text-rose-300 transition-colors">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                        </button>
                      </div>
                      <input
                        value={b.comentario || ''}
                        onChange={(e) => mudarComentTomada(b.drive_id, e.target.value)}
                        onBlur={(e) => comentarBruto(b.drive_id, e.target.value).catch(() => {})}
                        placeholder="Comentário da tomada…"
                        className="w-full mt-2 h-8 px-2.5 rounded-lg bg-surface-2 border border-border text-[12.5px] text-ink-2 outline-none focus:border-brand/50 placeholder:text-muted"
                      />
                      {tocando && (
                        <video src={proxyDe(b.drive_id)} controls autoPlay playsInline className="w-full mt-2 rounded-lg bg-black max-h-[40vh]" />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* roteiro */}
          <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted mb-2">Roteiro</div>
          {card.observacoes ? (
            <div className="text-[15px] leading-relaxed whitespace-pre-wrap text-ink-2">{card.observacoes}</div>
          ) : (
            <div className="text-[13.5px] text-muted">
              Sem roteiro escrito.{card.documentos.length ? ' Abra o documento acima pra ler.' : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
