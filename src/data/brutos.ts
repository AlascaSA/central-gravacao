import { getTeam } from './team'

export interface Bruto {
  id: string
  nome: string
  mb: number | null
  seg: number | null
  thumb?: string | null
  criado?: string | null
  /** Mês/dia da PASTA real no Drive (ex: "Junho 2026" / "26"). Quando vazio, usa a data. */
  mes?: string | null
  dia?: string | null
  /** true quando já existe uma versão leve (720p) pronta pra tocar direto no player. */
  temProxy?: boolean
}

export async function listarBrutos(): Promise<Bruto[]> {
  if (!getTeam()) return [] // sem time escolhido: nada de brutos (evita o default 'jaylton' do endpoint com team vazio)
  const r = await fetch('/api/brutos?team=' + encodeURIComponent(getTeam()))
  if (!r.ok) {
    const t = await r.json().catch(() => ({}))
    throw new Error(t.error || 'Erro ' + r.status)
  }
  const data = await r.json()
  return Array.isArray(data.videos) ? (data.videos as Bruto[]) : []
}

// renomeia o arquivo no próprio Google Drive (exige conta de serviço com permissão de Editor)
export async function renomearBruto(id: string, nome: string): Promise<string> {
  const r = await fetch('/api/bruto-rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, nome }),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Erro ' + r.status)
  return d.nome as string
}
