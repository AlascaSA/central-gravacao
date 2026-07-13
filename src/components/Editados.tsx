import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { listarEditados, marcarPostado, sincronizarEditados, type Editado } from '../data/editados'

const drivePreview = (id: string) => `https://drive.google.com/file/d/${id}/preview`
const baixarUrl = (e: Editado) => `/api/download-url?id=${e.id}&name=${encodeURIComponent((e.nome || e.nomeArquivo || 'video').replace(/[/\\]/g, '-') + '.mp4')}`

function fmtData(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function CardEd({ e, onOpen }: { e: Editado; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="group text-left rounded-2xl border border-border bg-surface p-3 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[0_10px_30px_-8px_rgba(0,0,0,0.6)] transition-all">
      <div className="relative aspect-video rounded-xl bg-surface-2 border border-border overflow-hidden mb-2 grid place-items-center text-muted">
        <svg width="26" height="26" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
        {e.thumb && <img src={e.thumb} alt="" loading="lazy" decoding="async" onError={(ev) => { (ev.currentTarget as HTMLImageElement).style.display = 'none' }} className="absolute inset-0 h-full w-full object-cover" />}
        <span className="absolute inset-0 grid place-items-center bg-black/0 group-hover:bg-black/25 transition-colors">
          <span className="h-9 w-9 rounded-full bg-black/0 group-hover:bg-black/55 backdrop-blur-sm grid place-items-center opacity-0 group-hover:opacity-100 transition-all">
            <svg width="15" height="15" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="white" /></svg>
          </span>
        </span>
        {e.postado_em && <span className="absolute top-1.5 right-1.5 text-[10px] font-bold text-emerald-300 bg-black/55 backdrop-blur-sm rounded-md px-1.5 py-0.5">{fmtData(e.postado_em)}</span>}
      </div>
      <div className="text-[13px] font-bold leading-snug line-clamp-2">{e.nome}</div>
      {e.descricao && <div className="text-[12px] text-muted leading-snug mt-1 line-clamp-2">{e.descricao}</div>}
    </button>
  )
}

export default function Editados({ modo }: { modo: 'postar' | 'postados' }) {
  const [itens, setItens] = useState<Editado[] | null>(null)
  const [erro, setErro] = useState('')
  const [aberto, setAberto] = useState<Editado | null>(null)
  const [sync, setSync] = useState<'idle' | 'indo' | 'feito'>('idle')
  const [syncMsg, setSyncMsg] = useState('')

  const recarregar = () => listarEditados().then(setItens).catch(() => setErro('Não consegui carregar'))
  useEffect(() => { recarregar() }, [])
  useEffect(() => { setAberto(null) }, [modo])

  const lista = (itens || []).filter((e) => e.postado === (modo === 'postados'))
  const videos = lista.filter((e) => e.secao !== 'corte')
  const cortes = lista.filter((e) => e.secao === 'corte')

  async function atualizar() {
    setSync('indo')
    const r = await sincronizarEditados()
    await recarregar()
    setSync('feito')
    setSyncMsg(!r ? 'Não consegui atualizar agora' : r.novos === 0 ? 'Já está atualizado — nenhum vídeo novo' : `${r.novos} vídeo${r.novos > 1 ? 's' : ''} novo${r.novos > 1 ? 's' : ''} identificado${r.novos > 1 ? 's' : ''}`)
    setTimeout(() => { setSync('idle'); setSyncMsg('') }, 6000)
  }

  async function togglePostado(e: Editado) {
    const novo = !e.postado
    setItens((xs) => (xs ? xs.map((x) => (x.id === e.id ? { ...x, postado: novo, postado_em: novo ? new Date().toISOString() : null } : x)) : xs))
    setAberto(null)
    await marcarPostado(e.id, novo).catch(() => {})
  }

  const grade = (arr: Editado[]) => <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">{arr.map((e) => <CardEd key={e.id} e={e} onOpen={() => setAberto(e)} />)}</div>

  return (
    <div className="relative z-10 px-4 sm:px-6 pb-24 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 pt-3 pb-3">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-ink-2">{modo === 'postados' ? 'Postados' : 'Para postar'}</h2>
        {itens && <span className="tnum text-[11px] font-bold text-brand-2 bg-brand/12 rounded-full px-2 py-0.5">{lista.length}</span>}
        {modo === 'postar' && (
          <button
            onClick={atualizar}
            disabled={sync === 'indo'}
            title="Procura vídeos novos na pasta e a IA identifica (~15–30s). Sozinho, atualiza de hora em hora."
            className={'ml-auto shrink-0 inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-lg px-2.5 py-1.5 border transition-colors disabled:opacity-60 ' + (sync === 'feito' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-surface-2 border-border text-brand-2 hover:border-brand/50')}
          >
            {sync === 'indo' ? <span className="h-3.5 w-3.5 rounded-full border-2 border-brand/30 border-t-brand animate-spin" /> : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" /></svg>}
            {sync === 'indo' ? 'Identificando… (~15–30s)' : 'Atualizar'}
          </button>
        )}
      </div>

      {syncMsg && <div className="text-[12px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2 mb-3">{syncMsg}</div>}
      {erro && <div className="text-[13px] text-red bg-red/10 border border-red/20 rounded-xl p-3">{erro}</div>}

      {!itens && !erro && <div className="grid place-items-center py-20"><div className="h-7 w-7 rounded-full border-[3px] border-border-strong border-t-brand animate-spin" /></div>}

      {itens && lista.length === 0 && (
        <div className="text-center text-muted py-16">{modo === 'postados' ? 'Nenhum vídeo postado ainda.' : 'Nenhum vídeo pra postar. Clique em "Atualizar" pra buscar os novos.'}</div>
      )}

      {itens && lista.length > 0 && (
        modo === 'postados' ? (
          grade(lista)
        ) : (
          <div className="flex flex-col gap-6">
            {videos.length > 0 && <div><div className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted mb-2">Vídeos</div>{grade(videos)}</div>}
            {cortes.length > 0 && <div><div className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted mb-2">Cortes</div>{grade(cortes)}</div>}
          </div>
        )
      )}

      {aberto && createPortal((
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4">
          <div className="fade-in absolute inset-0 bg-black/70" onClick={() => setAberto(null)} />
          <div className="sheet-up relative w-full max-w-2xl h-[92vh] sm:h-[86vh] flex flex-col bg-elev border border-border-strong rounded-2xl p-3 sm:p-4 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]">
            <div className="flex items-start gap-2 mb-3 shrink-0">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold leading-snug">{aberto.nome}</div>
                {aberto.descricao && <div className="text-[12px] text-muted leading-snug mt-0.5">{aberto.descricao}</div>}
              </div>
              <a href={baixarUrl(aberto)} className="shrink-0 text-[12px] font-semibold text-brand-2 bg-surface-2 border border-border rounded-lg px-3 py-1.5 hover:border-brand/50 transition-colors">Baixar</a>
              <button onClick={() => setAberto(null)} aria-label="Fechar" className="shrink-0 h-9 w-9 grid place-items-center rounded-xl bg-surface-2 border border-border text-muted hover:text-ink transition-colors"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
            </div>
            <div className="relative flex-1 min-h-0">
              <iframe key={aberto.id} src={drivePreview(aberto.id)} title={aberto.nome} allow="autoplay; fullscreen" allowFullScreen className="w-full h-full rounded-xl bg-black border-0" />
            </div>
            <div className="mt-3 shrink-0 flex items-center gap-2">
              <button onClick={() => togglePostado(aberto)} className={'inline-flex items-center gap-2 text-[13px] font-bold rounded-lg px-4 py-2 border transition-colors ' + (aberto.postado ? 'text-muted border-border hover:text-ink' : 'text-white bg-emerald-500 border-emerald-500 hover:bg-emerald-600')}>
                {!aberto.postado && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                {aberto.postado ? 'Desmarcar postado' : 'Marcar como postado'}
              </button>
              <a href={baixarUrl(aberto)} className="text-[13px] font-semibold text-brand-2 hover:text-brand px-2">Baixar pra postar</a>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  )
}
