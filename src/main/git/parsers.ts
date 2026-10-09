export interface NumstatEntry {
  path: string
  added: number
  deleted: number
}

/**
 * `git diff --numstat -z` em um stream de NUL. Um rename sai no formato
 * `added\tdel\t\0<old>\0<new>\0` — o fragmento inicial traz as colunas mas
 * SEM path, e os dois paths vêm separados por NUL. O path reportado é o
 * destino (o `<new>`), que é o que a UI procura no diff de um commit.
 */
export function parseNumstatZ(raw: string): NumstatEntry[] {
  const stats: NumstatEntry[] = []
  const frags = raw.split('\0')
  const num = (v: string): number => (v === '-' ? 0 : Number.parseInt(v, 10) || 0)
  let i = 0
  while (i < frags.length) {
    const f = frags[i] as string
    if (!f) {
      i++
      continue
    }
    const renamed = f.match(/^(\d+|-)\t(\d+|-)\t$/)
    if (renamed) {
      const oldP = frags[i + 1] as string | undefined
      const newP = frags[i + 2] as string | undefined
      const path = (newP || oldP || '').trim()
      if (path) stats.push({ path, added: num(renamed[1] as string), deleted: num(renamed[2] as string) })
      i += 3
      continue
    }
    const m = f.match(/^(\d+|-)\t(\d+|-)\t(.+)$/)
    if (m?.[3]) {
      stats.push({ path: m[3].trim(), added: num(m[1] as string), deleted: num(m[2] as string) })
    }
    i++
  }
  return stats
}