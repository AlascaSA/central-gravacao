import { useEffect, useRef, useState } from 'react'
import { store } from '../data/store'
import { corDoProduto } from '../produtoCor'

// Seletor de produto: mostra os produtos salvos (chips) e deixa digitar um novo pra salvar.
// Começa vazio; a lista cresce conforme você adiciona.
export default function ProdutoPicker({ value, onChange }: { value?: string; onChange: (p: string) => void }) {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const [produtos, setProdutos] = useState<string[]>([])
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { store.listarProdutos().then(setProdutos).catch(() => {}) }, [])
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const filtrados = produtos.filter((p) => p.toLowerCase().includes(busca.toLowerCase()))
  const podeAdd = busca.trim() && !produtos.some((p) => p.toLowerCase() === busca.trim().toLowerCase())

  function escolher(p: string) { onChange(p); setOpen(false); setBusca('') }
  async function adicionar() {
    const n = busca.trim()
    if (!n) return
    await store.salvarProduto(n).catch(() => {})
    setProdutos((ps) => (ps.some((p) => p.toLowerCase() === n.toLowerCase()) ? ps : [...ps, n].sort((a, b) => a.localeCompare(b))))
    escolher(n)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full h-11 px-3.5 rounded-xl bg-surface border border-border text-left text-[15px] flex items-center justify-between transition-colors hover:border-border-strong"
      >
        <span className={value ? 'text-ink truncate' : 'text-muted'}>{value || 'Escolher produto'}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted shrink-0"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute z-10 mt-1.5 w-full rounded-xl bg-elev border border-border-strong shadow-[0_18px_50px_-12px_rgba(0,0,0,0.7)] p-2">
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && podeAdd) { e.preventDefault(); adicionar() } }}
            placeholder="Buscar ou digitar novo…"
            className="w-full h-9 px-3 rounded-lg bg-surface border border-border text-[14px] text-ink outline-none focus:border-brand/60 mb-2"
          />
          <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
            {filtrados.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => escolher(p)}
                className={'text-[12.5px] font-bold rounded-lg px-2.5 py-1.5 border transition-all ' + corDoProduto(p) + (value === p ? ' ring-2 ring-white/50' : ' hover:brightness-125')}
              >
                {p}
              </button>
            ))}
            {filtrados.length === 0 && !podeAdd && <div className="text-[12px] text-muted px-1 py-1">Nenhum produto salvo ainda — digite pra adicionar.</div>}
          </div>
          {podeAdd && (
            <button type="button" onClick={adicionar} className="mt-2 w-full text-left text-[13px] font-semibold text-brand-2 bg-brand/10 border border-brand/30 rounded-lg px-3 py-2 hover:bg-brand/15 transition-colors">
              + Adicionar e salvar “{busca.trim()}”
            </button>
          )}
          {value && (
            <button type="button" onClick={() => { onChange(''); setOpen(false); setBusca('') }} className="mt-2 w-full text-left text-[12.5px] font-semibold text-muted hover:text-rose-300 transition-colors px-1 py-1">
              ✕ Remover produto
            </button>
          )}
        </div>
      )}
    </div>
  )
}
