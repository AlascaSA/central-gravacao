import { useEffect, useMemo, useRef, useState } from 'react'
import { store } from './data/store'
import type { Card, Copy, Fase, NovoCard } from './types'
import Header, { type Vista } from './components/Header'
import QuadroToolbar, { type FiltroCopy, type VistaSemana } from './components/QuadroToolbar'
import Board from './components/Board'
import Archive from './components/Archive'
import Catalogo from './components/Catalogo'
import Links from './components/Links'
import NewCardModal from './components/NewCardModal'
import UploadModal from './components/UploadModal'
import CardDetail from './components/CardDetail'
import { addWeeks, currentMonday, nextMonday } from './week'

export default function App() {
  const [cards, setCards] = useState<Card[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState<FiltroCopy>('Todas')
  const [vista, setVista] = useState<Vista>('quadro')
  const [modalOpen, setModalOpen] = useState(false)
  const [modalCopy, setModalCopy] = useState<Copy | undefined>(undefined)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [semMonday, setSemMonday] = useState(currentMonday())
  const [vistaSem, setVistaSem] = useState<VistaSemana>('semana')
  const [detailCard, setDetailCard] = useState<Card | null>(null)
  const sigRef = useRef('')
  const abriuLinkRef = useRef(false)
  // exclusões com "Desfazer": some da tela na hora, efetiva no banco depois de 5s
  const [pendingDel, setPendingDel] = useState<{ id: string; titulo: string }[]>([])
  const delTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  function recarregar() {
    store.listCards().then((cs) => {
      sigRef.current = cs.map((c) => c.id + c.fase + c.arquivado + c.atualizadoEm).join('|')
      setCards(cs)
    }).catch(() => {})
  }

  useEffect(() => {
    const assinatura = (cs: Card[]) => cs.map((c) => c.id + c.fase + c.arquivado + c.atualizadoEm).join('|')
    // só re-renderiza quando algo realmente mudou (não atrapalha um arraste em curso)
    const carregar = async () => {
      try {
        const cs = await store.listCards()
        const sig = assinatura(cs)
        if (sig !== sigRef.current) {
          sigRef.current = sig
          setCards(cs)
        }
      } catch {
        /* falha de rede momentânea: tenta de novo no próximo ciclo */
      }
    }
    store.listCards().then((cs) => {
      sigRef.current = assinatura(cs)
      setCards(cs)
      setCarregando(false)
    })
    // quadro ao vivo: realtime (instantâneo) + poll leve + refetch ao focar a aba
    let unsub = () => {}
    if (store.subscribe) unsub = store.subscribe(carregar)
    const iv = setInterval(() => {
      if (document.visibilityState === 'visible') carregar()
    }, 8000)
    const onVis = () => {
      if (document.visibilityState === 'visible') carregar()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      unsub()
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  // link direto pro card (?card=<id>) — abre o detalhe quando os cards carregam
  useEffect(() => {
    if (abriuLinkRef.current || cards.length === 0) return
    const id = new URLSearchParams(window.location.search).get('card')
    if (!id) { abriuLinkRef.current = true; return }
    const c = cards.find((x) => x.id === id)
    if (c) { setDetailCard(c); abriuLinkRef.current = true }
  }, [cards])

  const ativos = useMemo(() => cards.filter((c) => !c.arquivado && !pendingDel.some((p) => p.id === c.id)), [cards, pendingDel])
  const arquivados = useMemo(() => cards.filter((c) => c.arquivado), [cards])

  // filtra pela semana selecionada
  const daSemana = useMemo(() => {
    if (vistaSem === 'todas') return ativos
    if (vistaSem === 'sem') return ativos.filter((c) => !c.semana)
    return ativos.filter((c) => c.semana === semMonday)
  }, [ativos, vistaSem, semMonday])

  const counts = useMemo(() => {
    const r: Record<string, number> = { __total: daSemana.length }
    for (const c of daSemana) {
      if (c.copy) r[c.copy] = (r[c.copy] ?? 0) + 1
      if (c.semRoteiro) r['Sem roteiro'] = (r['Sem roteiro'] ?? 0) + 1
    }
    return r
  }, [daSemana])

  const ativosFiltrados = useMemo(
    () =>
      filtro === 'Todas'
        ? daSemana
        : filtro === 'Sem roteiro'
          ? daSemana.filter((c) => c.semRoteiro)
          : daSemana.filter((c) => c.copy === filtro),
    [daSemana, filtro],
  )

  const semanaParaNovos = vistaSem === 'semana' ? semMonday : nextMonday()

  async function handleMove(id: string, fase: Fase) {
    const antes = cards
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, fase } : c)))
    try {
      await store.moveCard(id, fase)
    } catch {
      setCards(antes)
    }
  }

  async function handleArchive(id: string) {
    const antes = cards
    const agora = new Date().toISOString()
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, arquivado: true, finalizadoEm: agora } : c)))
    try {
      await store.archiveCard(id)
    } catch {
      setCards(antes)
    }
  }

  async function handleCreate(novo: NovoCard) {
    const card = await store.createCard({ ...novo, semana: semanaParaNovos })
    setCards((cs) => [card, ...cs])
  }

  async function handlePush(id: string) {
    const card = cards.find((c) => c.id === id)
    const novaSemana = card?.semana ? addWeeks(card.semana, 1) : nextMonday()
    const antes = cards
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, semana: novaSemana } : c)))
    try {
      await store.moverSemana(id, novaSemana)
    } catch {
      setCards(antes)
    }
  }

  function handleDelete(id: string) {
    const card = cards.find((c) => c.id === id)
    if (!card) return
    setPendingDel((p) => [...p.filter((x) => x.id !== id), { id, titulo: card.titulo || 'Card' }])
    const t = setTimeout(() => commitDelete(id), 5000)
    delTimers.current.set(id, t)
  }
  function commitDelete(id: string) {
    const t = delTimers.current.get(id)
    if (t) clearTimeout(t)
    delTimers.current.delete(id)
    setPendingDel((p) => p.filter((x) => x.id !== id))
    store.deletarCard(id).catch(() => {})
  }
  function desfazerDelete(id: string) {
    const t = delTimers.current.get(id)
    if (t) clearTimeout(t)
    delTimers.current.delete(id)
    setPendingDel((p) => p.filter((x) => x.id !== id))
  }

  function abrirNovo(copy?: Copy) {
    setModalCopy(copy)
    setModalOpen(true)
  }

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <Header vista={vista} onVista={setVista} />

      {vista === 'quadro' && (
        <QuadroToolbar
          monday={semMonday}
          vistaSem={vistaSem}
          onChangeSemana={(m, v) => { setSemMonday(m); setVistaSem(v) }}
          filtro={filtro}
          onChangeFiltro={setFiltro}
          counts={counts}
          onSubir={() => setUploadOpen(true)}
          onNovo={() => abrirNovo(filtro === 'Todas' || filtro === 'Sem roteiro' ? undefined : filtro)}
        />
      )}

      {carregando ? (
        <div className="flex-1 grid place-items-center">
          <div className="h-7 w-7 rounded-full border-[3px] border-border-strong border-t-brand animate-spin" />
        </div>
      ) : vista === 'quadro' ? (
        <div className="flex-1 min-h-0">
          <Board cards={ativosFiltrados} onMove={handleMove} onArchive={handleArchive} onPushSemana={handlePush} onDelete={handleDelete} onOpen={setDetailCard} />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {vista === 'catalogo' ? <Catalogo /> : vista === 'links' ? <Links /> : <Archive cards={arquivados} />}
        </div>
      )}

      {vista === 'quadro' && (
        <div className="sm:hidden glass fixed bottom-0 left-0 right-0 z-30 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+14px)] border-t border-border/70">
          <div className="max-w-2xl mx-auto flex gap-2">
            <button
              onClick={() => setUploadOpen(true)}
              className="flex-[1.5] inline-flex items-center justify-center gap-2 h-[52px] rounded-2xl bg-brand text-white font-bold text-[15px] shadow-[0_10px_30px_-6px_rgba(20,168,245,0.5)] active:scale-[0.98] transition-transform"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M6 10l6-6 6 6" /><path d="M4 20h16" /></svg>
              Subir roteiros
            </button>
            <button
              onClick={() => abrirNovo(filtro === 'Todas' || filtro === 'Sem roteiro' ? undefined : filtro)}
              className="flex-1 h-[52px] rounded-2xl bg-surface-2 border border-border text-ink font-semibold text-[13px] active:scale-[0.98] hover:border-border-strong transition-all"
            >
              + Novo
            </button>
          </div>
        </div>
      )}

      {pendingDel.length > 0 && (
        <div role="status" className="fixed bottom-[calc(env(safe-area-inset-bottom)+84px)] sm:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 rounded-xl bg-elev border border-border-strong pl-4 pr-2 py-2 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.7)]">
          <span className="text-[13px] text-ink-2 truncate max-w-[210px]">“{pendingDel[pendingDel.length - 1].titulo}” apagado</span>
          <button onClick={() => desfazerDelete(pendingDel[pendingDel.length - 1].id)} className="text-[13px] font-bold text-brand-2 hover:text-brand rounded-lg px-2 py-1 hover:bg-surface-2 transition-colors">Desfazer</button>
        </div>
      )}

      <NewCardModal open={modalOpen} copyDefault={modalCopy} onClose={() => setModalOpen(false)} onCreate={handleCreate} />
      <UploadModal
        open={uploadOpen}
        copyDefault={filtro === 'Todas' || filtro === 'Sem roteiro' ? 'Andressa' : filtro}
        semana={semanaParaNovos}
        onClose={() => setUploadOpen(false)}
        onDone={recarregar}
      />
      <CardDetail card={detailCard} onClose={() => { setDetailCard(null); if (new URLSearchParams(window.location.search).get('card')) window.history.replaceState({}, '', window.location.pathname) }} />
    </div>
  )
}
