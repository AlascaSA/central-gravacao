import { useEffect, useMemo, useRef, useState } from 'react'
import { zipSync } from 'fflate'
import {
  combinar, conferir, papelPeloNome,
  type Combinacao, type Nomeacao, type Papel, type Peca,
} from '../data/multiplicar'
import { carregarPecas, montar, motor, saoCompativeis } from '../data/montar'
import {
  lerProgresso, montagemAberta, pedirMontagem, servidorPronto, type Montagem,
} from '../data/servidor'

/** Aceita link completo do Drive ou o id cru da pasta. */
function idDaPasta(entrada: string): string {
  const t = entrada.trim()
  const m = t.match(/folders\/([a-zA-Z0-9_-]{10,})/) || t.match(/[?&]id=([a-zA-Z0-9_-]{10,})/)
  return m ? m[1] : t
}

/** 95 → "1 min 35"; serve para a estimativa da barra. */
function emTempo(seg: number): string {
  if (seg < 60) return `${Math.round(seg)}s`
  const m = Math.floor(seg / 60)
  if (m < 60) return `${m} min ${String(Math.round(seg % 60)).padStart(2, '0')}`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}`
}

const PAPEIS: { valor: Papel | 'fora'; rotulo: string }[] = [
  { valor: 'gancho', rotulo: 'gancho' },
  { valor: 'corpo', rotulo: 'corpo' },
  { valor: 'cta', rotulo: 'CTA' },
  { valor: 'fora', rotulo: 'não usar' },
]

export default function Multiplicar() {
  const [entrada, setEntrada] = useState('')
  const [pasta, setPasta] = useState('')
  const [lendo, setLendo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pecas, setPecas] = useState<Peca[]>([])
  const [fora, setFora] = useState<Set<string>>(new Set())
  const [nome, setNome] = useState<Nomeacao>({
    codigo: '2609-JL-IIP-PDS', objetivo: 'CAP', adInicial: 1, versao: 1,
  })
  const [combos, setCombos] = useState<Combinacao[]>([])
  const [rodando, setRodando] = useState(false)
  const [recado, setRecado] = useState('')
  const [subindo, setSubindo] = useState(false)
  const [enviadas, setEnviadas] = useState(0)
  const [pastaSaida, setPastaSaida] = useState<string | null>(null)
  // 'servidor' monta fora daqui; 'drive' monta na aba mas sobe peça por peça
  // (a memória é solta na hora); 'aba' segura tudo para baixar em .zip.
  const [saida, setSaida] = useState<'servidor' | 'drive' | 'aba'>('drive')
  const [temServidor, setTemServidor] = useState(false)
  const [montagem, setMontagem] = useState<Montagem | null>(null)
  const comecou = useRef<number | null>(null)
  const noServidor = saida === 'servidor'

  const usadas = useMemo(() => pecas.filter(p => !fora.has(p.id)), [pecas, fora])
  const previstas = useMemo(() => combinar(usadas, nome), [usadas, nome])
  const avisos = useMemo(() => conferir(usadas), [usadas])
  const compativel = useMemo(() => saoCompativeis(usadas), [usadas])
  const prontas = combos.filter(c => c.estado === 'pronta')

  // a barra e a lista leem de uma fonte só, seja o trabalho daqui ou do servidor
  const total = noServidor ? (montagem?.total ?? 0) : combos.length
  const feitas = noServidor
    ? (montagem?.feitas ?? 0)
    : combos.filter(c => c.estado === 'pronta' || c.estado === 'enviada' || c.estado === 'erro').length
  const falharam = noServidor ? (montagem?.falhas ?? 0) : combos.filter(c => c.estado === 'erro').length
  const pct = total ? Math.round((feitas / total) * 100) : 0
  const emCurso = noServidor
    ? montagem?.estado === 'fila' || montagem?.estado === 'montando'
    : rodando
  // estimativa pela média real das peças já concluídas — nada de contagem chutada
  const restante = emCurso && feitas >= 2 && comecou.current
    ? ((Date.now() - comecou.current) / feitas) * (total - feitas) / 1000
    : null
  const lista: { nome: string; estado: string; mb?: number; erro?: string }[] = noServidor
    ? (montagem?.pecas ?? [])
    : combos.map(c => ({
        nome: c.nome, estado: c.estado,
        mb: c.bytes ? Math.round(c.bytes / 1e6) : undefined, erro: c.erro,
      }))

  async function abrirPasta() {
    const id = idDaPasta(entrada)
    if (!id) return
    setLendo(true); setErro(null); setCombos([])
    try {
      const r = await fetch(`/api/mult-listar?pasta=${encodeURIComponent(id)}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || 'não consegui abrir a pasta')
      const lidas: Peca[] = (d.videos || []).map((v: Peca & { seg?: number }) => ({
        id: v.id, nome: v.nome, mb: v.mb, duracao: v.seg ?? null,
        largura: v.largura, altura: v.altura,
        papel: papelPeloNome(v.nome) ?? 'corpo',
      }))
      setPasta(id); setPecas(lidas)
      // se o servidor já estava montando essa pasta, mostra a fila em vez de começar de novo
      const jaRodando = await montagemAberta(id)
      setMontagem(jaRodando)
      setFora(new Set(lidas.filter(p => !papelPeloNome(p.nome)).length === lidas.length ? [] : []))
      if (!lidas.length) setErro('Nenhum vídeo nessa pasta.')
    } catch (e) {
      setErro(String((e as Error).message))
    } finally {
      setLendo(false)
    }
  }

  function trocarPapel(id: string, valor: Papel | 'fora') {
    if (valor === 'fora') {
      setFora(f => new Set(f).add(id))
      return
    }
    setFora(f => { const n = new Set(f); n.delete(id); return n })
    setPecas(ps => ps.map(p => (p.id === id ? { ...p, papel: valor } : p)))
  }

  /** Cria (ou reaproveita) a subpasta de saída dentro da pasta de origem. */
  async function criarPastaSaida(): Promise<string> {
    const r = await fetch(`/api/mult-pasta-nova?pasta=${encodeURIComponent(pasta)}`
      + `&nome=${encodeURIComponent('Variações ' + nome.codigo)}`)
    const d = await r.json()
    if (!r.ok) throw new Error(d?.error || 'não consegui criar a pasta de saída')
    return d.id
  }

  /** Sessão de upload + PUT do navegador direto no Google: o vídeo não passa pela função. */
  async function subirPeca(destino: string, arquivo: string, blob: Blob) {
    const rs = await fetch(`/api/mult-subir?pasta=${encodeURIComponent(destino)}`
      + `&nome=${encodeURIComponent(arquivo + '.mp4')}`)
    const ds = await rs.json()
    if (!rs.ok) throw new Error(ds?.error || 'o Drive recusou o envio')
    const up = await fetch(ds.sessao, { method: 'PUT', body: blob })
    if (!up.ok) throw new Error(`falha ao enviar ${arquivo}`)
  }

  async function gerar() {
    setErro(null); setEnviadas(0)
    comecou.current = Date.now()

    // fora da máquina: entrega o pedido e passa a acompanhar. Pode fechar a aba.
    if (noServidor) {
      setRodando(true)
      try {
        setRecado('entregando o pedido ao servidor…')
        const id = await pedirMontagem(pasta, previstas, nome)
        setMontagem({
          id, pasta_saida: null, total: previstas.length, feitas: 0, enviadas: 0,
          falhas: 0, estado: 'fila', erro: null,
          pecas: previstas.map(c => ({ nome: c.nome, estado: 'espera' })),
        })
        setRecado('')
      } catch (e) {
        setErro(String((e as Error).message))
      } finally {
        setRodando(false)
      }
      return
    }

    setRodando(true)
    const fila = previstas.map(c => ({ ...c }))
    setCombos(fila)
    try {
      setRecado('preparando o motor de vídeo…')
      const f = await motor(m => setRecado(m.slice(0, 90)))
      await carregarPecas(f, usadas, pasta, m => setRecado(m))

      // a pasta de saída é criada uma vez só, antes de montar a primeira peça
      let destino: string | null = null
      if (saida === 'drive') {
        setRecado('abrindo a pasta de saída no Drive…')
        destino = await criarPastaSaida()
        setPastaSaida(destino)
      }

      for (let i = 0; i < fila.length; i++) {
        setCombos(cs => cs.map((c, n) => (n === i ? { ...c, estado: 'montando' } : c)))
        setRecado(`montando ${i + 1} de ${fila.length}`)
        try {
          const { blob } = await montar(f, fila[i], compativel)
          if (destino) {
            // sobe agora e não guarda o blob: a aba nunca segura mais de uma peça
            setCombos(cs => cs.map((c, n) =>
              n === i ? { ...c, estado: 'enviando', bytes: blob.size } : c))
            setRecado(`enviando ${i + 1} de ${fila.length} ao Drive`)
            await subirPeca(destino, fila[i].nome, blob)
            setCombos(cs => cs.map((c, n) =>
              n === i ? { ...c, estado: 'enviada', bytes: blob.size } : c))
            setEnviadas(e => e + 1)
          } else {
            setCombos(cs => cs.map((c, n) =>
              n === i ? { ...c, estado: 'pronta', blob, bytes: blob.size } : c))
          }
        } catch (e) {
          setCombos(cs => cs.map((c, n) =>
            n === i ? { ...c, estado: 'erro', erro: String((e as Error).message).slice(0, 120) } : c))
        }
      }
      setRecado('')
    } catch (e) {
      setErro(String((e as Error).message))
    } finally {
      setRodando(false)
    }
  }

  /** Envia ao Drive o que ficou guardado na aba (modo "guardar aqui"). */
  async function devolverAoDrive() {
    if (!prontas.length) return
    setSubindo(true); setErro(null); setEnviadas(0)
    try {
      const destino = await criarPastaSaida()
      setPastaSaida(destino)
      for (let i = 0; i < prontas.length; i++) {
        const c = prontas[i]
        if (!c.blob) continue
        setRecado(`enviando ${i + 1} de ${prontas.length}`)
        await subirPeca(destino, c.nome, c.blob)
        setEnviadas(i + 1)
      }
      setRecado('')
    } catch (e) {
      setErro(String((e as Error).message))
    } finally {
      setSubindo(false)
    }
  }

  async function baixarTudo() {
    const arquivos: Record<string, Uint8Array> = {}
    for (const c of prontas) {
      if (!c.blob) continue
      arquivos[`${c.nome}.mp4`] = new Uint8Array(await c.blob.arrayBuffer())
    }
    // sem compressão: MP4 já é comprimido, e zipar de novo só gastaria tempo
    const zip = zipSync(arquivos, { level: 0 })
    const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${nome.codigo}-${nome.objetivo}-variacoes.zip`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }

  useEffect(() => { setCombos([]) }, [pecas, fora, nome])

  // a opção de montar fora da máquina só aparece se o serviço estiver de pé
  useEffect(() => {
    servidorPronto().then(ok => { setTemServidor(ok); if (ok) setSaida('servidor') })
  }, [])

  // acompanha a fila do servidor — é isso que deixa fechar o navegador no meio
  const jobId = montagem?.id
  const jobEstado = montagem?.estado
  useEffect(() => {
    if (!jobId || (jobEstado !== 'fila' && jobEstado !== 'montando')) return
    const t = setInterval(async () => {
      const novo = await lerProgresso(jobId)
      if (novo) setMontagem(novo)
    }, 2500)
    return () => clearInterval(t)
  }, [jobId, jobEstado])

  const porPapel = (p: Papel) => usadas.filter(x => x.papel === p).length

  return (
    <div className="relative z-10 px-4 sm:px-6 pb-28 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 pt-3 pb-4">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-ink-2">Multiplicar anúncios</h2>
        {!!previstas.length && (
          <span className="tnum text-[11px] font-bold text-brand-2 bg-brand/12 rounded-full px-2 py-0.5">
            {previstas.length} peças
          </span>
        )}
      </div>

      <p className="text-[13px] text-muted leading-relaxed mb-4 max-w-[62ch]">
        Aponte a pasta do Drive com os ganchos, corpos e CTAs gravados. Cada corpo é combinado
        com cada gancho e cada CTA, e as peças voltam para uma subpasta de variações.
        Escolha abaixo onde a emenda acontece.
      </p>

      <div className="flex flex-wrap gap-2 mb-5">
        <input
          value={entrada}
          onChange={e => setEntrada(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && abrirPasta()}
          placeholder="Cole o link da pasta do Drive"
          className="flex-1 min-w-[280px] bg-surface border border-border rounded-xl px-3 py-2
                     text-[13px] text-ink placeholder:text-muted focus:border-border-strong outline-none"
        />
        <button
          onClick={abrirPasta}
          disabled={!entrada.trim() || lendo}
          className="tap px-4 py-2 rounded-xl bg-brand text-white text-[13px] font-bold
                     disabled:opacity-40 hover:brightness-110 transition"
        >{lendo ? 'abrindo…' : 'abrir pasta'}</button>
      </div>

      {erro && (
        <div className="mb-4 rounded-xl border border-red/40 bg-red/10 px-3 py-2 text-[13px] text-red">{erro}</div>
      )}

      {!!pecas.length && (
        <>
          <div className="rounded-2xl border border-border bg-elev overflow-hidden mb-5">
            {pecas.map(p => {
              const desligada = fora.has(p.id)
              return (
                <div key={p.id}
                  className={'flex items-center gap-3 px-3 py-2 border-b border-border last:border-b-0 '
                    + (desligada ? 'opacity-40' : '')}>
                  <span className="flex-1 text-[13px] text-ink truncate">{p.nome}</span>
                  <span className="tnum text-[11px] text-muted shrink-0">
                    {p.duracao ? `${p.duracao.toFixed(0)}s` : '—'}
                    {p.largura ? ` · ${p.largura}×${p.altura}` : ''}
                  </span>
                  <div className="flex gap-1 shrink-0">
                    {PAPEIS.map(op => {
                      const ativo = op.valor === 'fora' ? desligada : (!desligada && p.papel === op.valor)
                      return (
                        <button key={op.valor} onClick={() => trocarPapel(p.id, op.valor)}
                          className={'tap text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors '
                            + (ativo ? 'bg-brand text-white' : 'text-muted hover:text-ink bg-surface')}>
                          {op.rotulo}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap items-end gap-3 mb-4">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              código
              <input value={nome.codigo} onChange={e => setNome({ ...nome, codigo: e.target.value })}
                className="block mt-1 w-[190px] bg-surface border border-border rounded-lg px-2 py-1.5 text-[13px] text-ink outline-none focus:border-border-strong" />
            </label>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              objetivo
              <select value={nome.objetivo} onChange={e => setNome({ ...nome, objetivo: e.target.value })}
                className="block mt-1 bg-surface border border-border rounded-lg px-2 py-1.5 text-[13px] text-ink outline-none">
                <option>CAP</option><option>VND</option><option>RMK</option>
              </select>
            </label>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              1º AD
              <input type="number" min={1} value={nome.adInicial}
                onChange={e => setNome({ ...nome, adInicial: Number(e.target.value) || 1 })}
                className="block mt-1 w-[72px] bg-surface border border-border rounded-lg px-2 py-1.5 text-[13px] text-ink tnum outline-none" />
            </label>
            <div className="text-[13px] text-muted ml-auto">
              <b className="text-ink tnum">{porPapel('corpo')}</b> corpos ×{' '}
              <b className="text-ink tnum">{porPapel('gancho') || 1}</b> ganchos ×{' '}
              <b className="text-ink tnum">{porPapel('cta') || 1}</b> CTAs ={' '}
              <b className="text-brand-2 tnum">{previstas.length}</b> peças
            </div>
          </div>

          {avisos.map((a, i) => (
            <div key={i} className="mb-2 rounded-xl border border-amber/40 bg-amber/10 px-3 py-2 text-[12.5px] text-amber">{a}</div>
          ))}
          {!compativel && (
            <div className="mb-2 rounded-xl border border-amber/40 bg-amber/10 px-3 py-2 text-[12.5px] text-amber">
              Como os formatos diferem, cada peça precisa ser recodificada — conte alguns minutos por peça
              em vez de segundos.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-4">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted mr-1">onde monta</span>
            {([
              ...(temServidor ? [{ v: 'servidor' as const, r: 'no servidor' }] : []),
              { v: 'drive' as const, r: 'aqui, subindo direto' },
              { v: 'aba' as const, r: 'aqui, guardando' },
            ]).map(op => (
              <button key={op.v} onClick={() => setSaida(op.v)} disabled={emCurso}
                className={'tap text-[11.5px] font-semibold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40 '
                  + (saida === op.v ? 'bg-brand text-white' : 'text-muted hover:text-ink bg-surface')}>
                {op.r}
              </button>
            ))}
          </div>

          <p className="text-[11.5px] text-muted mt-1.5 max-w-[62ch]">
            {saida === 'servidor'
              ? 'O vídeo sai do Drive, é montado no servidor e volta pro Drive. Nada passa por este computador e você pode fechar o navegador no meio da fila.'
              : saida === 'drive'
                ? 'Monta nesta aba e sobe cada peça assim que fica pronta. Precisa deixar o navegador aberto, e as peças prontas sobem pela sua internet.'
                : 'Monta nesta aba e segura tudo na memória para você baixar de uma vez em .zip.'}
            {saida === 'aba' && previstas.length > 20 && (
              <span className="font-semibold text-amber"> {previstas.length} peças na memória pode travar o navegador.</span>
            )}
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-3">
            <button onClick={gerar} disabled={emCurso || rodando || !previstas.length}
              className="tap px-4 py-2 rounded-xl bg-brand text-white text-[13px] font-bold disabled:opacity-40 hover:brightness-110 transition">
              {emCurso ? 'montando…'
                : noServidor ? `mandar ${previstas.length} pro servidor`
                : saida === 'drive' ? `gerar e enviar ${previstas.length} peças`
                : `gerar ${previstas.length} peças`}
            </button>
            {saida === 'aba' && !!prontas.length && (
              <button onClick={devolverAoDrive} disabled={subindo}
                className="tap px-4 py-2 rounded-xl bg-brand/15 text-brand-2 border border-brand/40 text-[13px] font-bold hover:bg-brand/25 transition disabled:opacity-40">
                {subindo ? `enviando ${enviadas}/${prontas.length}…` : `devolver ${prontas.length} ao Drive`}
              </button>
            )}
            {saida === 'aba' && !!prontas.length && (
              <button onClick={baixarTudo}
                className="tap px-4 py-2 rounded-xl bg-green/15 text-green border border-green/40 text-[13px] font-bold hover:bg-green/25 transition">
                baixar {prontas.length} em .zip
              </button>
            )}
            {(noServidor ? (montagem?.enviadas ?? 0) : (saida === 'drive' ? enviadas : 0)) > 0 && (
              <span className="tnum text-[12px] font-semibold text-green">
                {noServidor ? montagem?.enviadas : enviadas} no Drive
              </span>
            )}
            {recado && <span className="text-[12px] text-muted truncate">{recado}</span>}
            {(noServidor ? montagem?.pasta_saida : (!subindo && !rodando && pastaSaida)) && (
              <a href={`https://drive.google.com/drive/folders/${noServidor ? montagem?.pasta_saida : pastaSaida}`}
                target="_blank" rel="noreferrer"
                className="text-[12px] font-semibold text-brand-2 hover:underline">abrir a pasta no Drive</a>
            )}
          </div>
        </>
      )}

      {!!total && (
        <div className="mt-5">
          <div className="flex items-baseline gap-2 mb-1.5">
            <span className="tnum text-[13px] font-bold text-ink">{feitas} de {total}</span>
            <span className="tnum text-[12px] text-muted">{pct}%</span>
            {!!falharam && (
              <span className="tnum text-[12px] font-semibold text-red">{falharam} com erro</span>
            )}
            {restante !== null && (
              <span className="tnum text-[12px] text-muted ml-auto">faltam ~{emTempo(restante)}</span>
            )}
          </div>
          <div className="h-1.5 rounded-full bg-surface overflow-hidden">
            <div className="h-full rounded-full bg-brand transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {noServidor && montagem?.erro && (
        <div className="mt-3 rounded-xl border border-red/40 bg-red/10 px-3 py-2 text-[13px] text-red">
          {montagem.erro}
        </div>
      )}

      {!!lista.length && (
        <div className="mt-3 rounded-2xl border border-border bg-elev overflow-hidden">
          {lista.map((c, i) => (
            <div key={c.nome + i} className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-b-0">
              <span className={'text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 '
                + (c.estado === 'enviada' ? 'bg-green/15 text-green'
                  : c.estado === 'pronta' ? 'bg-green/15 text-green'
                  : c.estado === 'erro' ? 'bg-red/15 text-red'
                  : c.estado === 'montando' || c.estado === 'enviando' ? 'bg-brand/15 text-brand-2'
                  : 'bg-surface text-muted')}>
                {c.estado === 'enviada' ? 'no Drive' : c.estado}
              </span>
              <span className="flex-1 text-[12.5px] text-ink truncate">{c.nome}</span>
              <span className="tnum text-[11px] text-muted shrink-0">
                {c.mb ? `${c.mb} MB` : c.erro || ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
