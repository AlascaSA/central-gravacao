import { useMemo, useState } from 'react'
import type { Card, Fase } from '../types'
import { fasesDoTime } from '../types'
import { getTeam, labelFase } from '../data/team'

// BANCADA DE TESTE (?teste=volume) — 8 jeitos de lidar com 73 cards numa tela de celular.
// Não é produção: existe pra comparar lado a lado e escolher. Os dados são os reais do time.
const MODOS = [
  { k: 1, nome: 'Resumo', desc: 'abre nos números; entra no bloco' },
  { k: 2, nome: 'Recorte', desc: 'já filtrado na semana; "tudo" é exceção' },
  { k: 3, nome: 'Grupos', desc: 'grupos recolhidos, você abre um' },
  { k: 4, nome: 'Topo', desc: 'os 10 que importam + mostrar mais' },
  { k: 5, nome: 'Busca', desc: 'começa pela busca' },
  { k: 6, nome: 'Linhas', desc: 'uma linha por peça' },
  { k: 7, nome: 'Higiene', desc: 'parado há semanas sai da frente' },
  { k: 8, nome: 'Virtual', desc: 'renderiza só o que está na tela' },
] as const

const urg = (c: Card) => (c.urgencia === 'alta' ? 0 : c.urgencia === 'baixa' ? 2 : 1)

function Linha({ c, onAbrir }: { c: Card; onAbrir?: () => void }) {
  return (
    <button onClick={onAbrir} className="w-full text-left flex items-center gap-2.5 min-h-11 px-3 py-2 border-b border-border/60 active:bg-surface-2">
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: c.urgencia === 'alta' ? '#ff5c63' : '#36404f' }} />
      <span className="flex-1 min-w-0 truncate text-[13.5px] font-semibold text-ink">{c.titulo}</span>
      {c.copy && <span className="shrink-0 text-[11px] text-muted">{c.copy}</span>}
      {c.produto && <span className="shrink-0 text-[10.5px] font-bold text-brand-2 bg-brand/10 rounded px-1.5 py-0.5 max-w-[86px] truncate">{c.produto}</span>}
    </button>
  )
}

export default function TesteVolume({ cards, onOpen }: { cards: Card[]; onOpen?: (c: Card) => void }) {
  const [modo, setModo] = useState<number>(1)
  const [faseSel, setFaseSel] = useState<Fase | null>(null)
  const [grupoAberto, setGrupoAberto] = useState<string | null>(null)
  const [tudo, setTudo] = useState(false)
  const [busca, setBusca] = useState('')
  const [maisTopo, setMaisTopo] = useState(false)
  const fases = fasesDoTime(getTeam())

  const porFase = useMemo(() => {
    const m = new Map<Fase, Card[]>()
    for (const f of fases) m.set(f, cards.filter((c) => c.fase === f))
    return m
  }, [cards, fases])

  const semanaAtual = useMemo(() => {
    const hoje = new Date()
    const seg = new Date(hoje); seg.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7))
    return seg.toISOString().slice(0, 10)
  }, [])

  const cab = (txt: string) => <div className="px-3 pt-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">{txt}</div>

  function corpo() {
    // 1 — RESUMO: a tela abre nos números; só renderiza cards quando você entra numa fase
    if (modo === 1) {
      if (faseSel) {
        const lista = porFase.get(faseSel) || []
        return (
          <>
            <button onClick={() => setFaseSel(null)} className="min-h-11 px-3 text-[13px] font-semibold text-brand-2">‹ voltar aos números</button>
            {lista.map((c) => <Linha key={c.id} c={c} onAbrir={() => onOpen?.(c)} />)}
          </>
        )
      }
      return (
        <div className="p-3 flex flex-col gap-2">
          {fases.map((f) => {
            const n = (porFase.get(f) || []).length
            return (
              <button key={f} onClick={() => setFaseSel(f)} disabled={!n} className="flex items-center justify-between min-h-14 px-4 rounded-2xl bg-surface border border-border disabled:opacity-40">
                <span className="text-[14.5px] font-bold text-ink">{labelFase(f)}</span>
                <span className="tnum text-[20px] font-black text-brand-2">{n}</span>
              </button>
            )
          })}
        </div>
      )
    }

    // 2 — RECORTE: entra já na semana atual; "tudo" existe, mas é escolha consciente
    if (modo === 2) {
      const base = tudo ? cards : cards.filter((c) => c.semana === semanaAtual)
      return (
        <>
          <div className="flex items-center gap-2 p-3">
            <button onClick={() => setTudo(false)} className={'min-h-11 flex-1 rounded-xl text-[13px] font-bold ' + (!tudo ? 'bg-brand text-white' : 'bg-surface-2 text-muted')}>Esta semana · {cards.filter((c) => c.semana === semanaAtual).length}</button>
            <button onClick={() => setTudo(true)} className={'min-h-11 flex-1 rounded-xl text-[13px] font-bold ' + (tudo ? 'bg-brand text-white' : 'bg-surface-2 text-muted')}>Tudo · {cards.length}</button>
          </div>
          {base.map((c) => <Linha key={c.id} c={c} onAbrir={() => onOpen?.(c)} />)}
        </>
      )
    }

    // 3 — GRUPOS: 73 cards viram ~8 linhas de grupo; abre um por vez
    if (modo === 3) {
      const g = new Map<string, Card[]>()
      for (const c of cards) {
        const k = c.produto || 'sem produto'
        g.set(k, [...(g.get(k) || []), c])
      }
      return (
        <div className="p-3 flex flex-col gap-1.5">
          {[...g.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, lista]) => (
            <div key={k} className="rounded-2xl border border-border bg-surface overflow-hidden">
              <button onClick={() => setGrupoAberto(grupoAberto === k ? null : k)} className="w-full flex items-center justify-between min-h-12 px-3.5">
                <span className="text-[13.5px] font-bold text-ink truncate">{k}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="tnum text-[12px] font-bold text-muted">{lista.length}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className={'text-muted transition-transform ' + (grupoAberto === k ? 'rotate-180' : '')}><path d="M6 9l6 6 6-6" /></svg>
                </span>
              </button>
              {grupoAberto === k && lista.map((c) => <Linha key={c.id} c={c} onAbrir={() => onOpen?.(c)} />)}
            </div>
          ))}
        </div>
      )
    }

    // 4 — TOPO: os 10 que pedem ação; o resto fica atrás de um botão
    if (modo === 4) {
      const ord = [...cards].sort((a, b) => urg(a) - urg(b) || (a.prazo || 'z').localeCompare(b.prazo || 'z'))
      const vis = maisTopo ? ord : ord.slice(0, 10)
      return (
        <>
          {cab('o que pede ação agora')}
          {vis.map((c) => <Linha key={c.id} c={c} onAbrir={() => onOpen?.(c)} />)}
          {!maisTopo && ord.length > 10 && (
            <button onClick={() => setMaisTopo(true)} className="w-full min-h-12 text-[13px] font-bold text-brand-2">mostrar mais {ord.length - 10}</button>
          )}
        </>
      )
    }

    // 5 — BUSCA: quem trabalha na produção quase sempre procura uma peça específica
    if (modo === 5) {
      const q = busca.trim().toLowerCase()
      const achou = q ? cards.filter((c) => (c.titulo + ' ' + (c.produto || '') + ' ' + (c.copy || '')).toLowerCase().includes(q)) : []
      return (
        <>
          <div className="p-3">
            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar peça…" className="w-full h-12 rounded-xl bg-surface border border-border px-3.5 text-[14px] text-ink outline-none focus:border-brand/60 placeholder:text-muted" />
          </div>
          {!q && <div className="px-3 text-[13px] text-muted">Digite para achar entre {cards.length} peças.</div>}
          {q && !achou.length && <div className="px-3 text-[13px] text-muted">Nada com “{busca}”.</div>}
          {achou.map((c) => <Linha key={c.id} c={c} onAbrir={() => onOpen?.(c)} />)}
        </>
      )
    }

    // 6 — LINHAS: mesma informação, densidade de lista (cabem ~20 por tela em vez de 3)
    if (modo === 6) {
      return (
        <>
          {fases.map((f) => {
            const lista = porFase.get(f) || []
            if (!lista.length) return null
            return (
              <div key={f}>
                {cab(labelFase(f) + ' · ' + lista.length)}
                {lista.map((c) => <Linha key={c.id} c={c} onAbrir={() => onOpen?.(c)} />)}
              </div>
            )
          })}
        </>
      )
    }

    // 7 — HIGIENE: o que está parado há semanas sai da frente (mas continua alcançável)
    if (modo === 7) {
      const limite = new Date(Date.now() - 21 * 864e5).toISOString().slice(0, 10)
      const vivos = cards.filter((c) => !c.semana || c.semana >= limite)
      const parados = cards.filter((c) => c.semana && c.semana < limite)
      return (
        <>
          {cab('ativos · ' + vivos.length)}
          {vivos.map((c) => <Linha key={c.id} c={c} onAbrir={() => onOpen?.(c)} />)}
          {parados.length > 0 && (
            <>
              <button onClick={() => setGrupoAberto(grupoAberto === 'parados' ? null : 'parados')} className="w-full min-h-12 mt-2 text-[12.5px] font-bold text-muted">
                {grupoAberto === 'parados' ? 'esconder' : 'mostrar'} {parados.length} parado{parados.length > 1 ? 's' : ''} há mais de 3 semanas
              </button>
              {grupoAberto === 'parados' && parados.map((c) => <Linha key={c.id} c={c} onAbrir={() => onOpen?.(c)} />)}
            </>
          )}
        </>
      )
    }

    // 8 — VIRTUAL: renderiza só a janela visível (aqui: fatia crescente conforme rola)
    return <Virtual cards={cards} onOpen={onOpen} />
  }

  return (
    <div className="relative z-10 h-full flex flex-col">
      <div className="shrink-0 px-3 pt-3">
        <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted mb-1.5">Bancada · {cards.length} cards</div>
        <div className="grid grid-cols-4 gap-1.5">
          {MODOS.map((m) => (
            <button key={m.k} onClick={() => { setModo(m.k); setFaseSel(null); setGrupoAberto(null) }} className={'min-h-11 rounded-xl text-[12px] font-bold transition-colors ' + (modo === m.k ? 'bg-brand text-white' : 'bg-surface-2 text-muted')}>
              {m.k}. {m.nome}
            </button>
          ))}
        </div>
        <div className="text-[12px] text-muted mt-2 mb-1">{MODOS.find((m) => m.k === modo)?.desc}</div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto pb-24">{corpo()}</div>
    </div>
  )
}

// fatia que cresce ao rolar — prova a diferença de fluidez com 73+ itens
function Virtual({ cards, onOpen }: { cards: Card[]; onOpen?: (c: Card) => void }) {
  const [n, setN] = useState(15)
  return (
    <div
      onScroll={(e) => {
        const el = e.currentTarget
        if (el.scrollTop + el.clientHeight > el.scrollHeight - 200) setN((v) => Math.min(v + 15, cards.length))
      }}
      className="h-full overflow-y-auto"
    >
      {cards.slice(0, n).map((c) => <Linha key={c.id} c={c} onAbrir={() => onOpen?.(c)} />)}
      {n < cards.length && <div className="py-4 text-center text-[12px] text-muted">carregando… ({n} de {cards.length})</div>}
    </div>
  )
}
