import { Fragment, useEffect, useMemo, useState } from 'react'
import { listarLinks, criarLink, editarLink, deletarLink, type Link } from '../data/links'

// sugestões iniciais de grupo (só atalho — nada é criado até ter um link)
// categorias sugeridas (cada uma vira uma aba quando tiver link) — você cria novas digitando
const SUGESTOES = ['Otimização de tarefas', 'Vídeos', 'Pastas pra subir vídeo', 'Planilhas', 'Geral']

function comProtocolo(u: string): string {
  const t = u.trim()
  if (!t) return t
  return /^https?:\/\//i.test(t) ? t : 'https://' + t
}
function dominio(u: string): string {
  try {
    return new URL(comProtocolo(u)).hostname.replace(/^www\./, '')
  } catch {
    return u
  }
}
function ehPasta(u: string): boolean {
  return /drive\.google\.com\/drive|drive\.google\.com\/folders/i.test(u)
}

// título guardado = "Produto — Nome do link". Aqui separamos os dois pra exibir/editar.
function parseTitulo(t: string): { prod: string; variante: string | null } {
  const m = t.match(/^(.+?)\s+[—–-]\s+(.+)$/)
  return m ? { prod: m[1].trim(), variante: m[2].trim() } : { prod: t.trim(), variante: null }
}
function montarTitulo(prod: string, nome: string): string {
  const p = prod.trim()
  const n = nome.trim()
  return n ? p + ' — ' + n : p
}
function agruparPorProduto(links: Link[]): [string, Link[]][] {
  const m = new Map<string, Link[]>()
  for (const l of links) {
    const { prod } = parseTitulo(l.titulo)
    if (!m.has(prod)) m.set(prod, [])
    m.get(prod)!.push(l)
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}
function IconeAbrir() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M7 17 17 7M9 7h8v8" /></svg>
}

function IconePasta() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.5l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z" /></svg>
  )
}
function IconeLink() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5" /></svg>
  )
}

export default function Links() {
  const [links, setLinks] = useState<Link[] | null>(null)
  const [editId, setEditId] = useState<string | null>(null) // null = nada; '' = novo; uuid = editando
  const [fProduto, setFProduto] = useState('') // nome em destaque (agrupa)
  const [fNome, setFNome] = useState('') // nome do link (Vendas/Remarketing) — opcional
  const [fUrl, setFUrl] = useState('')
  const [fGrupo, setFGrupo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [confirmar, setConfirmar] = useState<string | null>(null)
  const [abaAtiva, setAbaAtiva] = useState<string>('')

  useEffect(() => {
    listarLinks().then(setLinks).catch(() => setLinks([]))
  }, [])

  const gruposExistentes = useMemo(
    () => [...new Set((links || []).map((l) => l.grupo).filter(Boolean) as string[])],
    [links],
  )
  const sugestoesGrupo = useMemo(
    () => [...new Set([...gruposExistentes, ...SUGESTOES])],
    [gruposExistentes],
  )

  const agrupados = useMemo(() => {
    const m = new Map<string, Link[]>()
    for (const l of links || []) {
      const g = l.grupo?.trim() || 'Sem grupo'
      if (!m.has(g)) m.set(g, [])
      m.get(g)!.push(l)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [links])

  // cada grupo é uma ABA; mostra só a selecionada (sem scroll infinito de tudo)
  const abas = agrupados.map(([g]) => g)
  const abaEfetiva = abas.includes(abaAtiva) ? abaAtiva : abas[0] || ''
  const grupoSel = agrupados.find(([g]) => g === abaEfetiva) || null
  // produtos já existentes na aba atual — sugestões pra agrupar o novo link no mesmo
  const produtosDoGrupo = grupoSel ? [...new Set(grupoSel[1].map((l) => parseTitulo(l.titulo).prod))].sort((a, b) => a.localeCompare(b)) : []

  function abrirNovo() {
    setEditId('')
    setFProduto('')
    setFNome('')
    setFUrl('')
    setFGrupo(abaEfetiva) // já abre na aba/categoria atual
  }
  function abrirEdicao(l: Link) {
    const { prod, variante } = parseTitulo(l.titulo)
    setEditId(l.id)
    setFProduto(prod)
    setFNome(variante || '')
    setFUrl(l.url)
    setFGrupo(l.grupo || '')
  }
  function fechar() {
    setEditId(null)
  }

  async function salvar() {
    const titulo = montarTitulo(fProduto, fNome)
    const url = comProtocolo(fUrl)
    if (!fProduto.trim() || !url || salvando) return
    setSalvando(true)
    try {
      const payload = { titulo, url, grupo: fGrupo.trim() || null }
      if (editId) {
        await editarLink(editId, payload)
        setLinks((ls) => (ls ? ls.map((l) => (l.id === editId ? { ...l, ...payload } : l)) : ls))
      } else {
        const novo = await criarLink(payload)
        if (novo) setLinks((ls) => [...(ls || []), novo])
      }
      fechar()
    } finally {
      setSalvando(false)
    }
  }

  async function remover(id: string) {
    setLinks((ls) => (ls ? ls.filter((l) => l.id !== id) : ls))
    setConfirmar(null)
    await deletarLink(id).catch(() => {})
  }

  const inputCls = 'w-full h-11 px-3.5 rounded-xl bg-surface border border-border text-ink text-[14px] outline-none transition-colors focus:border-brand/70 placeholder:text-muted'

  // ações (editar/apagar) de um link — usadas no card simples e nas linhas de variante
  const acoesLink = (l: Link) =>
    confirmar === l.id ? (
      <span className="inline-flex items-center gap-1 text-[12px] shrink-0">
        <span className="text-muted">Apagar?</span>
        <button onClick={() => remover(l.id)} className="font-bold text-red px-2 py-1 rounded-lg hover:bg-red hover:text-white transition-colors">Sim</button>
        <button onClick={() => setConfirmar(null)} className="font-semibold text-muted px-2 py-1 rounded-lg hover:text-ink transition-colors">Não</button>
      </span>
    ) : (
      <div className="shrink-0 flex items-center gap-0.5 opacity-60 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button onClick={() => abrirEdicao(l)} title="Editar" aria-label={'Editar link ' + l.titulo} className="tap h-8 w-8 grid place-items-center rounded-lg text-muted hover:text-ink transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
        </button>
        <button onClick={() => setConfirmar(l.id)} title="Apagar" aria-label={'Apagar link ' + l.titulo} className="tap h-8 w-8 grid place-items-center rounded-lg text-muted hover:text-red transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>
        </button>
      </div>
    )

  return (
    <div className="relative z-10 px-4 sm:px-6 pb-28 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 pt-3 pb-4">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-ink-2">Links da equipe</h2>
        {links && <span className="tnum text-[11px] font-bold text-brand-2 bg-brand/12 rounded-full px-2 py-0.5">{links.length}</span>}
        {editId === null && (
          <button onClick={abrirNovo} className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-semibold text-white bg-brand rounded-lg px-3 py-1.5 shadow-[0_6px_18px_-6px_rgba(20,168,245,0.5)] active:scale-95 transition-transform">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Adicionar
          </button>
        )}
      </div>

      {/* abas — uma por categoria; mostra só a selecionada (sem scroll infinito) */}
      {links && abas.length > 0 && (
        <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-b border-border/60 mb-4">
          {abas.map((g) => {
            const ativo = g === abaEfetiva
            const n = agrupados.find(([gg]) => gg === g)?.[1].length ?? 0
            return (
              <button key={g} onClick={() => setAbaAtiva(g)} className={'shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px transition-colors ' + (ativo ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink')}>
                {g}
                <span className={'tnum text-[11px] font-bold rounded-full px-1.5 ' + (ativo ? 'bg-brand/15 text-brand-2' : 'bg-surface-2 text-muted')}>{n}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* formulário (novo / edição) */}
      {editId !== null && (
        <div className="mb-5 rounded-2xl border border-border-strong bg-elev p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted mb-2.5">{editId ? 'Editar link' : 'Novo link'}</div>
          <label className="block text-[11px] font-semibold text-muted mb-1">Produto (destaque)</label>
          <input value={fProduto} onChange={(e) => setFProduto(e.target.value)} placeholder="Ex.: PERP-JL-POS-DFP" className={inputCls + ' mb-1.5'} autoFocus />
          {produtosDoGrupo.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {produtosDoGrupo.map((p) => (
                <button key={p} onClick={() => setFProduto(p)} className={'text-[12px] font-semibold rounded-lg border px-2 py-1 transition-colors ' + (fProduto === p ? 'text-brand-2 bg-brand/12 border-brand/40' : 'bg-surface-2 border-border text-muted hover:text-ink')}>{p}</button>
              ))}
            </div>
          )}
          <label className="block text-[11px] font-semibold text-muted mb-1">Nome do link <span className="font-normal text-muted/70">(ex.: Vendas, Remarketing — opcional)</span></label>
          <input value={fNome} onChange={(e) => setFNome(e.target.value)} placeholder="Vendas" className={inputCls + ' mb-2'} />
          <input value={fUrl} onChange={(e) => setFUrl(e.target.value)} placeholder="Cole o link (https://…)" className={inputCls + ' mb-2'} />
          <input value={fGrupo} onChange={(e) => setFGrupo(e.target.value)} placeholder="Categoria / aba (ex.: Otimização de tarefas)" className={inputCls} />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {sugestoesGrupo.map((g) => (
              <button key={g} onClick={() => setFGrupo(g)} className={'text-[12px] font-semibold rounded-lg border px-2 py-1 transition-colors ' + (fGrupo === g ? 'text-brand-2 bg-brand/12 border-brand/40' : 'bg-surface-2 border-border text-muted hover:text-ink')}>
                {g}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-3.5">
            <button onClick={fechar} className="text-[13px] font-semibold text-muted px-3 py-2 hover:text-ink transition-colors">Cancelar</button>
            <button onClick={salvar} disabled={!fProduto.trim() || !fUrl.trim() || salvando} className="ml-auto text-[13px] font-bold text-white bg-brand rounded-xl px-4 py-2 disabled:opacity-40 active:scale-[0.98] transition-all">
              {salvando ? 'Salvando…' : editId ? 'Salvar' : 'Adicionar link'}
            </button>
          </div>
        </div>
      )}

      {!links && (
        <div className="grid place-items-center py-20">
          <div className="h-7 w-7 rounded-full border-[3px] border-border-strong border-t-brand animate-spin" />
        </div>
      )}

      {links && links.length === 0 && editId === null && (
        <div className="text-center text-muted py-16">Nenhum link ainda. Clique em "Adicionar" pra começar.</div>
      )}

      {grupoSel && (
        <div className="flex flex-col gap-2">
          {agruparPorProduto(grupoSel[1]).map(([prod, links]) => {
            const temVar = links.some((l) => parseTitulo(l.titulo).variante)
            // sem nome de link: cada um como card simples (título inteiro)
            if (!temVar) {
              return (
                <Fragment key={prod}>
                  {links.map((l) => (
                    <div key={l.id} className="group rounded-xl border border-border bg-surface hover:border-border-strong transition-colors flex items-center gap-3 pl-3.5 pr-2.5 py-2.5">
                      <span className={'shrink-0 grid place-items-center h-8 w-8 rounded-lg border ' + (ehPasta(l.url) ? 'text-amber bg-amber/12 border-amber/25' : 'text-brand-2 bg-brand/10 border-brand/20')}>
                        {ehPasta(l.url) ? <IconePasta /> : <IconeLink />}
                      </span>
                      <a href={comProtocolo(l.url)} target="_blank" rel="noopener noreferrer" title={l.titulo} className="min-w-0 flex-1">
                        <div className="text-[14px] font-semibold text-ink truncate group-hover:text-brand-2 transition-colors">{l.titulo}</div>
                        <div className="text-[12px] text-muted truncate">{dominio(l.url)}</div>
                      </a>
                      {acoesLink(l)}
                    </div>
                  ))}
                </Fragment>
              )
            }
            // com nome de link: produto em destaque uma vez, com os nomes (Vendas/Remarketing) dentro
            return (
              <div key={prod} className="rounded-xl border border-border bg-surface overflow-hidden">
                <div className="flex items-center gap-2.5 px-3.5 pt-2.5 pb-2">
                  <span className={'shrink-0 grid place-items-center h-8 w-8 rounded-lg border ' + (ehPasta(links[0].url) ? 'text-amber bg-amber/12 border-amber/25' : 'text-brand-2 bg-brand/10 border-brand/20')}>
                    {ehPasta(links[0].url) ? <IconePasta /> : <IconeLink />}
                  </span>
                  <span className="min-w-0 flex-1 text-[14px] font-bold text-ink truncate" title={prod}>{prod}</span>
                  <span className="shrink-0 text-[11px] text-muted truncate max-w-[120px]">{dominio(links[0].url)}</span>
                </div>
                <div className="border-t border-border/60">
                  {links
                    .slice()
                    .sort((a, b) => (parseTitulo(a.titulo).variante || '').localeCompare(parseTitulo(b.titulo).variante || ''))
                    .map((l) => (
                      <div key={l.id} className="group flex items-center gap-2 pl-3.5 pr-2.5 py-1.5 border-b border-border/40 last:border-0 hover:bg-surface-2/40 transition-colors">
                        <a href={comProtocolo(l.url)} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-brand-2 truncate transition-colors">
                          <IconeAbrir />
                          <span className="truncate">{parseTitulo(l.titulo).variante}</span>
                        </a>
                        {acoesLink(l)}
                      </div>
                    ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
