// Utilitário de semanas. Uma "semana" é identificada pela sua segunda-feira (YYYY-MM-DD).

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
function ymd(d: Date): string {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

/** Segunda-feira da semana que contém a data. */
export function mondayOf(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = (x.getDay() + 6) % 7 // 0 = segunda ... 6 = domingo
  x.setDate(x.getDate() - dow)
  return ymd(x)
}

export function currentMonday(): string {
  return mondayOf(new Date())
}

/** Semana de produção de uma gravação: Seg–Qua ficam na semana da data; Qui–Dom vão pra próxima. */
export function semanaDeGravacao(d: Date): string {
  const base = mondayOf(d)
  const dow = (d.getDay() + 6) % 7 // 0 = segunda ... 6 = domingo
  return dow >= 3 ? addWeeks(base, 1) : base
}

export function addWeeks(monday: string, n: number): string {
  const [y, m, d] = monday.split('-').map(Number)
  const x = new Date(y, m - 1, d)
  x.setDate(x.getDate() + n * 7)
  return ymd(x)
}

export function nextMonday(): string {
  return addWeeks(currentMonday(), 1)
}

/** Rótulo curto: "30/06 – 06/07". */
export function weekLabel(monday: string): string {
  const [y, m, d] = monday.split('-').map(Number)
  const a = new Date(y, m - 1, d)
  const b = new Date(y, m - 1, d + 6)
  return pad(a.getDate()) + '/' + pad(a.getMonth() + 1) + ' – ' + pad(b.getDate()) + '/' + pad(b.getMonth() + 1)
}
