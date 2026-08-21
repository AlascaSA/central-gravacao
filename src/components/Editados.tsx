import { useEffect, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { arquivarCardVinculado, buscarEditadoPorId, listarEditados, marcarPostado, marcarRevisado, marcarVariosRevisados, sincronizarEditados, urlStreamEditado, type Editado } from '../data/editados'

const driveView = (id: string) => `https://drive.google.com/file/d/${id}/view`
const baixarUrl = (e: Editado) => `/api/download-url?id=${e.id}&name=${encodeURIComponent((e.nome || e.nomeArquivo || 'video').replace(/[/\\]/g, '-') + '.mp4')}`

// O Drive manda a thumb pequena (=s220); pede uma maior pra encher o card vertical sem borrar.
function thumbGrande(u: string | null): string | null {
  if (!u) return null
  return u.replace(/=s\d+(-c)?$/, '=s640').replace(/=w\d+-h\d+(-[a-z]+)?$/, '=s640')
}

function fmtData(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

// nomes amigáveis — o displayName do Drive é técnico (gu.costa.mendes, jenny west...)
const AUTORES: Record<string, string> = {
  'gu.costa.mendes': 'Gustavo',
  'gabriel.holland': 'Gabriel',
  'jenny west': 'Wendy',
  contato: 'Contato',
}
function autorLabel(raw: string | null): string {
  if (!raw) return ''
  return AUTORES[raw.trim().toLowerCase()] || raw
}

// Player nativo: busca a URL assinada e toca com <video> HTML5 (controles nativos limpos, sem Drive).
function Player({ e }: { e: Editado }) {
  const [src, setSrc] = useState<string | null>(null)
  const [erro, setErro] = useState(false)
  useEffect(() => {
    let vivo = true
    setSrc(null)
    setErro(false)
    urlStreamEditado(e.id)
      .then((u) => { if (vivo) (u ? setSrc(u) : setErro(true)) })
      .catch(() => { if (vivo) setErro(true) })
    return () => { vivo = false }
  }, [e.id])

  if (erro)
    return (
      <div className="w-full h-full grid place-items-center rounded-xl bg-black text-center p-6">
        <div className="text-[13px] text-muted">
          Não consegui abrir o player aqui.
          <br />
          <a href={driveView(e.id)} target="_blank" rel="noreferrer" className="text-brand-2 hover:text-brand underline">Abrir no Drive</a>
        </div>
      </div>
    )
  if (!src)
    return (
      <div className="w-full h-full grid place-items-center rounded-xl bg-black">
        <div className="h-8 w-8 rounded-full border-[3px] border-white/20 border-t-white/80 animate-spin" />
      </div>
    )
  return <video key={e.id} src={src} poster={thumbGrande(e.thumb) || undefined} controls autoPlay playsInline className="w-full h-full rounded-xl bg-black object-contain" />
}

type Sub = 'revisao' | 'conteudo' | 'cortes' | 'postados'

function CardEd({ e, onOpen }: { e: Editado; onOpen: () => void }) {
  const thumb = thumbGrande(e.thumb)
  // copiar o link do vídeo sem precisar abrir o card
  const [copiado, setCopiado] = useState(false)
  async function copiarAqui(ev: MouseEvent) {
    ev.stopPropagation() // não abre o card
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/v/${e.id}`)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1600)
    } catch { /* clipboard bloqueado: ignora */ }
  }
  return (
    // div (e não button) porque tem um botão dentro; teclado continua funcionando via role/onKeyDown
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onOpen() } }}
      className="group text-left cursor-pointer rounded-2xl border border-border bg-surface p-2 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[0_10px_30px_-8px_rgba(0,0,0,0.6)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 transition-all">
      <div className="relative aspect-[9/16] rounded-xl bg-surface-2 border border-border overflow-hidden mb-2 grid place-items-center text-muted">
        <svg width="26" height="26" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
        {thumb && <img src={thumb} alt="" loading="lazy" decoding="async" onError={(ev) => { (ev.currentTarget as HTMLImageElement).style.display = 'none' }} className="absolute inset-0 h-full w-full object-cover" />}
        <span className="absolute inset-0 grid place-items-center bg-black/0 group-hover:bg-black/25 transition-colors">
          <span className="h-11 w-11 rounded-full bg-black/0 group-hover:bg-black/55 backdrop-blur-sm grid place-items-center opacity-0 group-hover:opacity-100 transition-all">
            <svg width="17" height="17" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="white" /></svg>
          </span>
        </span>
        {!e.revisado && !e.postado && <span className="absolute top-1.5 left-1.5 text-[10px] font-bold text-black bg-amber-400 rounded-md px-1.5 py-0.5 shadow-[0_2px_6px_rgba(0,0,0,0.35)]">Em revisão</span>}
        {e.postado_em && <span className="absolute top-1.5 right-1.5 text-[10px] font-bold text-emerald-300 bg-black/60 backdrop-blur-sm rounded-md px-1.5 py-0.5">{fmtData(e.postado_em)}</span>}
        {/* copiar link — fica no canto de baixo pra não brigar com os selos de cima */}
        <button
          onClick={copiarAqui}
          title="Copiar link do vídeo"
          aria-label="Copiar link do vídeo"
          className={
            'tap absolute bottom-1.5 right-1.5 h-7 px-2 inline-flex items-center gap-1 rounded-lg text-[10.5px] font-bold backdrop-blur-sm border transition-colors ' +
            (copiado ? 'bg-emerald-500/90 border-emerald-400 text-white' : 'bg-black/55 border-white/15 text-white/85 hover:bg-black/75 hover:text-white')
          }
        >
          {copiado ? (
            <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>copiado</>
          ) : (
            <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>link</>
          )}
        </button>
      </div>
      <div className="px-0.5">
        <div className="text-[12.5px] font-bold leading-snug line-clamp-2">{e.nome}</div>
        {e.descricao && <div className="text-[11.5px] text-muted leading-snug mt-0.5 line-clamp-2">{e.descricao}</div>}
        {e.autorNome && (
          <div className="flex items-center gap-1.5 mt-1.5">
            {e.autorFoto ? (
              <img src={e.autorFoto} alt="" referrerPolicy="no-referrer" onError={(ev) => { (ev.currentTarget as HTMLImageElement).style.display = 'none' }} className="h-4 w-4 rounded-full object-cover shrink-0" />
            ) : (
              <span className="h-4 w-4 rounded-full bg-surface-2 grid place-items-center text-[8px] font-bold text-muted shrink-0">{autorLabel(e.autorNome).slice(0, 1).toUpperCase()}</span>
            )}
            <span className="text-[10.5px] text-muted font-medium truncate">{autorLabel(e.autorNome)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Editados() {
  const [itens, setItens] = useState<Editado[] | null>(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [sub, setSub] = useState<Sub>('revisao')
  const [aberto, setAberto] = useState<Editado | null>(null)
  const [sync, setSync] = useState<'idle' | 'indo' | 'feito'>('idle')
  const [syncMsg, setSyncMsg] = useState('')
  const [syncPct, setSyncPct] = useState(0)
  const [syncSeg, setSyncSeg] = useState(0)
  const [copiado, setCopiado] = useState(false)
  const [pend, setPend] = useState<string | null>(null)
  const [confirmandoDl, setConfirmandoDl] = useState(false)

  const recarregar = () => listarEditados().then(setItens).catch(() => setErro('Não consegui carregar'))
  // Ao abrir a aba: mostra o que já tem e, em segundo plano, sincroniza com o Drive e recarrega.
  // Sem isso a lista fica com o estado da última rodada do cron (até 20 min atrás) e o que foi
  // apagado/substituído no Drive continua aparecendo aqui.
  useEffect(() => {
    recarregar()
    sincronizarEditados().then((r) => { if (r && (r.novos > 0 || r.removidos)) recarregar() }).catch(() => {})
  }, [])
  useEffect(() => { setAberto(null) }, [sub])
  useEffect(() => { setConfirmandoDl(false) }, [aberto?.id])

  // link próprio /v/<id>: abre o vídeo direto no player assim que os itens carregam
  useEffect(() => {
    const m = window.location.pathname.match(/^\/v\/([^/?#]+)/)
    if (m) setPend(decodeURIComponent(m[1]))
  }, [])
  useEffect(() => {
    if (!pend) return
    // busca por id (independe de time): o permalink abre o vídeo mesmo fora da lista do time atual
    const it = (itens || []).find((x) => x.id === pend)
    if (it) { setAberto(it); setPend(null); return }
    buscarEditadoPorId(pend).then((e) => { if (e) setAberto(e) }).finally(() => setPend(null))
  }, [pend, itens])

  function fechar() {
    setAberto(null)
    if (window.location.pathname.startsWith('/v/')) window.history.replaceState({}, '', '/')
  }
  function avisoErro(m: string) {
    setAviso(m)
    setTimeout(() => setAviso(''), 4500)
  }
  async function copiarLink(id: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/v/${id}`)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      avisoErro('Não consegui copiar o link')
    }
  }

  const all = itens || []
  const emRevisao = all.filter((e) => !e.revisado && !e.postado)
  const conteudo = all.filter((e) => e.revisado && !e.postado && e.secao !== 'corte')
  const cortes = all.filter((e) => e.revisado && !e.postado && e.secao === 'corte')
  const postados = all.filter((e) => e.postado)
  const porSub: Record<Sub, Editado[]> = { revisao: emRevisao, conteudo, cortes, postados }
  const lista = porSub[sub]

  const TABS: { k: Sub; label: string }[] = [
    { k: 'revisao', label: 'Em revisão' },
    { k: 'conteudo', label: 'Conteúdo' },
    { k: 'cortes', label: 'Cortes' },
    { k: 'postados', label: 'Postados' },
  ]

  const vazioMsg: Record<Sub, string> = {
    revisao: 'Nada em revisão. Os vídeos novos caem aqui pra checagem.',
    conteudo: 'Nenhum conteúdo pra postar ainda.',
    cortes: 'Nenhum corte pra postar ainda.',
    postados: 'Nada postado ainda.',
  }

  async function atualizar() {
    setSync('indo')
    const r = await sincronizarEditados()
    await recarregar()
    setSyncPct(100)
    setSync('feito')
    // a mensagem conta TAMBÉM o que saiu (apagado/substituído no Drive) — senão parece que não reconheceu
    const partes: string[] = []
    if (r && r.novos > 0) partes.push(`${r.novos} vídeo${r.novos > 1 ? 's' : ''} novo${r.novos > 1 ? 's' : ''} — em "Em revisão"`)
    if (r && r.removidos) partes.push(`${r.removidos} sa${r.removidos > 1 ? 'íram' : 'iu'} (apagado${r.removidos > 1 ? 's' : ''} ou substituído${r.removidos > 1 ? 's' : ''} no Drive)`)
    setSyncMsg(!r ? 'Não consegui atualizar agora' : partes.length ? partes.join(' · ') : 'Já está atualizado')
    if (r && r.novos > 0) setSub('revisao')
    setTimeout(() => { setSync('idle'); setSyncMsg(''); setSyncPct(0); setSyncSeg(0) }, 6000)
  }

  // enquanto sincroniza: a barra avança sozinha rumo a ~92% (o worker é uma chamada só) e o contador de segundos corre.
  useEffect(() => {
    if (sync !== 'indo') return
    setSyncPct(6)
    setSyncSeg(0)
    const t0 = Date.now()
    const iv = setInterval(() => {
      const seg = (Date.now() - t0) / 1000
      setSyncSeg(Math.floor(seg))
      setSyncPct(Math.min(92, Math.round(92 * (1 - Math.exp(-seg / 9))))) // ~92% por volta dos 20s
    }, 250)
    return () => clearInterval(iv)
  }, [sync])

  async function revisar(e: Editado) {
    setItens((xs) => (xs ? xs.map((x) => (x.id === e.id ? { ...x, revisado: true } : x)) : xs))
    setAberto(null)
    const ok = await marcarRevisado(e.id, true)
    if (!ok) {
      setItens((xs) => (xs ? xs.map((x) => (x.id === e.id ? { ...x, revisado: false } : x)) : xs))
      avisoErro('Não consegui salvar a revisão. Confira se o SQL da coluna já rodou e tente de novo.')
      return
    }
    if (e.cardId) arquivarCardVinculado(e.cardId).catch(() => {}) // aprovado → arquiva o card vinculado
  }

  async function revisarTodos() {
    if (emRevisao.length === 0) return
    if (!window.confirm(`Marcar os ${emRevisao.length} vídeos em revisão como revisados? Eles vão pra Conteúdo/Cortes.`)) return
    const lote = emRevisao
    const ids = lote.map((e) => e.id)
    setItens((xs) => (xs ? xs.map((x) => (ids.includes(x.id) ? { ...x, revisado: true } : x)) : xs))
    const ok = await marcarVariosRevisados(ids)
    if (!ok) {
      setItens((xs) => (xs ? xs.map((x) => (ids.includes(x.id) ? { ...x, revisado: false } : x)) : xs))
      avisoErro('Não consegui salvar a revisão. Confira se o SQL da coluna já rodou e tente de novo.')
      return
    }
    for (const e of lote) if (e.cardId) arquivarCardVinculado(e.cardId).catch(() => {})
  }

  async function togglePostado(e: Editado) {
    const novo = !e.postado
    const emAntes = e.postado_em
    setItens((xs) => (xs ? xs.map((x) => (x.id === e.id ? { ...x, postado: novo, postado_em: novo ? new Date().toISOString() : null } : x)) : xs))
    setAberto(null)
    const ok = await marcarPostado(e.id, novo)
    if (!ok) {
      setItens((xs) => (xs ? xs.map((x) => (x.id === e.id ? { ...x, postado: e.postado, postado_em: emAntes } : x)) : xs))
      avisoErro('Não consegui salvar. Tente de novo.')
    }
  }

  // ABRIR NO DRIVE = POSTAR. No celular quem baixa de verdade é o app do Drive (download nativo,
  // em segundo plano, com "Salvar em Fotos" dele). Então abrir o vídeo lá é a intenção de postar:
  // marcamos aqui e o card sai da fila sozinho. O link abre normalmente, na hora do toque.
  async function abrirNoDriveEPostar(e: Editado) {
    if (e.postado) return
    setItens((xs) => (xs ? xs.map((x) => (x.id === e.id ? { ...x, revisado: true, postado: true, postado_em: new Date().toISOString() } : x)) : xs))
    setAberto(null)
    const ok = await marcarPostado(e.id, true)
    if (!ok) {
      setItens((xs) => (xs ? xs.map((x) => (x.id === e.id ? { ...x, revisado: e.revisado, postado: e.postado, postado_em: e.postado_em } : x)) : xs))
      avisoErro('Abriu no Drive, mas não consegui marcar como postado. Marque manualmente.')
      return
    }
    if (!e.revisado) await marcarRevisado(e.id, true).catch(() => false)
    if (e.cardId) await arquivarCardVinculado(e.cardId).catch(() => {})
  }

  // O download sai por um iframe escondido, não por um <a> clicado na própria aba. O <a> apontava pro
  // /api/download-url, que redireciona pra outra origem: o navegador tratava como NAVEGAÇÃO DE TOPO e
  // cancelava as requisições em voo — daí o "não consegui marcar como postado" logo depois de baixar.
  // O iframe é navegação de subframe: o arquivo vem com Content-Disposition: attachment, então cai no
  // gerenciador de downloads do mesmo jeito, e o que a página está salvando no banco não é interrompido.
  function dispararDownload(url: string) {
    const f = document.createElement('iframe')
    f.style.display = 'none'
    f.src = url
    document.body.appendChild(f)
    setTimeout(() => f.remove(), 60000)
  }
  // Baixar = intenção de postar: baixa o vídeo e já marca como Postado (+ arquiva o card vinculado).
  async function baixarEPostar(e: Editado) {
    dispararDownload(baixarUrl(e))
    setConfirmandoDl(false)
    setItens((xs) => (xs ? xs.map((x) => (x.id === e.id ? { ...x, revisado: true, postado: true, postado_em: new Date().toISOString() } : x)) : xs))
    setAberto(null)
    const ok = await marcarPostado(e.id, true)
    if (!ok) {
      setItens((xs) => (xs ? xs.map((x) => (x.id === e.id ? { ...x, revisado: e.revisado, postado: e.postado, postado_em: e.postado_em } : x)) : xs))
      avisoErro('Baixou, mas não consegui marcar como postado. Marque manualmente.')
      return
    }
    // esperados (e não solta-e-esquece): eram cancelados junto com o resto quando o download navegava a aba
    if (!e.revisado) await marcarRevisado(e.id, true).catch(() => false)
    if (e.cardId) await arquivarCardVinculado(e.cardId).catch(() => {})
  }

  const grade = (arr: Editado[]) => <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">{arr.map((e) => <CardEd key={e.id} e={e} onOpen={() => setAberto(e)} />)}</div>

  return (
    <div className="relative z-10 px-4 sm:px-6 pb-24 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 pt-3 pb-3 flex-wrap">
        {/* 2x2 no celular: em uma linha só, as 4 abas cabem em 375px cortando "Em revisão" no meio. */}
        <div className="faixa-toque grid grid-cols-2 sm:flex sm:flex-nowrap w-full sm:w-auto bg-surface/80 border border-border rounded-xl p-1 text-[12px] sm:text-[13px] font-semibold gap-0.5">
          {TABS.map((t) => {
            const amarelo = t.k === 'revisao'
            const ativo = sub === t.k
            return (
              <button
                key={t.k}
                onClick={() => setSub(t.k)}
                className={'w-full sm:w-auto whitespace-nowrap inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-lg transition-all duration-200 ' + (ativo ? (amarelo ? 'bg-amber-400 text-black shadow-[0_4px_14px_rgba(251,191,36,0.45)]' : 'bg-brand text-white shadow-[0_4px_14px_rgba(20,168,245,0.4)]') : (amarelo ? 'text-amber-400 hover:text-amber-300' : 'text-muted hover:text-ink'))}
              >
                {t.label}
                {porSub[t.k].length > 0 && <span className={'tnum text-[10.5px] font-bold rounded-full px-1.5 py-px ' + (ativo ? (amarelo ? 'bg-black/25 text-black' : 'bg-white/25 text-white') : (amarelo ? 'bg-amber-400/15 text-amber-300' : 'bg-brand/12 text-brand-2'))}>{porSub[t.k].length}</span>}
              </button>
            )
          })}
        </div>

        {sub === 'revisao' && emRevisao.length > 0 && (
          <button onClick={revisarTodos} className="shrink-0 text-[12px] font-semibold rounded-lg px-2.5 py-1.5 border bg-surface-2 border-border text-ink-2 hover:border-brand/50 transition-colors">
            Marcar todos revisados
          </button>
        )}

        <button
          onClick={atualizar}
          disabled={sync === 'indo'}
          title="Procura vídeos novos na pasta e a IA identifica (~15–30s). Sozinho, atualiza de hora em hora."
          className={'ml-auto shrink-0 inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-lg px-2.5 py-1.5 border transition-colors disabled:opacity-60 ' + (sync === 'feito' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-surface-2 border-border text-brand-2 hover:border-brand/50')}
        >
          {sync === 'indo' ? <span className="h-3.5 w-3.5 rounded-full border-2 border-brand/30 border-t-brand animate-spin" /> : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" /></svg>}
          {sync === 'indo' ? 'Identificando… (~15–30s)' : 'Atualizar'}
        </button>
      </div>

      {sync === 'indo' && (
        <div className="mb-3 rounded-xl border border-brand/20 bg-brand/[0.06] px-3 py-2.5">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[12px] font-semibold text-brand-2 truncate">{syncSeg < 5 ? 'Varrendo a pasta do Drive…' : syncSeg < 14 ? 'IA nomeando os vídeos novos…' : 'Quase lá — finalizando…'}</span>
            <span className="tnum shrink-0 text-[12px] font-semibold text-muted">{syncSeg}s · {syncPct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-2 transition-[width] duration-300 ease-out" style={{ width: syncPct + '%' }} />
          </div>
        </div>
      )}

      {/* falha em verde de sucesso já enganou: quem lê rápido acha que atualizou */}
      {syncMsg && <div className={'text-[12px] font-semibold rounded-xl px-3 py-2 mb-3 border ' + (/^não consegui/i.test(syncMsg) ? 'text-red bg-red/10 border-red/25' : 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20')}>{syncMsg}</div>}
      {aviso && <div className="text-[12px] font-semibold text-red bg-red/10 border border-red/20 rounded-xl px-3 py-2 mb-3">{aviso}</div>}
      {erro && <div className="text-[13px] text-red bg-red/10 border border-red/20 rounded-xl p-3">{erro}</div>}

      {!itens && !erro && <div className="grid place-items-center py-20"><div className="h-7 w-7 rounded-full border-[3px] border-border-strong border-t-brand animate-spin" /></div>}

      {itens && lista.length === 0 && <div className="text-center text-muted py-16">{vazioMsg[sub]}</div>}

      {itens && lista.length > 0 && grade(lista)}

      {aberto && createPortal((
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4">
          <div className="fade-in absolute inset-0 bg-black/70" onClick={fechar} />
          <div className="sheet-up relative w-full max-w-[420px] h-[calc(var(--vh-real,100vh)*0.92)] sm:h-[88vh] flex flex-col bg-elev border border-border-strong rounded-2xl p-3 sm:p-4 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]">
            <div className="flex items-start gap-2 mb-3 shrink-0">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold leading-snug">{aberto.nome}</div>
                {aberto.descricao && <div className="text-[12px] text-muted leading-snug mt-0.5">{aberto.descricao}</div>}
                {aberto.autorNome && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {aberto.autorFoto && <img src={aberto.autorFoto} alt="" referrerPolicy="no-referrer" onError={(ev) => { (ev.currentTarget as HTMLImageElement).style.display = 'none' }} className="h-[18px] w-[18px] rounded-full object-cover" />}
                    <span className="text-[11px] text-muted">Subido por <span className="text-ink-2 font-semibold">{autorLabel(aberto.autorNome)}</span></span>
                  </div>
                )}
                {aberto.cardTitulo && (
                  <div className="text-[11px] text-muted mt-1">
                    {!aberto.revisado && !aberto.postado ? 'Ao aprovar, arquiva o card: ' : 'Card: '}
                    <span className="text-ink-2 font-semibold">{aberto.cardTitulo}</span>
                  </div>
                )}
              </div>
              {/* É por aqui que ele abre o vídeo pra baixar no app do Drive — então este toque também posta. */}
              <a
                href={driveView(aberto.id)}
                target="_blank"
                rel="noreferrer"
                onClick={() => abrirNoDriveEPostar(aberto)}
                title={aberto.postado ? 'Abrir no Drive' : 'Abrir no Drive e marcar como postado'}
                aria-label={aberto.postado ? 'Abrir no Drive' : 'Abrir no Drive e marcar como postado'}
                className={'shrink-0 h-9 w-9 grid place-items-center rounded-xl border transition-colors ' + (aberto.postado ? 'bg-surface-2 border-border text-muted hover:text-ink' : 'bg-emerald-500/12 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/20')}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
              </a>
              <button onClick={fechar} aria-label="Fechar" className="shrink-0 h-9 w-9 grid place-items-center rounded-xl bg-surface-2 border border-border text-muted hover:text-ink transition-colors"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
            </div>
            <div className="relative flex-1 min-h-0">
              <Player e={aberto} />
            </div>
            {/* rodapé com os botões: respeita a faixa do indicador de início do iPhone */}
            <div className="mt-3 shrink-0 flex items-center gap-1.5 pb-[env(safe-area-inset-bottom)]">
              {confirmandoDl ? (
                <>
                  <span className="text-[12px] text-ink-2 flex-1 leading-snug">Ao baixar, esse conteúdo vai pra <b className="text-emerald-300 font-bold">Postados</b>.</span>
                  <button onClick={() => setConfirmandoDl(false)} className="shrink-0 text-[13px] font-semibold text-muted hover:text-ink px-3 py-2">Cancelar</button>
                  <button onClick={() => baixarEPostar(aberto)} className="shrink-0 inline-flex items-center gap-1.5 text-[13px] font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-3.5 py-2">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0l4-4m-4 4l-4-4M4 21h16" /></svg>
                    Baixar e postar
                  </button>
                </>
              ) : (
                <>
                  {aberto.revisado || aberto.postado ? (
                    <button onClick={() => togglePostado(aberto)} className={'inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-bold rounded-lg px-3.5 py-2 border transition-colors ' + (aberto.postado ? 'text-muted border-border hover:text-ink' : 'text-white bg-emerald-500 border-emerald-500 hover:bg-emerald-600')}>
                      {!aberto.postado && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                      {aberto.postado ? 'Desmarcar' : 'Marcar postado'}
                    </button>
                  ) : (
                    <button onClick={() => revisar(aberto)} className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-bold rounded-lg px-3.5 py-2 border text-white bg-brand border-brand hover:bg-brand/85 transition-colors">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                      Marcar revisado
                    </button>
                  )}
                  <div className="ml-auto flex items-center gap-0.5">
                    <button onClick={() => copiarLink(aberto.id)} title={copiado ? 'Link copiado' : 'Copiar link'} aria-label="Copiar link" className={'shrink-0 h-9 w-9 grid place-items-center rounded-lg transition-colors ' + (copiado ? 'text-emerald-400' : 'text-brand-2 hover:text-brand hover:bg-surface-2')}>
                      {copiado ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>}
                    </button>
                    <a href={baixarUrl(aberto)} onClick={(ev) => { if (!aberto.postado) { ev.preventDefault(); setConfirmandoDl(true) } }} title="Baixar pro app Arquivos" className="shrink-0 text-[13px] font-semibold text-brand-2 hover:text-brand px-2 inline-flex items-center gap-1.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0l4-4m-4 4l-4-4M4 21h16" /></svg>
                      Baixar
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  )
}
