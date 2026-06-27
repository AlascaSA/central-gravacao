import { useEffect, useState } from 'react'
import { CATEGORIAS, COPYS, URGENCIAS, type Categoria, type Copy, type Urgencia } from '../types'
import { store } from '../data/store'
import { processarDoc } from '../data/ai'
import ProdutoPicker from './ProdutoPicker'

export default function UploadModal({
  open,
  copyDefault,
  semana,
  onClose,
  onDone,
}: {
  open: boolean
  copyDefault: Copy
  semana: string
  onClose: () => void
  onDone: () => void
}) {
  const [copy, setCopy] = useState<Copy>(copyDefault)
  const [categoria, setCategoria] = useState<Categoria>('Conteúdo')
  const [produto, setProduto] = useState('')
  const [campanha, setCampanha] = useState('')
  const [prazo, setPrazo] = useState('')
  const [urgencia, setUrgencia] = useState<Urgencia>('média')
  const [files, setFiles] = useState<File[]>([])
  const [rodando, setRodando] = useState(false)
  const [status, setStatus] = useState('')
  const [resultado, setResultado] = useState<{ cards: number; docs: number; erros: string[] } | null>(null)

  useEffect(() => {
    if (open) {
      setCopy(copyDefault)
      setCategoria('Conteúdo')
      setProduto('')
      setCampanha('')
      setPrazo('')
      setUrgencia('média')
      setFiles([])
      setRodando(false)
      setStatus('')
      setResultado(null)
    }
  }, [open, copyDefault])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !rodando) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, rodando, onClose])

  if (!open) return null

  async function processar() {
    if (!files.length || rodando) return
    setRodando(true)
    setResultado(null)
    let cards = 0
    const erros: string[] = []
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      try {
        setStatus('Subindo ' + f.name + ' (' + (i + 1) + '/' + files.length + ')…')
        const doc = await store.uploadArquivo(f, copy)
        setStatus('IA lendo ' + f.name + '…')
        const videos = await processarDoc({ url: doc.url, nome: doc.nome, copy })
        if (!videos.length) erros.push(f.name + ': nenhum vídeo encontrado')
        for (const v of videos) {
          await store.createCard({
            copy,
            titulo: v.titulo,
            campanha: campanha.trim() || v.campanha,
            categoria,
            produto: produto || undefined,
            urgencia,
            prazo: prazo.trim() || undefined,
            semana,
            documentos: [doc],
            observacoes: v.roteiro,
          })
          cards++
        }
      } catch (e) {
        erros.push(f.name + ': ' + (e instanceof Error ? e.message : 'erro'))
      }
    }
    setStatus('')
    setRodando(false)
    setResultado({ cards, docs: files.length, erros })
    onDone()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center">
      <div className="fade-in absolute inset-0 bg-black/60" onClick={rodando ? undefined : onClose} />
      <div className="sheet-up relative w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-elev border-t sm:border border-border-strong rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 pb-[calc(env(safe-area-inset-bottom)+22px)] shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.8)]">
        <div className="mx-auto sm:hidden mb-4 h-1 w-10 rounded-full bg-border-strong" />
        <h3 className="text-[18px] font-black tracking-[-0.02em] mb-1">Subir roteiros</h3>
        <p className="text-[12px] text-muted mb-5">A IA lê cada documento e cria um card por vídeo.</p>

        {!resultado && (
          <>
            <label className="block text-[12px] font-semibold text-muted mb-1.5">Copy responsável</label>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {COPYS.map((c) => (
                <button
                  key={c}
                  disabled={rodando}
                  onClick={() => setCopy(c)}
                  className={
                    'h-11 rounded-xl border text-[14px] font-semibold transition-all active:scale-95 disabled:opacity-50 ' +
                    (copy === c ? 'bg-brand/12 border-brand/40 text-brand-2' : 'bg-surface border-border text-ink-2')
                  }
                >
                  {c}
                </button>
              ))}
            </div>

            <label className="block text-[12px] font-semibold text-muted mb-1.5">Categoria das tarefas</label>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {CATEGORIAS.map((c) => (
                <button
                  key={c}
                  disabled={rodando}
                  onClick={() => setCategoria(c)}
                  className={
                    'h-11 rounded-xl border text-[14px] font-semibold transition-all active:scale-95 disabled:opacity-50 ' +
                    (categoria === c ? 'bg-brand/12 border-brand/40 text-brand-2' : 'bg-surface border-border text-ink-2')
                  }
                >
                  {c}
                </button>
              ))}
            </div>

            <label className="block text-[12px] font-semibold text-muted mb-1.5">Produto</label>
            <div className="mb-4"><ProdutoPicker value={produto || undefined} onChange={setProduto} /></div>

            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label className="block text-[12px] font-semibold text-muted mb-1.5">Campanha</label>
                <input value={campanha} onChange={(e) => setCampanha(e.target.value)} disabled={rodando} placeholder="opcional" className="w-full h-11 px-3.5 rounded-xl bg-surface border border-border text-ink text-[15px] outline-none focus:border-brand/70 placeholder:text-muted disabled:opacity-50" />
              </div>
              <div className="w-[110px]">
                <label className="block text-[12px] font-semibold text-muted mb-1.5">Prazo</label>
                <input value={prazo} onChange={(e) => setPrazo(e.target.value)} disabled={rodando} placeholder="dd/mm" inputMode="numeric" className="w-full h-11 px-3.5 rounded-xl bg-surface border border-border text-ink text-[15px] outline-none focus:border-brand/70 placeholder:text-muted disabled:opacity-50" />
              </div>
            </div>

            <label className="block text-[12px] font-semibold text-muted mb-1.5">Urgência</label>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {URGENCIAS.map((u) => (
                <button key={u} disabled={rodando} onClick={() => setUrgencia(u)} className={'h-11 rounded-xl border text-[14px] font-semibold capitalize transition-all active:scale-95 disabled:opacity-50 ' + (urgencia === u ? 'bg-brand/12 border-brand/40 text-brand-2' : 'bg-surface border-border text-ink-2')}>{u}</button>
              ))}
            </div>

            <label
              className={
                'flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed py-6 mb-3 cursor-pointer transition-colors ' +
                (files.length ? 'border-brand/50 bg-brand/5' : 'border-border-strong hover:border-brand/40')
              }
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-2">
                <path d="M12 16V4M6 10l6-6 6 6" />
                <path d="M4 20h16" />
              </svg>
              <span className="text-[14px] font-semibold text-ink">
                {files.length ? files.length + ' documento' + (files.length > 1 ? 's' : '') + ' escolhido' + (files.length > 1 ? 's' : '') : 'Escolher documentos'}
              </span>
              <span className="text-[12px] text-muted">.docx · .pdf · .txt — pode vários de uma vez</span>
              <input
                type="file"
                multiple
                accept=".docx,.pdf,.txt,.md"
                disabled={rodando}
                className="hidden"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
            </label>

            {files.length > 0 && (
              <div className="flex flex-col gap-1 mb-4 max-h-28 overflow-y-auto">
                {files.map((f, i) => (
                  <div key={i} className="text-[12px] text-ink-2 bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 truncate">
                    {f.name}
                  </div>
                ))}
              </div>
            )}

            {rodando && (
              <div className="flex items-center gap-2 text-[13px] text-brand-2 mb-4">
                <span className="h-4 w-4 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
                {status || 'Processando…'}
              </div>
            )}

            <div className="flex gap-2.5">
              <button onClick={onClose} disabled={rodando} className="flex-1 h-12 rounded-xl bg-surface-2 border border-border text-ink font-semibold disabled:opacity-40 active:scale-[0.98] transition-transform">
                Cancelar
              </button>
              <button
                onClick={processar}
                disabled={!files.length || rodando}
                className="flex-[2] h-12 rounded-xl bg-brand text-white font-bold shadow-[0_8px_22px_-4px_rgba(20,168,245,0.5)] disabled:opacity-40 disabled:shadow-none active:scale-[0.98] transition-all"
              >
                {rodando ? 'Processando…' : 'Processar com IA'}
              </button>
            </div>
          </>
        )}

        {resultado && (
          <>
            <div className="rounded-2xl bg-surface border border-border p-4 mb-4 text-center">
              <div className="text-[28px] font-black text-green leading-none">{resultado.cards}</div>
              <div className="text-[13px] text-muted mt-1">
                card{resultado.cards !== 1 ? 's' : ''} criado{resultado.cards !== 1 ? 's' : ''} de {resultado.docs} documento{resultado.docs > 1 ? 's' : ''}
              </div>
            </div>
            {resultado.erros.length > 0 && (
              <div className="flex flex-col gap-1 mb-4 max-h-28 overflow-y-auto">
                {resultado.erros.map((er, i) => (
                  <div key={i} className="text-[12px] text-amber bg-amber/10 border border-amber/20 rounded-lg px-2.5 py-1.5">{er}</div>
                ))}
              </div>
            )}
            <button onClick={onClose} className="w-full h-12 rounded-xl bg-brand text-white font-bold active:scale-[0.98] transition-transform">
              Ver no quadro
            </button>
          </>
        )}
      </div>
    </div>
  )
}
