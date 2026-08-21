/**
 * O miolo da montagem de variações, sem saber onde está rodando.
 *
 * Quem chama: `scripts/montar-variacoes.mjs` (GitHub Actions, que é o caminho de
 * verdade) e `montador/index.js` (Cloud Run, caso um dia valha a pena). Os dois
 * entregam o mesmo pedido e recebem os mesmos avisos de progresso.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pastaDeSaida, baixar, subir } from './drive-montagem.mjs'
import { perfil, casam, emendar } from './ffmpeg-montagem.mjs'

/**
 * @param pedido  { pasta, codigo, combinacoes: [{nome, gancho, corpo, cta}] }
 * @param avisar  (evento) => void — 'saida', 'fonte', 'perfil', 'peca', 'fim'
 */
export async function rodarMontagem(pedido, avisar = () => {}) {
  const { pasta, codigo, combinacoes } = pedido
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'montagem-'))
  const estado = combinacoes.map(c => ({ nome: c.nome, estado: 'espera' }))
  let feitas = 0, enviadas = 0, falhas = 0

  try {
    const destino = await pastaDeSaida(pasta, 'Variações ' + (codigo || 'anúncios'))
    avisar({ tipo: 'saida', destino })

    // cada peça-fonte é baixada UMA vez, mesmo aparecendo em trinta combinações:
    // é isso que faz a multiplicação custar quase nada depois
    const usadas = new Map()
    for (const c of combinacoes) for (const p of [c.gancho, c.corpo, c.cta]) if (p) usadas.set(p.id, p)

    // o runner do GitHub tem ~14 GB livres. As fontes ficam em disco a rodada
    // inteira, então é melhor recusar antes de baixar do que quebrar no meio.
    const somaMb = [...usadas.values()].reduce((s, p) => s + (p.mb || 0), 0)
    const tetoMb = Number(process.env.TETO_FONTES_MB || 9000)
    if (somaMb > tetoMb) {
      throw new Error(
        `as peças somam ${(somaMb / 1000).toFixed(1)} GB e o limite é ${(tetoMb / 1000).toFixed(1)} GB — ` +
        `use versões mais leves das fontes ou monte em duas levas`)
    }

    const arquivo = new Map()
    for (const [id, p] of usadas) {
      const dest = path.join(tmp, `fonte-${id}.mp4`)
      await baixar(id, dest)
      arquivo.set(id, dest)
      avisar({ tipo: 'fonte', nome: p.nome })
    }

    // ffprobe decide antes: peças que casam viram cópia de bytes, ~1s cada
    const perfis = []
    for (const [, caminho] of arquivo) perfis.push(await perfil(caminho))
    const podeCopiar = casam(perfis)
    const alvo = perfis.find(p => p.largura) || {}
    avisar({ tipo: 'perfil', podeCopiar })

    const paralelo = Math.max(1, Number(process.env.PARALELO || 2))
    let proxima = 0
    async function trabalhador() {
      for (;;) {
        const i = proxima++
        if (i >= combinacoes.length) return
        const c = combinacoes[i]
        const partes = [c.gancho, c.corpo, c.cta].filter(Boolean).map(p => arquivo.get(p.id))
        const saida = path.join(tmp, `${c.nome}.mp4`)
        try {
          estado[i].estado = 'montando'
          await emendar(partes, saida, podeCopiar, alvo)
          estado[i].mb = Math.round(fs.statSync(saida).size / 1e6)
          feitas++
          estado[i].estado = 'enviando'
          await subir(saida, destino, c.nome + '.mp4')
          estado[i].estado = 'enviada'
          enviadas++
        } catch (e) {
          estado[i].estado = 'erro'
          estado[i].erro = String(e.message || e).slice(0, 160)
          falhas++
        } finally {
          if (fs.existsSync(saida)) fs.unlinkSync(saida) // solta o disco na hora
          avisar({ tipo: 'peca', i, estado, feitas, enviadas, falhas, destino })
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(paralelo, combinacoes.length) }, trabalhador))

    avisar({ tipo: 'fim', estado, feitas, enviadas, falhas, destino })
    return { destino, feitas, enviadas, falhas, estado }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}
