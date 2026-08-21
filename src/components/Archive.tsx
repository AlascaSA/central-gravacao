import { useMemo, useState } from 'react'
import type { Card } from '../types'
import { CATEGORIAS } from '../types'
import { CAT_COR } from './CardItem'
import { corDoProduto } from '../produtoCor'

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function rotuloMes(ym: string): string {
  // ym = "yyyy-MM"
  const [y, m] = ym.split('-')
  const mi = parseInt(m, 10) - 1
  return (MESES[mi] ?? '?') + ' / ' + y
}

const selCls = (ativo: boolean) =>
  'h-11 rounded-lg border bg-surface-2 px-2 text-[12px] outline-none cursor-pointer ' +
  (ativo ? 'border-brand/50 text-ink' : 'border-border text-muted')

export default function Archive({ cards, onOpen }: { cards: Card[]; onOpen: (c: Card) => void }) {
  const [busca, setBusca] = useState('')
  const [fProduto, setFProduto] = useState('')
  const [fCategoria, setFCategoria] = useState('')
  const [fCopy, setFCopy] = useState('')
  const [fSemana, setFSemana] = useState('')

  const produtos = useMemo(() => [...new Set(cards.map((c) => c.produto).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b)), [cards])
  const copys = useMemo(() => [...new Set(cards.map((c) => c.copy).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b)), [cards])
  const semanas = useMemo(() => [...new Set(cards.map((c) => c.semana).filter(Boolean) as string[])].sort().reverse(), [cards])

  const q = busca.trim().toLowerCase()
  const algumFiltro = !!(q || fProduto || fCategoria || fCopy || fSemana)
  const filtrados = useMemo(
    () =>
      cards.filter((c) => {
        if (q && !(c.titulo.toLowerCase().includes(q) || (c.campanha || '').toLowerCase().includes(q))) return false
        if (fProduto && c.produto !== fProduto) return false
        if (fCategoria && c.categoria !== fCategoria) return false
        if (fCopy && c.copy !== fCopy) return false
        if (fSemana && c.semana !== fSemana) return false
        return true
      }),
    [cards, q, fProduto, fCategoria, fCopy, fSemana],
  )

  const grupos: Record<string, Card[]> = {}
  for (const c of filtrados) {
    const ym = (c.finalizadoEm ?? '').substring(0, 7) || 'sem-data'
    ;(grupos[ym] = grupos[ym] ?? []).push(c)
  }
  const chaves = Object.keys(grupos).sort().reverse()

  // nada arquivado ainda: nem mostra a barra de filtros
  if (cards.length === 0) {
    return <div className="relative z-10 text-center text-muted py-20 px-6">Nada finalizado ainda.</div>
  }

  return (
    <div className="relative z-10 px-4 pb-28 max-w-2xl mx-auto">
      <div className="pt-3 pb-3 flex flex-wrap items-center gap-1.5">
        <div className="relative">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar…"
            className="h-11 w-40 rounded-lg border border-border bg-surface-2 pl-8 pr-2 text-[12px] text-ink outline-none focus:border-brand/50 placeholder:text-muted"
          />
        </div>
        {produtos.length > 0 && (
          <select value={fProduto} onChange={(e) => setFProduto(e.target.value)} className={selCls(!!fProduto)}>
            <option value="">Produto: todos</option>
            {produtos.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        <select value={fCategoria} onChange={(e) => setFCategoria(e.target.value)} className={selCls(!!fCategoria)}>
          <option value="">Categoria: todas</option>
          {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={fCopy} onChange={(e) => setFCopy(e.target.value)} className={selCls(!!fCopy)}>
          <option value="">Copy: todos</option>
          {copys.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {semanas.length > 0 && (
          <select value={fSemana} onChange={(e) => setFSemana(e.target.value)} className={selCls(!!fSemana)}>
            <option value="">Semana: todas</option>
            {semanas.map((s) => <option key={s} value={s}>{'Semana ' + s.slice(8, 10) + '/' + s.slice(5, 7)}</option>)}
          </select>
        )}
        {algumFiltro && (
          <button onClick={() => { setBusca(''); setFProduto(''); setFCategoria(''); setFCopy(''); setFSemana('') }} className="text-[12px] font-medium text-muted hover:text-rose-300 ml-0.5">limpar</button>
        )}
      </div>

      {chaves.length === 0 ? (
        <div className="text-center text-muted py-16">Nenhuma tarefa com esses filtros.</div>
      ) : (
        chaves.map((ym) => (
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
                <div key={c.id} onClick={() => onOpen(c)} title="Abrir detalhe" className="rounded-xl border border-border bg-surface px-3.5 py-2.5 flex items-center gap-3 cursor-pointer hover:border-border-strong hover:bg-surface-2/40 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {c.comentario?.trim() && (
                        <span title={c.comentario} aria-label="Tem aviso" className="shrink-0 grid place-items-center h-[16px] w-[16px] rounded-full bg-amber/15 text-amber">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                        </span>
                      )}
                      <div className="text-[14px] font-semibold truncate">{c.titulo}</div>
                    </div>
                    <div className="text-[12px] text-muted flex flex-wrap items-center gap-1.5 mt-0.5">
                      {c.copy && <span>{c.copy}</span>}
                      {c.semRoteiro && <span className="text-[11px] font-bold text-amber bg-amber/12 rounded-full px-1.5 py-0.5">sem roteiro</span>}
                      {c.categoria && <span className={'text-[11px] font-bold rounded-full px-1.5 py-0.5 ' + (CAT_COR[c.categoria] ?? 'text-muted bg-surface-2')}>{c.categoria}</span>}
                      {c.produto && <span className={'text-[11px] font-bold border rounded-full px-1.5 py-0.5 ' + corDoProduto(c.produto)}>{c.produto}</span>}
                      {c.campanha && <span>· {c.campanha}</span>}
                    </div>
                  </div>
                  {c.documentos.length > 0 && (
                    <a href={c.documentos[0].url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[12px] text-brand-2 shrink-0">
                      {c.documentos.length} doc{c.documentos.length > 1 ? 's' : ''}
                    </a>
                  )}
                  <span className="text-[11px] text-muted shrink-0 tnum">{(c.finalizadoEm ?? '').substring(8, 10)}/{(c.finalizadoEm ?? '').substring(5, 7)}</span>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
