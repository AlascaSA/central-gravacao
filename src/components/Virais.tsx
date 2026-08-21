import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { lerSync, listarPostsIG, marcarAnuncio, pedirAtualizacao, type EstadoSync, type PostIG } from '../data/ig'
import ViraisDiagnostico from './ViraisDiagnostico'
import { analisar, corTema, dataCurta, fmt, mediana, pct, SEM_TEMA, type Analisado } from '../data/viraisUtil'
import { arquivarCardVinculado, listarEditados, marcarPostado, marcarRevisado, type Editado } from '../data/editados'
import { store } from '../data/store'
import { currentMonday } from '../week'
import { getTeamNome } from '../data/team'

const PERIODOS = [
  { id: '90', label: '90 dias', dias: 90 },
  { id: '365', label: '12 meses', dias: 365 },
  { id: 'tudo', label: 'Tudo', dias: 99999 },
] as const
type PeriodoId = (typeof PERIODOS)[number]['id']

const ORDENS = [
  { id: 'views', label: 'Mais vistos' },
  { id: 'multiplo', label: 'Fora da curva' },
  { id: 'engajamento', label: 'Mais engajados' },
  { id: 'recentes', label: 'Recentes' },
] as const
type OrdemId = (typeof ORDENS)[number]['id']

/* ------------------------------------------------------------------ capa */

function Capa({ p, className = '', mini = false }: { p: PostIG; className?: string; mini?: boolean }) {
  const [caiu, setCaiu] = useState(false)
  // A CDN do Instagram assina a URL da capa e ela expira em poucos dias:
  // quando cair, o card continua legível com a cor do assunto e a legenda.
  // Em miniatura não cabe texto — fica só o bloco de cor do assunto.
  if (!p.thumb || caiu)
    return (
      <div
        className={'grid place-items-center p-2 text-center overflow-hidden ' + className}
        style={{ background: `linear-gradient(160deg, ${corTema(p.tema)}55, #0a0c11 75%)` }}
      >
        {!mini && <span className="text-[11px] leading-snug text-ink-2/80 line-clamp-4">{p.legenda.slice(0, 90) || 'sem legenda'}</span>}
      </div>
    )
  return (
    <img
      src={p.thumb}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setCaiu(true)}
      className={'object-cover ' + className}
    />
  )
}

/* ------------------------------------------------------------------ tela */

export default function Virais() {
  const [posts, setPosts] = useState<Analisado[]>([])
  const [editados, setEditados] = useState<Editado[]>([])
  const [carregando, setCarregando] = useState(true)
  const [periodo, setPeriodo] = useState<PeriodoId>('365')
  const [tema, setTema] = useState<string | null>(null)
  const [ordem, setOrdem] = useState<OrdemId>('views')
  const [soOrganico, setSoOrganico] = useState(false)
  const [aberto, setAberto] = useState<Analisado | null>(null)
  const [painelBaixa, setPainelBaixa] = useState(false)
  const [visao, setVisao] = useState<'ranking' | 'diagnostico'>('ranking')
  const [sync, setSync] = useState<EstadoSync | null>(null)
  const [pedindo, setPedindo] = useState(false)

  useEffect(() => {
    let vivo = true
    Promise.all([listarPostsIG(), listarEditados()])
      .then(([todos, eds]) => {
        if (!vivo) return
        // post antigo o Instagram não reporta mais visualização: entraria como zero e
        // puxaria a mediana do assunto pra baixo. Fora da conta.
        setPosts(analisar(todos.filter((p) => p.views > 0)))
        setEditados(eds)
      })
      .finally(() => vivo && setCarregando(false))
    lerSync().then((e) => vivo && setSync(e))
    return () => {
      vivo = false
    }
  }, [])

  // enquanto a coleta roda na máquina da produção, acompanha de longe
  useEffect(() => {
    if (sync?.status !== 'pedido' && sync?.status !== 'rodando') return
    const t = setInterval(() => {
      lerSync().then((e) => {
        setSync(e)
        if (e && e.status === 'ocioso') location.reload()   // dados novos: recarrega já com eles
      })
    }, 20_000)
    return () => clearInterval(t)
  }, [sync?.status])

  async function atualizar() {
    if (pedindo || sync?.status === 'pedido' || sync?.status === 'rodando') return
    setPedindo(true)
    const ok = await pedirAtualizacao()
    if (ok) setSync((s) => ({ ...(s as EstadoSync), status: 'pedido', mensagem: 'na fila', pedidoEm: new Date().toISOString() }))
    setPedindo(false)
  }

  const noPeriodo = useMemo(() => {
    const dias = PERIODOS.find((x) => x.id === periodo)!.dias
    const corte = Date.now() - dias * 86400_000
    return posts.filter((p) => new Date(p.postadoEm).getTime() >= corte)
  }, [posts, periodo])

  const temas = useMemo(() => {
    const m = new Map<string, Analisado[]>()
    noPeriodo.forEach((p) => {
      const k = p.tema || SEM_TEMA
      m.set(k, [...(m.get(k) || []), p])
    })
    return [...m.entries()]
      .map(([nome, itens]) => ({
        nome,
        n: itens.length,
        mediana: mediana(itens.map((x) => x.views)),
        topo: Math.max(...itens.map((x) => x.views)),
        total: itens.reduce((s, x) => s + x.views, 0),
      }))
      .sort((a, b) => b.mediana - a.mediana)
  }, [noPeriodo])

  const lista = useMemo(() => {
    let l = noPeriodo
    if (tema) l = l.filter((p) => (p.tema || SEM_TEMA) === tema)
    if (soOrganico) l = l.filter((p) => !p.impulsionado)
    const cmp: Record<OrdemId, (a: Analisado, b: Analisado) => number> = {
      views: (a, b) => b.views - a.views,
      multiplo: (a, b) => b.multiplo - a.multiplo,
      engajamento: (a, b) => b.engajamento - a.engajamento,
      recentes: (a, b) => +new Date(b.postadoEm) - +new Date(a.postadoEm),
    }
    return [...l].sort(cmp[ordem])
  }, [noPeriodo, tema, soOrganico, ordem])

  // Conciliação: o vídeo está no ar mas a Central ainda o trata como não postado.
  const semBaixa = useMemo(() => {
    const porDrive = new Map<string, Analisado>()
    posts.forEach((p) => p.editadoDriveId && porDrive.set(p.editadoDriveId, p))
    return editados
      .filter((e) => !e.postado && porDrive.has(e.id))
      .map((e) => ({ editado: e, post: porDrive.get(e.id)! }))
      .sort((a, b) => +new Date(b.post.postadoEm) - +new Date(a.post.postadoEm))
  }, [posts, editados])

  const medGeral = useMemo(() => mediana(noPeriodo.map((p) => p.views)), [noPeriodo])
  const melhor = noPeriodo.length ? Math.max(...noPeriodo.map((p) => p.views)) : 0
  const atualizado = posts.reduce<string | null>((a, p) => (p.atualizadoEm && (!a || p.atualizadoEm > a) ? p.atualizadoEm : a), null)

  async function darBaixa(e: Editado, quando: string) {
    setEditados((l) => l.map((x) => (x.id === e.id ? { ...x, postado: true } : x)))
    const ok = await marcarPostado(e.id, true)
    if (!ok) {
      setEditados((l) => l.map((x) => (x.id === e.id ? { ...x, postado: false } : x)))
      return
    }
    if (!e.revisado) await marcarRevisado(e.id, true)
    if (e.cardId) await arquivarCardVinculado(e.cardId)
    void quando
  }

  if (carregando)
    return (
      <div className="grid place-items-center py-24">
        <div className="h-8 w-8 rounded-full border-[3px] border-white/15 border-t-brand animate-spin" />
      </div>
    )

  if (!posts.length)
    return (
      <div className="max-w-xl mx-auto text-center py-24 px-6">
        <h2 className="text-lg font-bold text-ink">Sem dados do Instagram ainda</h2>
        <p className="mt-2 text-[13px] text-muted leading-relaxed">
          Rode o coletor (<code className="text-ink-2">viralizador/perfil/coletar.py</code> e depois{' '}
          <code className="text-ink-2">subir.py</code>) pra popular a tabela <code className="text-ink-2">ig_posts</code>.
        </p>
      </div>
    )

  return (
    <div className="px-4 sm:px-6 py-5 pb-24 max-w-[1500px] mx-auto">
      {/* cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[22px] sm:text-[26px] font-bold tracking-[-0.02em] text-ink">O que viralizou</h2>
          <p className="mt-1 text-[12.5px] text-muted">
            Instagram do {getTeamNome()} · {fmt(posts.length)} vídeos com medição
            {atualizado && <> · dados de {dataCurta(atualizado)}</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BotaoAtualizar sync={sync} pedindo={pedindo} onPedir={atualizar} />
        <div className="flex bg-surface/80 border border-border rounded-xl p-1 text-[12.5px] font-semibold">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriodo(p.id)}
              className={
                'px-3 py-1.5 rounded-lg transition-all duration-200 ' +
                (periodo === p.id ? 'bg-brand text-white shadow-[0_4px_14px_rgba(20,168,245,0.35)]' : 'text-muted hover:text-ink')
              }
            >
              {p.label}
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* ranking x diagnóstico */}
      <div className="mt-4 flex gap-1 border-b border-border">
        {([['ranking', 'Ranking'], ['diagnostico', 'Diagnóstico']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setVisao(id)}
            className={
              'px-3.5 py-2 text-[13px] font-semibold border-b-2 -mb-px transition-colors ' +
              (visao === id ? 'border-brand text-brand-2' : 'border-transparent text-muted hover:text-ink')
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* alerta de conciliação */}
      {semBaixa.length > 0 && (
        <div className="mt-5 rounded-2xl border border-amber/40 bg-amber/8 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <span className="mt-0.5 h-2.5 w-2.5 rounded-full bg-amber shrink-0 shadow-[0_0_12px_rgba(255,182,72,0.8)]" />
              <p className="text-[13.5px] text-ink-2 leading-relaxed">
                <strong className="text-ink">
                  {semBaixa.length === 1 ? 'Um vídeo já está no ar' : `${semBaixa.length} vídeos já estão no ar`}
                </strong>{' '}
                e a Central ainda {semBaixa.length === 1 ? 'o trata' : 'os trata'} como não postado{semBaixa.length === 1 ? '' : 's'}.
              </p>
            </div>
            <button
              onClick={() => setPainelBaixa((v) => !v)}
              className="shrink-0 px-3.5 py-2 rounded-xl bg-amber/15 border border-amber/50 text-amber text-[12.5px] font-semibold hover:bg-amber/25 transition-colors"
            >
              {painelBaixa ? 'Fechar' : 'Conferir e dar baixa'}
            </button>
          </div>

          {painelBaixa && (
            <div className="mt-4 space-y-2">
              {semBaixa.map(({ editado, post }) => (
                <div key={editado.id} className="flex items-center gap-3 rounded-xl bg-surface/70 border border-border px-3 py-2.5">
                  <Capa p={post} mini className="h-12 w-9 rounded-md shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-ink truncate">{editado.nome}</p>
                    <p className="text-[11.5px] text-muted truncate">
                      no ar desde {dataCurta(post.postadoEm)} · {fmt(post.views)} views ·{' '}
                      <a href={post.url} target="_blank" rel="noreferrer" className="text-brand-2 hover:text-brand underline">
                        ver no Instagram
                      </a>
                    </p>
                  </div>
                  <button
                    onClick={() => darBaixa(editado, post.postadoEm)}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-green/15 border border-green/50 text-green text-[12px] font-semibold hover:bg-green/25 transition-colors"
                  >
                    Dar baixa
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {visao === 'diagnostico' ? (
        <div className="mt-5">
          <ViraisDiagnostico posts={posts} />
        </div>
      ) : (
        <>
      {/* números do período */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { k: 'vídeos no período', v: String(noPeriodo.length) },
          { k: 'mediana de views', v: fmt(medGeral) },
          { k: 'melhor vídeo', v: fmt(melhor) },
          { k: 'acima de 3× a mediana', v: String(noPeriodo.filter((p) => p.multiplo >= 3).length) },
        ].map((x) => (
          <div key={x.k} className="rounded-2xl border border-border bg-surface/60 px-4 py-3.5">
            <p className="text-[22px] font-bold tracking-[-0.02em] text-ink tabular-nums">{x.v}</p>
            <p className="mt-0.5 text-[11.5px] text-muted">{x.k}</p>
          </div>
        ))}
      </div>

      {/* assuntos */}
      <div className="mt-7">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[13px] font-bold uppercase tracking-[0.09em] text-muted">Assuntos · mediana de views</h3>
          {tema && (
            <button onClick={() => setTema(null)} className="text-[12px] text-brand-2 hover:text-brand font-semibold">
              limpar filtro
            </button>
          )}
        </div>
        <div className="mt-3 space-y-1.5">
          {temas.map((t) => {
            const largura = temas[0].mediana ? (t.mediana / temas[0].mediana) * 100 : 0
            const ativo = tema === t.nome
            return (
              <button
                key={t.nome}
                onClick={() => setTema(ativo ? null : t.nome)}
                className={
                  'w-full text-left rounded-xl px-3 py-2 border transition-colors ' +
                  (ativo ? 'border-brand/50 bg-brand/10' : 'border-transparent hover:bg-surface/60')
                }
              >
                <div className="flex items-center gap-3">
                  <span className="w-[190px] sm:w-[230px] shrink-0 text-[12.5px] font-semibold text-ink-2 truncate">{t.nome}</span>
                  <span className="flex-1 h-2.5 rounded-full bg-surface-2 overflow-hidden">
                    <span
                      className="block h-full rounded-full transition-[width] duration-500"
                      style={{ width: `${Math.max(largura, 2)}%`, background: corTema(t.nome) }}
                    />
                  </span>
                  <span className="w-[74px] shrink-0 text-right text-[12.5px] font-bold text-ink tabular-nums">{fmt(t.mediana)}</span>
                  <span className="w-[52px] shrink-0 text-right text-[11.5px] text-muted tabular-nums">{t.n} víd.</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ranking */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[13px] font-bold uppercase tracking-[0.09em] text-muted">
          {tema || 'Todos os assuntos'} · {lista.length} vídeos
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[12px] text-muted cursor-pointer select-none px-2.5 py-1.5 rounded-lg hover:text-ink-2">
            <input type="checkbox" checked={soOrganico} onChange={(e) => setSoOrganico(e.target.checked)} className="accent-brand" />
            esconder impulsionados
          </label>
          <div className="flex bg-surface/80 border border-border rounded-xl p-1 text-[12px] font-semibold">
            {ORDENS.map((o) => (
              <button
                key={o.id}
                onClick={() => setOrdem(o.id)}
                className={
                  'px-2.5 py-1.5 rounded-lg transition-colors ' + (ordem === o.id ? 'bg-brand/15 text-brand-2' : 'text-muted hover:text-ink')
                }
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
        {lista.slice(0, 120).map((p) => (
          <button
            key={p.code}
            onClick={() => setAberto(p)}
            className="group text-left rounded-2xl overflow-hidden border border-border bg-surface/60 hover:border-border-strong transition-all duration-300 hover:-translate-y-0.5"
          >
            <div className="relative aspect-[9/16] bg-black overflow-hidden">
              <Capa p={p} className="absolute inset-0 h-full w-full group-hover:scale-[1.04] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
              {p.multiplo >= 3 && (
                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-brand text-white text-[10.5px] font-bold shadow-[0_4px_12px_rgba(20,168,245,0.5)]">
                  {p.multiplo.toFixed(p.multiplo >= 10 ? 0 : 1).replace('.', ',')}× a mediana
                </span>
              )}
              {p.impulsionado && (
                <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/70 text-amber text-[10px] font-semibold backdrop-blur-sm">
                  impulsionado?
                </span>
              )}
              {p.anuncio && (
                <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-green/90 text-black text-[10px] font-bold">anúncio</span>
              )}
              <div className="absolute bottom-0 left-0 right-0 p-2.5">
                <p className="text-[19px] font-bold tracking-[-0.02em] text-white leading-none tabular-nums">{fmt(p.views)}</p>
                <p className="mt-1 text-[10.5px] text-white/70 tabular-nums">
                  {fmt(p.curtidas)} curtidas · {pct(p.engajamento)} eng.
                </p>
              </div>
            </div>
            <div className="p-2.5">
              <p className="text-[12px] font-semibold text-ink-2 line-clamp-2 leading-snug">{p.assunto || p.legenda.slice(0, 60) || '—'}</p>
              <p className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-muted">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: corTema(p.tema) }} />
                <span className="truncate">{p.tema || 'sem tema'}</span>
                <span className="ml-auto shrink-0">{dataCurta(p.postadoEm)}</span>
              </p>
            </div>
          </button>
        ))}
      </div>
      {lista.length > 120 && (
        <p className="mt-4 text-center text-[12px] text-muted">mostrando os 120 primeiros de {lista.length}</p>
      )}
        </>
      )}

      {aberto && <Detalhe p={aberto} onFechar={() => setAberto(null)} onVirouAnuncio={(code, cardId) => {
        setPosts((l) => l.map((x) => (x.code === code ? { ...x, anuncio: true, anuncioCardId: cardId } : x)))
        setAberto((a) => (a && a.code === code ? { ...a, anuncio: true, anuncioCardId: cardId } : a))
      }} />}
    </div>
  )
}


/* ------------------------------------------------------ botão de atualizar */

function quandoFoi(iso: string | null): string {
  if (!iso) return 'nunca'
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 2) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  return d === 1 ? 'ontem' : `há ${d} dias`
}

/**
 * Quem coleta do Instagram é a máquina da produção (a sessão do perfil mora lá).
 * O botão deixa o pedido registrado e o agendador de lá pega na próxima checagem,
 * que é de dez em dez minutos — além das duas passadas automáticas por semana.
 */
function BotaoAtualizar({ sync, pedindo, onPedir }: { sync: EstadoSync | null; pedindo: boolean; onPedir: () => void }) {
  const ocupado = pedindo || sync?.status === 'pedido' || sync?.status === 'rodando'
  const rotulo =
    sync?.status === 'rodando' ? 'Atualizando…' : sync?.status === 'pedido' ? 'Na fila…' : 'Atualizar perfil'
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[11.5px] text-muted text-right leading-tight hidden sm:block">
        {sync?.status === 'erro' ? (
          <span className="text-red">falhou · {sync.mensagem}</span>
        ) : sync?.status === 'rodando' || sync?.status === 'pedido' ? (
          <>coletando do Instagram<br />pode levar alguns minutos</>
        ) : (
          <>última coleta<br />{quandoFoi(sync?.rodouEm ?? null)}</>
        )}
      </span>
      <button
        onClick={onPedir}
        disabled={ocupado}
        title="Busca os posts novos e as métricas mais recentes"
        className={
          'h-9 px-3.5 rounded-xl border text-[12.5px] font-semibold transition-colors flex items-center gap-2 ' +
          (ocupado
            ? 'border-border bg-surface/60 text-muted cursor-default'
            : 'border-border-strong bg-surface hover:border-brand hover:text-brand-2 text-ink-2')
        }
      >
        {ocupado && <span className="h-3 w-3 rounded-full border-2 border-muted/40 border-t-muted animate-spin" />}
        {rotulo}
      </button>
    </div>
  )
}

/* ---------------------------------------------------------------- detalhe */


function Detalhe({
  p,
  onFechar,
  onVirouAnuncio,
}: {
  p: Analisado
  onFechar: () => void
  onVirouAnuncio: (code: string, cardId: string) => void
}) {
  const [titulo, setTitulo] = useState(p.assunto || p.legenda.slice(0, 60))
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState(false)
  const [form, setForm] = useState(false)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onFechar])

  async function criarAnuncio() {
    if (!titulo.trim() || criando) return
    setCriando(true)
    setErro(false)
    try {
      const card = await store.createCard({
        titulo: titulo.trim(),
        categoria: 'Anúncio',
        fase: 'A editar',
        semana: currentMonday(),
        campanha: 'Anúncio de viral',
        observacoes:
          `Anúncio a partir de um vídeo que performou no Instagram.\n\n` +
          `Original: ${p.url}\n` +
          `Publicado em ${dataCurta(p.postadoEm)} · ${fmt(p.views)} views · ${fmt(p.curtidas)} curtidas · ` +
          `${fmt(p.comentarios)} comentários · ${pct(p.engajamento)} de engajamento\n` +
          `Assunto: ${p.assunto || '—'} (${p.tema || '—'})\n\n` +
          `Legenda original:\n${p.legenda}`,
      })
      await marcarAnuncio(p.code, card.id)
      onVirouAnuncio(p.code, card.id)
      setForm(false)
    } catch {
      setErro(true)
    } finally {
      setCriando(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm" onClick={onFechar}>
      <div
        className="w-full max-w-3xl max-h-[calc(var(--vh-real,100vh)*0.92)] overflow-y-auto rounded-2xl border border-border-strong bg-elev shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col sm:flex-row">
          <div className="sm:w-[240px] shrink-0 bg-black">
            <Capa p={p} className="w-full aspect-[9/16] h-full" />
          </div>

          <div className="flex-1 min-w-0 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[11.5px] font-semibold" style={{ color: corTema(p.tema) }}>
                  <span className="h-2 w-2 rounded-full" style={{ background: corTema(p.tema) }} />
                  {p.tema || 'sem tema'}
                </p>
                <h3 className="mt-1 text-[19px] font-bold tracking-[-0.02em] text-ink leading-tight">{p.assunto || 'Sem assunto'}</h3>
                <p className="mt-1 text-[12px] text-muted">
                  {dataCurta(p.postadoEm)} · {p.formato || 'formato não classificado'}
                  {p.duracao ? ` · ${Math.round(p.duracao)}s` : ''}
                </p>
              </div>
              <button onClick={onFechar} aria-label="Fechar" className="tap text-muted hover:text-ink text-xl leading-none shrink-0">
                ×
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { k: 'views', v: fmt(p.views) },
                { k: 'curtidas', v: fmt(p.curtidas) },
                { k: 'comentários', v: fmt(p.comentarios) },
                { k: 'engajamento', v: pct(p.engajamento) },
              ].map((x) => (
                <div key={x.k} className="rounded-xl bg-surface/70 border border-border px-3 py-2">
                  <p className="text-[15px] font-bold text-ink tabular-nums">{x.v}</p>
                  <p className="text-[10.5px] text-muted">{x.k}</p>
                </div>
              ))}
            </div>

            <p className="mt-3 text-[11.5px] text-muted">
              {fmt(p.viewsIg)} no Instagram · {fmt(p.viewsFb)} no Facebook · {p.multiplo.toFixed(1).replace('.', ',')}× a mediana do mês
              {p.impulsionado && <span className="text-amber"> · curtida por view muito baixa: parece alcance pago</span>}
            </p>

            {p.legenda && (
              <p className="mt-4 text-[13px] text-ink-2 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">{p.legenda}</p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-2 rounded-xl bg-surface-2 border border-border text-[12.5px] font-semibold text-ink-2 hover:border-border-strong transition-colors"
              >
                Abrir no Instagram ↗
              </a>
              {p.editadoDriveId && (
                <a
                  href={`/v/${p.editadoDriveId}`}
                  className="px-3.5 py-2 rounded-xl bg-surface-2 border border-border text-[12.5px] font-semibold text-ink-2 hover:border-border-strong transition-colors"
                >
                  Ver o arquivo final
                </a>
              )}
              {p.anuncio ? (
                <span className="px-3.5 py-2 rounded-xl bg-green/15 border border-green/50 text-green text-[12.5px] font-semibold">
                  já virou anúncio
                </span>
              ) : form ? (
                <div className="w-full mt-1 flex flex-wrap items-center gap-2">
                  <input
                    autoFocus
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && criarAnuncio()}
                    placeholder="Título da tarefa de anúncio"
                    className="flex-1 min-w-[200px] h-11 px-3 rounded-xl bg-surface border border-border text-[13px] text-ink placeholder:text-muted focus:border-brand outline-none"
                  />
                  <button
                    onClick={criarAnuncio}
                    disabled={criando || !titulo.trim()}
                    className="h-11 px-4 rounded-xl bg-brand text-white text-[12.5px] font-semibold disabled:opacity-50 hover:brightness-110 transition"
                  >
                    {criando ? 'Criando…' : 'Criar tarefa'}
                  </button>
                  <button onClick={() => setForm(false)} className="h-11 px-3 text-[12.5px] text-muted hover:text-ink">
                    cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setForm(true)}
                  className="px-3.5 py-2 rounded-xl bg-brand text-white text-[12.5px] font-semibold hover:brightness-110 transition shadow-[0_4px_14px_rgba(20,168,245,0.35)]"
                >
                  Virar anúncio
                </button>
              )}
            </div>
            {erro && <p className="mt-2 text-[12px] text-red">Não consegui criar a tarefa. Tente de novo.</p>}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
