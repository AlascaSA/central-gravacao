import { useEffect, useState } from 'react'
import { CATEGORIAS, COPYS, type Categoria, type Copy, type NovoCard } from '../types'
import ProdutoPicker from './ProdutoPicker'

export default function NewCardModal({
  open,
  copyDefault,
  onClose,
  onCreate,
}: {
  open: boolean
  copyDefault: Copy
  onClose: () => void
  onCreate: (novo: NovoCard) => Promise<void> | void
}) {
  const [copy, setCopy] = useState<Copy>(copyDefault)
  const [semRoteiro, setSemRoteiro] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [categoria, setCategoria] = useState<Categoria>('Conteúdo')
  const [produto, setProduto] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (open) {
      setCopy(copyDefault)
      setSemRoteiro(false)
      setTitulo('')
      setCategoria('Conteúdo')
      setProduto('')
      setSalvando(false)
    }
  }, [open, copyDefault])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const inputCls =
    'w-full h-12 px-3.5 rounded-xl bg-surface border border-border text-ink text-[16px] outline-none transition-colors focus:border-brand/70 placeholder:text-muted'

  async function salvar() {
    if (!titulo.trim() || salvando) return
    setSalvando(true)
    try {
      await onCreate({ copy, semRoteiro, titulo, categoria, produto: produto || undefined })
      onClose()
    } finally {
      setSalvando(false)
    }
  }

  function pill(ativo: boolean) {
    return (
      'h-11 rounded-xl border text-[14px] font-semibold transition-all active:scale-95 ' +
      (ativo ? 'bg-brand/12 border-brand/40 text-brand-2' : 'bg-surface border-border text-ink-2 hover:border-border-strong')
    )
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center">
      <div className="fade-in absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="sheet-up relative w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-elev border-t sm:border border-border-strong rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 pb-[calc(env(safe-area-inset-bottom)+22px)] shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.8)]">
        <div className="mx-auto sm:hidden mb-4 h-1 w-10 rounded-full bg-border-strong" />
        <h3 className="text-[18px] font-black tracking-[-0.02em] mb-5">Novo card</h3>

        <label className="block text-[12px] font-semibold text-muted mb-1.5">Copy</label>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {COPYS.map((c) => (
            <button key={c} onClick={() => setCopy(c)} className={pill(copy === c)}>
              {c}
            </button>
          ))}
        </div>
        <button
          onClick={() => setSemRoteiro((v) => !v)}
          className={'mb-4 h-10 px-3.5 rounded-xl border text-[13px] font-semibold transition-all active:scale-95 inline-flex items-center gap-2 ' + (semRoteiro ? 'text-amber bg-amber/12 border-amber/40' : 'bg-surface border-border text-muted hover:text-ink')}
        >
          <span className={'h-4 w-4 rounded grid place-items-center border ' + (semRoteiro ? 'bg-amber border-amber' : 'border-border-strong')}>
            {semRoteiro && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1a1205" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>}
          </span>
          Sem roteiro escrito
        </button>

        <label className="block text-[12px] font-semibold text-muted mb-1.5">Categoria</label>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {CATEGORIAS.map((c) => (
            <button key={c} onClick={() => setCategoria(c)} className={pill(categoria === c)}>
              {c}
            </button>
          ))}
        </div>

        <label className="block text-[12px] font-semibold text-muted mb-1.5">Produto</label>
        <div className="mb-4"><ProdutoPicker value={produto || undefined} onChange={setProduto} /></div>

        <label className="block text-[12px] font-semibold text-muted mb-1.5">Título do vídeo</label>
        <input className={inputCls + ' mb-6'} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Dívida de ITBI" autoFocus />

        <div className="flex gap-2.5">
          <button onClick={onClose} className="flex-1 h-12 rounded-xl bg-surface-2 border border-border text-ink font-semibold active:scale-[0.98] transition-transform">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={!titulo.trim() || salvando}
            className="flex-[2] h-12 rounded-xl bg-brand text-white font-bold shadow-[0_8px_22px_-4px_rgba(20,168,245,0.5)] disabled:opacity-40 disabled:shadow-none active:scale-[0.98] transition-all"
          >
            {salvando ? 'Salvando…' : 'Criar card'}
          </button>
        </div>
      </div>
    </div>
  )
}
