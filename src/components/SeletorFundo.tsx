import { useState } from 'react'
import { FUNDOS, CEUS, trocarFundo, trocarCeu, desligarFundo, type Fundo, type Ceu } from '../fundo'

const NOMES: Record<Fundo, string> = {
  linha: 'Linha · cor é estrutura',
  redacao: 'Redação · grafite morno',
}
const NOMES_CEU: Record<Ceu, string> = {
  sepia: 'Sépia · couro (o da referência)',
  tinta: 'Tinta · azul profundo',
  petroleo: 'Petróleo · verde escuro',
  grafite: 'Grafite · carvão morno',
}

/** Painel flutuante só do teste visual. Renderizado apenas quando há ?fundo= ou ?ceu= ativo. */
export default function SeletorFundo({ inicial, ceuInicial }: { inicial: Fundo | null; ceuInicial: Ceu | null }) {
  const [atual, setAtual] = useState<Fundo | null>(inicial)
  const [ceu, setCeu] = useState<Ceu | null>(ceuInicial)
  const [aberto, setAberto] = useState(true)

  const item = (ativo: boolean) =>
    'text-left text-[12px] font-semibold rounded-lg px-2.5 py-1.5 border transition-colors ' +
    (ativo ? 'bg-brand/12 border-brand/40 text-brand-2' : 'bg-surface border-border text-ink-2 hover:border-border-strong')

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="fixed left-3 bottom-3 z-50 h-9 px-3 rounded-xl bg-elev/95 border border-border-strong text-[12px] font-semibold text-ink-2 backdrop-blur hover:border-brand/50 transition-colors"
      >
        {atual || 'off'} · {ceu || 'sem céu'}
      </button>
    )
  }

  return (
    <div className="fixed left-3 bottom-3 z-50 rounded-2xl bg-elev/95 border border-border-strong backdrop-blur p-2 w-[228px] shadow-[0_18px_50px_-12px_rgba(0,0,0,0.8)] max-h-[80vh] overflow-y-auto">
      <div className="flex items-center gap-2 px-1 pb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted">direção</span>
        <button onClick={() => setAberto(false)} aria-label="Recolher" className="ml-auto text-muted hover:text-ink text-[14px] leading-none px-1">–</button>
      </div>
      <div className="flex flex-col gap-1">
        {FUNDOS.map((f) => (
          <button key={f} onClick={() => { trocarFundo(f); setAtual(f) }} className={item(atual === f)}>
            {NOMES[f]}
          </button>
        ))}
      </div>

      <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted px-1 pt-3 pb-1.5">céu (o fundo)</div>
      <div className="flex flex-col gap-1">
        <button onClick={() => { trocarCeu(null); setCeu(null) }} className={item(ceu === null)}>Sem céu (liso)</button>
        {CEUS.map((c) => (
          <button key={c} onClick={() => { trocarCeu(c); setCeu(c) }} className={item(ceu === c)}>
            {NOMES_CEU[c]}
          </button>
        ))}
      </div>

      <button
        onClick={() => { desligarFundo(); window.location.search = '' }}
        className="w-full text-left text-[12px] font-semibold rounded-lg px-2.5 py-1.5 border border-border text-muted hover:text-ink hover:border-border-strong transition-colors mt-3"
      >
        Desligar tudo (app atual)
      </button>
    </div>
  )
}
