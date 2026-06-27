import { useEffect, useMemo, useRef, useState } from 'react'
import { store } from './data/store'
import type { Card, Copy, Fase, NovoCard } from './types'
import Header, { type Vista } from './components/Header'
import Filters, { type FiltroCopy } from './components/Filters'
import Board from './components/Board'
import Archive from './components/Archive'
import Catalogo from './components/Catalogo'
import Links from './components/Links'
import NewCardModal from './components/NewCardModal'
import UploadModal from './components/UploadModal'
import CardDetail from './components/CardDetail'
import WeekNav, { type VistaSemana } from './components/WeekNav'
import { addWeeks, currentMonday, nextMonday } from './week'

export default function App() {
  const [cards, setCards] = useState<Card[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState<FiltroCopy>('Todas')
  const [vista, setVista] = useState<Vista>('quadro')
  const [modalOpen, setModalOpen] = useState(false)
  const [modalCopy, setModalCopy] = useState<Copy>('Andressa')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [semMonday, setSemMonday] = useState(currentMonday())
  const [vistaSem, setVistaSem] = useState<VistaSemana>('semana')
  const [detailCard, setDetailCard] = useState<Card | null>(null)
  const sigRef = useRef('')

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

  const ativos = useMemo(() => cards.filter((c) => !c.arquivado), [cards])
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

  async function handleDelete(id: string) {
    const antes = cards
    setCards((cs) => cs.filter((c) => c.id !== id))
    try {
      await store.deletarCard(id)
    } catch {
      setCards(antes)
    }
  }

  function abrirNovo(copy: Copy) {
    setModalCopy(copy)
    setModalOpen(true)
  }

  return (
    <div className="min-h-dvh">
      <Header vista={vista} onVista={setVista} />

      {vista === 'quadro' && (
        <WeekNav monday={semMonday} vista={vistaSem} onChange={(m, v) => { setSemMonday(m); setVistaSem(v) }} />
      )}

      {vista === 'quadro' && <Filters value={filtro} onChange={setFiltro} counts={counts} />}

      {carregando ? (
        <div className="relative z-10 grid place-items-center py-24">
          <div className="h-7 w-7 rounded-full border-[3px] border-border-strong border-t-brand animate-spin" />
        </div>
      ) : vista === 'quadro' ? (
        <Board cards={ativosFiltrados} onMove={handleMove} onArchive={handleArchive} onPushSemana={handlePush} onDelete={handleDelete} onOpen={setDetailCard} />
      ) : vista === 'catalogo' ? (
        <Catalogo />
      ) : vista === 'links' ? (
        <Links />
      ) : (
        <Archive cards={arquivados} />
      )}

      {vista === 'quadro' && (
        <div className="glass fixed bottom-0 left-0 right-0 z-30 px-4 sm:px-6 pt-3 pb-[calc(env(safe-area-inset-bottom)+14px)] border-t border-border/70">
          <div className="max-w-2xl mx-auto flex gap-2">
            <button
              onClick={() => setUploadOpen(true)}
              className="flex-[1.5] inline-flex items-center justify-center gap-2 h-[52px] rounded-2xl bg-brand text-white font-bold text-[15px] shadow-[0_10px_30px_-6px_rgba(20,168,245,0.5)] active:scale-[0.98] transition-transform"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M6 10l6-6 6 6" /><path d="M4 20h16" /></svg>
              Subir roteiros
            </button>
            <button
              onClick={() => abrirNovo(filtro === 'Todas' || filtro === 'Sem roteiro' ? 'Andressa' : filtro)}
              className="flex-1 h-[52px] rounded-2xl bg-surface-2 border border-border text-ink font-semibold text-[13.5px] active:scale-[0.98] hover:border-border-strong transition-all"
            >
              + Novo
            </button>
          </div>
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
      <CardDetail card={detailCard} onClose={() => setDetailCard(null)} />
    </div>
  )
}
