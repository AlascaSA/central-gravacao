import { useMemo } from 'react'
import { fmt, mediana, pct, corTema, SEM_TEMA, type Analisado } from '../data/viraisUtil'

/**
 * O diagnóstico do perfil em números: o que está derrubando o alcance e o que
 * está puxando. Mesma régua da análise entregue ao cliente — só posts com dez
 * dias ou mais no ar (post novo ainda acumula view) e sem os de alcance pago.
 */

interface Faixa {
  rotulo: string
  valor: number
  n: number
  cor?: string
  alerta?: boolean
}

function Barras({ faixas, sufixo = 'vídeos' }: { faixas: Faixa[]; sufixo?: string }) {
  const topo = Math.max(...faixas.map((f) => f.valor), 1)
  return (
    <div className="flex flex-col gap-1.5">
      {faixas.map((f) => (
        <div key={f.rotulo} className="flex items-center gap-3">
          <span className="w-[124px] sm:w-[168px] shrink-0 text-[12.5px] text-ink-2 truncate" title={f.rotulo}>
            {f.rotulo}
          </span>
          <span className="flex-1 h-2.5 rounded-full bg-surface-2 overflow-hidden">
            <span
              className="block h-full rounded-full transition-[width] duration-500"
              style={{ width: `${Math.max((f.valor / topo) * 100, 2)}%`, background: f.cor || (f.alerta ? '#ff5c63' : '#14a8f5') }}
            />
          </span>
          <span className="w-[62px] shrink-0 text-right text-[12.5px] font-bold text-ink tabular-nums">{fmt(f.valor)}</span>
          <span className="w-[64px] shrink-0 text-right text-[11px] text-muted tabular-nums">
            {f.n} {sufixo}
          </span>
        </div>
      ))}
    </div>
  )
}

function Bloco({ titulo, leitura, children }: { titulo: string; leitura: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface/60 p-4 sm:p-5 flex flex-col gap-3.5">
      <div>
        <h3 className="text-[15px] font-bold tracking-[-0.01em] text-ink">{titulo}</h3>
        <p className="mt-1 text-[12.5px] text-muted leading-relaxed">{leitura}</p>
      </div>
      {children}
    </section>
  )
}

export default function ViraisDiagnostico({ posts }: { posts: Analisado[] }) {
  // base do diagnóstico: últimos 12 meses, já maduros, sem alcance comprado
  const base = useMemo(
    () => posts.filter((p) => p.idade >= 10 && p.idade <= 365 && !p.impulsionado),
    [posts],
  )

  const med = (l: Analisado[]) => mediana(l.map((x) => x.views))

  /* ritmo: quantos vídeos saíram no mesmo dia */
  const ritmo = useMemo(() => {
    const porDia = new Map<string, Analisado[]>()
    base.forEach((p) => {
      const d = p.postadoEm.slice(0, 10)
      porDia.set(d, [...(porDia.get(d) || []), p])
    })
    const faixa = new Map<number, Analisado[]>()
    porDia.forEach((l) => {
      const k = Math.min(l.length, 4)
      // chamada de curso fica de fora: senão o dia cheio parece pior só por ter mais venda
      const conteudo = l.filter((p) => p.formato !== 'venda direta')
      faixa.set(k, [...(faixa.get(k) || []), ...conteudo])
    })
    return [1, 2, 3, 4]
      .filter((k) => (faixa.get(k) || []).length)
      .map((k) => ({
        rotulo: k < 4 ? `${k} vídeo${k > 1 ? 's' : ''} no dia` : '4 ou mais no dia',
        valor: med(faixa.get(k)!),
        n: faixa.get(k)!.length,
        alerta: k >= 3,
      }))
  }, [base])

  const quedaRitmo = ritmo.length >= 2 ? 1 - ritmo[ritmo.length - 1].valor / ritmo[0].valor : 0

  /* formato */
  const formatos = useMemo(() => {
    const m = new Map<string, Analisado[]>()
    base.forEach((p) => p.formato && m.set(p.formato, [...(m.get(p.formato) || []), p]))
    return [...m.entries()]
      .filter(([, l]) => l.length >= 5)
      .map(([f, l]) => ({ rotulo: f, valor: med(l), n: l.length, alerta: f === 'venda direta' }))
      .sort((a, b) => b.valor - a.valor)
  }, [base])

  /* assunto, com taxa de acerto */
  const assuntos = useMemo(() => {
    const m = new Map<string, Analisado[]>()
    base.forEach((p) => {
      const k = p.tema || SEM_TEMA
      m.set(k, [...(m.get(k) || []), p])
    })
    return [...m.entries()]
      .map(([t, l]) => ({
        tema: t,
        n: l.length,
        mediana: med(l),
        acerto: l.filter((x) => x.multiplo >= 3).length / l.length,
      }))
      .sort((a, b) => b.mediana - a.mediana)
  }, [base])

  /* chamada de venda dentro do conteúdo */
  const venda = useMemo(() => {
    // fora os vídeos que são só divulgação; o que fica é conteúdo, com e sem chamada no fim
    const conteudo = base.filter((p) => p.tema !== 'Divulgação de curso ou evento')
    const com = conteudo.filter((p) => p.venda)
    const sem = conteudo.filter((p) => !p.venda)
    return { com: { v: med(com), n: com.length }, sem: { v: med(sem), n: sem.length } }
  }, [base])

  /* calendário e horário */
  const DIAS = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo']
  const semana = useMemo(
    () =>
      DIAS.map((d, i) => {
        const l = base.filter((p) => (new Date(p.postadoEm).getDay() + 6) % 7 === i)
        return { rotulo: d, valor: med(l), n: l.length }
      }).filter((f) => f.n),
    [base],
  )

  const horas = useMemo(() => {
    const faixas: [number, number, string][] = [
      [5, 12, 'manhã'],
      [12, 17, 'tarde'],
      [17, 20, 'fim de tarde'],
      [20, 24, 'noite'],
    ]
    return faixas
      .map(([a, b, rot]) => {
        const l = base.filter((p) => {
          const h = new Date(p.postadoEm).getHours()
          return h >= a && h < b
        })
        return { rotulo: rot, valor: med(l), n: l.length }
      })
      .filter((f) => f.n >= 5)
  }, [base])

  /* duração */
  const duracoes = useMemo(() => {
    const faixas: [number, number, string][] = [
      [0, 30, 'até 30s'],
      [30, 60, '30 a 60s'],
      [60, 120, '1 a 2 min'],
      [120, 180, '2 a 3 min'],
      [180, 99999, 'mais de 3 min'],
    ]
    return faixas
      .map(([a, b, rot]) => {
        const l = base.filter((p) => p.duracao && p.duracao >= a && p.duracao < b)
        return { rotulo: rot, valor: med(l), n: l.length }
      })
      .filter((f) => f.n >= 5)
  }, [base])

  /* trilha */
  const trilha = useMemo(() => {
    const mus = base.filter((p) => p.audioTipo === 'musica')
    const ori = base.filter((p) => p.audioTipo === 'original')
    return { musica: { v: med(mus), n: mus.length }, original: { v: med(ori), n: ori.length } }
  }, [base])

  /* esforço x retorno mês a mês */
  const meses = useMemo(() => {
    const m = new Map<string, Analisado[]>()
    base.forEach((p) => {
      const k = p.postadoEm.slice(0, 7)
      m.set(k, [...(m.get(k) || []), p])
    })
    return [...m.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, l]) => ({
        mes: k,
        n: l.length,
        mediana: med(l),
        total: l.reduce((s, x) => s + x.views, 0),
      }))
  }, [base])

  if (base.length < 20)
    return (
      <p className="py-16 text-center text-[13px] text-muted">
        Ainda não há vídeos maduros suficientes no período para o diagnóstico.
      </p>
    )

  const topoMes = Math.max(...meses.map((m) => m.total), 1)
  const topoQtd = Math.max(...meses.map((m) => m.n), 1)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12px] text-muted">
        Base: {base.length} vídeos dos últimos 12 meses, com dez dias ou mais no ar e sem os de alcance comprado.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Bloco
          titulo="Quantos vídeos por dia"
          leitura={
            quedaRitmo > 0.1
              ? `Publicar quatro no mesmo dia custa ${pct(quedaRitmo)} do alcance de cada um. Chamadas de curso ficaram fora desta conta.`
              : 'O volume diário não está atrapalhando o alcance por enquanto.'
          }
        >
          <Barras faixas={ritmo} />
        </Bloco>

        <Bloco titulo="Formato do vídeo" leitura="O jeito de contar pesa mais que a matéria. Vermelho é chamada de curso.">
          <Barras faixas={formatos} />
        </Bloco>

        <Bloco titulo="Horário da publicação" leitura="Mediana de views por faixa do dia.">
          <Barras faixas={horas} />
        </Bloco>

        <Bloco titulo="Dia da semana" leitura="Dia com pouco post costuma render mais — o volume do dia conta junto.">
          <Barras faixas={semana} />
        </Bloco>

        <Bloco titulo="Duração" leitura="Vídeo curto alcança mais gente; vídeo longo gera mais conversa.">
          <Barras faixas={duracoes} />
        </Bloco>

        <Bloco
          titulo="Chamada de curso no fim"
          leitura="Mesmo tipo de vídeo, com e sem o 'comente EU QUERO' no final."
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-green/40 bg-green/8 px-4 py-3">
              <p className="text-[22px] font-bold text-ink tabular-nums">{fmt(venda.sem.v)}</p>
              <p className="text-[11.5px] text-muted">sem chamada · {venda.sem.n} vídeos</p>
            </div>
            <div className="rounded-xl border border-red/40 bg-red/8 px-4 py-3">
              <p className="text-[22px] font-bold text-ink tabular-nums">{fmt(venda.com.v)}</p>
              <p className="text-[11.5px] text-muted">com chamada · {venda.com.n} vídeos</p>
            </div>
          </div>
        </Bloco>

        {trilha.musica.n >= 5 && (
          <Bloco titulo="Trilha por baixo da fala" leitura="Vídeo com faixa de música contra vídeo com só o áudio da gravação.">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-green/40 bg-green/8 px-4 py-3">
                <p className="text-[22px] font-bold text-ink tabular-nums">{fmt(trilha.musica.v)}</p>
                <p className="text-[11.5px] text-muted">com trilha · {trilha.musica.n} vídeos</p>
              </div>
              <div className="rounded-xl border border-border px-4 py-3">
                <p className="text-[22px] font-bold text-ink tabular-nums">{fmt(trilha.original.v)}</p>
                <p className="text-[11.5px] text-muted">só o áudio · {trilha.original.n} vídeos</p>
              </div>
            </div>
          </Bloco>
        )}

        <Bloco titulo="Assunto e taxa de acerto" leitura="Acerto = vídeos que passaram de 3× a mediana do mês em que saíram.">
          <div className="flex flex-col gap-1">
            {assuntos.map((a) => (
              <div key={a.tema} className="flex items-center gap-2.5 text-[12.5px]">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: corTema(a.tema) }} />
                <span className="flex-1 truncate text-ink-2" title={a.tema}>
                  {a.tema}
                </span>
                <span className="w-[54px] text-right tabular-nums text-muted">{a.n} víd.</span>
                <span className="w-[58px] text-right font-bold tabular-nums text-ink">{fmt(a.mediana)}</span>
                <span
                  className={
                    'w-[46px] text-right tabular-nums font-semibold ' +
                    (a.acerto >= 0.18 ? 'text-green' : a.acerto <= 0.08 ? 'text-red' : 'text-muted')
                  }
                >
                  {pct(a.acerto)}
                </span>
              </div>
            ))}
          </div>
        </Bloco>
      </div>

      <Bloco
        titulo="Esforço e retorno, mês a mês"
        leitura="Barra clara é quantos vídeos saíram; barra cheia é o total de views do mês. Quando a clara cresce e a cheia não acompanha, o vídeo extra está rendendo menos."
      >
        <div className="overflow-x-auto">
          <div className="flex items-end gap-2 min-w-[520px] h-[150px]">
            {meses.map((m) => (
              <div key={m.mes} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end" title={`${m.n} vídeos · ${fmt(m.total)} views · mediana ${fmt(m.mediana)}`}>
                <div className="w-full flex items-end justify-center gap-1 h-full">
                  <span className="w-[45%] rounded-t bg-brand/25" style={{ height: `${(m.n / topoQtd) * 100}%` }} />
                  <span className="w-[45%] rounded-t bg-brand" style={{ height: `${(m.total / topoMes) * 100}%` }} />
                </div>
                <span className="text-[10px] text-muted tabular-nums">{m.mes.slice(5)}/{m.mes.slice(2, 4)}</span>
              </div>
            ))}
          </div>
        </div>
      </Bloco>
    </div>
  )
}
