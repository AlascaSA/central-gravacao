import { useEffect, useMemo, useRef, useState } from 'react'
import { store } from './data/store'
import type { Card, Categoria, Copy, Fase, NovoCard, Urgencia } from './types'
import Header, { type Vista } from './components/Header'
import QuadroToolbar, { type FiltroCopy, type VistaSemana } from './components/QuadroToolbar'
import Board from './components/Board'
import Archive from './components/Archive'
import Catalogo from './components/Catalogo'
import Links from './components/Links'
import Editados from './components/Editados'
import Virais from './components/Virais'
import Multiplicar from './components/Multiplicar'
import NewCardModal from './components/NewCardModal'
import UploadModal from './components/UploadModal'
import CardDetail from './components/CardDetail'
import { addWeeks, currentMonday, nextMonday } from './week'
import { gravarParams, lerParam } from './urlEstado'
import RevisaoIA from './components/RevisaoIA'
import { listarPropostas } from './data/revisao'
import TesteVolume from './components/TesteVolume'

export default function App() {
  const [cards, setCards] = useState<Card[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState<FiltroCopy>('Todas')
  const [filtroCat, setFiltroCat] = useState<Categoria | 'Todas'>('Todas')
  const [filtroUrg, setFiltroUrg] = useState<Urgencia | 'Todas'>('Todas')
  // a aba fica na URL (?v=): recarregar não volta pro Quadro e o link abre onde você estava
  const [vista, setVista] = useState<Vista>(() => {
    if (window.location.pathname.startsWith('/v/')) return 'videos'
    const v = lerParam('v')
    return v && (['quadro', 'arquivo', 'catalogo', 'links', 'videos', 'virais', 'multiplicar'] as const).includes(v as Vista) ? (v as Vista) : 'quadro'
  })
  function trocarVista(v: Vista) {
    setVista(v)
    // sair do catálogo limpa a pasta que estava aberta (senão voltaria numa pasta que não é da aba)
    gravarParams({ v: v === 'quadro' ? null : v, ...(v === 'catalogo' ? {} : { mes: null, dia: null }) })
  }
  const [modalOpen, setModalOpen] = useState(false)
  const [modalCopy, setModalCopy] = useState<Copy | undefined>(undefined)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [semMonday, setSemMonday] = useState(currentMonday())
  const [vistaSem, setVistaSem] = useState<VistaSemana>('semana')
  const [detailCard, setDetailCard] = useState<Card | null>(null)
  // quantas tarefas montadas automaticamente ainda esperam aprovação
  const [aRevisar, setARevisar] = useState(0)
  const [revisaoAberta, setRevisaoAberta] = useState(false)
  function contarRevisao() { listarPropostas().then((p) => setARevisar(p.length)).catch(() => {}) }
  useEffect(() => { contarRevisao() }, [])
  const [selMode, setSelMode] = useState(false)
  const sigRef = useRef('')
  const abriuLinkRef = useRef(false)
  const boardRef = useRef<HTMLDivElement>(null)
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

  // filtra pela semana selecionada, COM rollover: o não concluído de semanas passadas rola pra semana atual
  const daSemana = useMemo(() => {
    if (vistaSem === 'todas') return ativos
    if (vistaSem === 'sem') return ativos.filter((c) => !c.semana)
    const cur = currentMonday()
    const concluida = (c: Card) => c.fase === 'Finalizado' || c.fase === 'No tráfego'
    if (semMonday === cur) {
      // semana atual: o que é desta semana + o NÃO concluído que sobrou de semanas passadas (rolou pra cá)
      return ativos.filter((c) => c.semana === semMonday || (!!c.semana && c.semana < semMonday && !concluida(c)))
    }
    if (semMonday > cur) return ativos.filter((c) => c.semana === semMonday) // semana futura: só o planejado
    // semana passada: só o que ficou nela (concluído); o não concluído já rolou pra frente
    return ativos.filter((c) => c.semana === semMonday && concluida(c))
  }, [ativos, vistaSem, semMonday])

  // categoria + urgência aplicadas antes da copy, pra as contagens de copy refletirem esses filtros
  const contexto = useMemo(
    () =>
      daSemana
        .filter((c) => filtroCat === 'Todas' || c.categoria === filtroCat)
        .filter((c) => filtroUrg === 'Todas' || c.urgencia === filtroUrg),
    [daSemana, filtroCat, filtroUrg],
  )

  const counts = useMemo(() => {
    const r: Record<string, number> = { __total: contexto.length }
    for (const c of contexto) {
      if (c.copy) r[c.copy] = (r[c.copy] ?? 0) + 1
      if (c.semRoteiro) r['Sem roteiro'] = (r['Sem roteiro'] ?? 0) + 1
    }
    return r
  }, [contexto])

  const ativosFiltrados = useMemo(
    () =>
      filtro === 'Todas'
        ? contexto
        : filtro === 'Sem roteiro'
          ? contexto.filter((c) => c.semRoteiro)
          : contexto.filter((c) => c.copy === filtro),
    [contexto, filtro],
  )

  const semanaParaNovos = vistaSem === 'semana' ? semMonday : nextMonday()

  async function handleMove(id: string, fase: Fase) {
    const antes = cards
    const card = cards.find((c) => c.id === id)
    const cur = currentMonday()
    // ao concluir (Finalizado/No tráfego) um card que ROLOU de uma semana passada, ele passa a
    // viver na semana atual — senão sumiria da visão (o rollover só puxa o NÃO concluído).
    const concluida = fase === 'Finalizado' || fase === 'No tráfego'
    const novaSemana = concluida && card?.semana && card.semana < cur ? cur : null
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, fase, ...(novaSemana ? { semana: novaSemana } : {}) } : c)))
    try {
      await store.moveCard(id, fase)
      if (novaSemana) await store.moverSemana(id, novaSemana)
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
      <Header vista={vista} onVista={trocarVista} />

      {vista === 'quadro' && (
        <QuadroToolbar
          monday={semMonday}
          vistaSem={vistaSem}
          onChangeSemana={(m, v) => { setSemMonday(m); setVistaSem(v) }}
          filtro={filtro}
          onChangeFiltro={setFiltro}
          filtroCat={filtroCat}
          onChangeCat={setFiltroCat}
          filtroUrg={filtroUrg}
          onChangeUrg={setFiltroUrg}
          counts={counts}
          selMode={selMode}
          onToggleSel={() => setSelMode((v) => !v)}
          onSubir={() => setUploadOpen(true)}
          onNovo={() => abrirNovo(filtro === 'Todas' || filtro === 'Sem roteiro' ? undefined : filtro)}
        />
      )}

      {carregando ? (
        <div className="flex-1 grid place-items-center">
          <div className="h-7 w-7 rounded-full border-[3px] border-border-strong border-t-brand animate-spin" />
        </div>
      ) : lerParam('teste') === 'volume' ? (
        <div className="flex-1 min-h-0"><TesteVolume cards={ativosFiltrados} onOpen={setDetailCard} /></div>
      ) : vista === 'quadro' ? (
        <div className="flex-1 min-h-0">
          <Board cards={ativosFiltrados} selMode={selMode} scrollRef={boardRef} semanaVista={vistaSem === 'semana' ? semMonday : null} onMove={handleMove} onArchive={handleArchive} onPushSemana={handlePush} onDelete={handleDelete} onOpen={setDetailCard} />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {vista === 'catalogo' ? <Catalogo /> : vista === 'links' ? <Links /> : vista === 'videos' ? <Editados /> : vista === 'virais' ? <Virais /> : vista === 'multiplicar' ? <Multiplicar /> : <Archive cards={arquivados} onOpen={setDetailCard} />}
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

      {/* fila de revisão: fica no Catálogo, que é onde as tomadas vivem — no Quadro só polui */}
      {vista === 'catalogo' && aRevisar > 0 && (
        <button
          onClick={() => setRevisaoAberta(true)}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+84px)] sm:bottom-6 right-4 sm:right-6 z-40 inline-flex items-center gap-2 rounded-2xl bg-amber/12 border border-amber/40 text-amber pl-3 pr-3.5 py-2.5 backdrop-blur-sm shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)] hover:bg-amber/20 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
          <span className="text-[13px] font-bold">{aRevisar} para revisar</span>
        </button>
      )}
      {revisaoAberta && <RevisaoIA onFechar={() => setRevisaoAberta(false)} onMudou={() => { contarRevisao(); recarregar() }} />}

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
