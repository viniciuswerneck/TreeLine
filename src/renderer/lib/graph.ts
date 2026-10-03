import type { CommitInfo } from '../../shared/types'

export interface GraphFork {
  /** Curva do dot (from) até a lane do pai na base da linha (to). */
  from: number
  to: number
}

export interface LaneCommit extends CommitInfo {
  lane: number
  /** Lanes de outros branches que atravessam esta linha na vertical. */
  through: number[]
  /** Curvas de merge/fork que saem do dot para baixo. */
  forks: GraphFork[]
}

/**
 * Lane engine puro-TS (sem I/O, testável com Vitest na Fase 1).
 * Primeiro pai herda a lane; demais pais abrem lanes novas.
 * Lanes de tips já processadas são reaproveitadas; lane que faz merge
 * em lane existente é liberada (evita vazamento de lanes).
 *
 * CONTRATOS:
 * 1. Entrada em ordem filho-antes-do-pai (`git log --topo-order`).
 *    Cada hash sem reserva ativa aloca lane nova — pai listado antes do
 *    filho nunca encontra reserva e abre coluna fantasma.
 * 2. SEMPRE layout sobre a lista completa; filtrar (busca, current-branch)
 *    DEPOIS. Filtrar antes remove elos da cadeia e cada commit restante
 *    vira lane nova (provado: c6,c4,c2 filtrados → lanes 0,1,2).
 * 3. Linha principal reta (estilo GitGraph): pais compartilhados ficam com
 *    o filho da spine (first-parent a partir do HEAD, depois outras tips).
 *    Se um filho fora da spine reservar primeiro, o filho da spine ROUBA
 *    (steal) e a linha do outro ganha a curva de divergência. Sem isso a
 *    main pula de lane no ponto do fork.
 * 4. Trilho aberto: lane nunca fechada por join/merge-back ou root estende
 *    o trilho até o fim do grafo (branch ainda aberto, como no GitGraph).
 */
export function layoutGraph(commits: CommitInfo[]): LaneCommit[] {
  const byHash = new Map<string, CommitInfo>()
  for (const c of commits) {
    if (!byHash.has(c.hash)) byHash.set(c.hash, c)
  }

  // Tips (sem filhos): HEAD primeiro para a linha principal ficar reta.
  const hasChild = new Set<string>()
  for (const c of commits) {
    for (const p of c.parents) {
      if (byHash.has(p)) hasChild.add(p)
    }
  }
  const headRow = commits.find((c) => c.refs.includes('HEAD'))
  const tips: CommitInfo[] = []
  if (headRow && !hasChild.has(headRow.hash)) tips.push(headRow)
  for (const c of commits) {
    if (!hasChild.has(c.hash) && c !== headRow) tips.push(c)
  }

  // Prioridade de spine: first-parent a partir de cada tip (menor vence).
  // Quem está fora de qualquer spine cai no MAX (comportamento antigo).
  const prio = new Map<string, number>()
  let n = 0
  for (const tip of tips) {
    let cur: CommitInfo | undefined = tip
    while (cur && !prio.has(cur.hash)) {
      prio.set(cur.hash, n++)
      const f: string | undefined = cur.parents[0]
      cur = f ? byHash.get(f) : undefined
    }
  }
  const P = (h: string): number => prio.get(h) ?? Number.MAX_SAFE_INTEGER

  const laneOf = new Map<string, number>()
  const holder = new Map<string, { lane: number; row: number; prio: number }>()
  const free: number[] = []
  const closedAt = new Map<number, number>()
  let next = 0
  const take = (): number => {
    if (free.length > 0) {
      const l = free.pop() as number
      closedAt.delete(l)
      return l
    }
    return next++
  }

  interface Interval {
    lane: number
    from: number
    to: number
  }
  const intervals: Interval[] = []
  const openInterval = new Map<string, Interval>()
  const rows: LaneCommit[] = []

  commits.forEach((c, row) => {
    let lane = laneOf.get(c.hash)
    if (lane === undefined) {
      lane = take()
    } else {
      laneOf.delete(c.hash)
      const iv = openInterval.get(c.hash)
      if (iv) {
        iv.to = row
        openInterval.delete(c.hash)
      }
    }

    const forks: GraphFork[] = []
    c.parents.forEach((p, i) => {
      const existing = laneOf.get(p)
      if (existing === undefined) {
        const nl = i === 0 ? (lane as number) : take()
        laneOf.set(p, nl)
        holder.set(p, { lane: nl, row, prio: P(c.hash) })
        const iv: Interval = { lane: nl, from: row, to: Number.MAX_SAFE_INTEGER }
        intervals.push(iv)
        openInterval.set(p, iv)
        if (i > 0) forks.push({ from: lane as number, to: nl })
      } else if (existing !== lane) {
        const h = holder.get(p)
        if (h && P(c.hash) < h.prio) {
          // STEAL: o filho da spine fica com o pai; o outro diverge (trilho segue aberto).
          laneOf.set(p, lane as number)
          holder.set(p, { lane: lane as number, row, prio: P(c.hash) })
          const iv = openInterval.get(p)
          if (iv) iv.to = row
          const niv: Interval = { lane: lane as number, from: row, to: Number.MAX_SAFE_INTEGER }
          intervals.push(niv)
          openInterval.set(p, niv)
          const hr = rows[h.row]
          if (hr && !hr.forks.some((f) => f.from === h.lane && f.to === lane)) {
            hr.forks.push({ from: h.lane, to: lane as number })
          }
        } else {
          // Join-back de verdade: a lane atual fecha aqui.
          forks.push({ from: lane as number, to: existing })
          closedAt.set(lane as number, row)
          if (i === 0) free.push(lane as number)
        }
      }
    })
    if (c.parents.length === 0) {
      closedAt.set(lane as number, row)
      free.push(lane as number)
    }

    rows.push({ ...c, lane: lane as number, through: [], forks })
  })

  // Pós-passe: through a partir dos intervalos + trilho aberto até o fim.
  const bottom = rows.length
  const lastUse = new Map<number, number>()
  const touch = (lane: number, row: number): void => {
    const prev = lastUse.get(lane)
    if (prev === undefined || row > prev) lastUse.set(lane, row)
  }
  rows.forEach((r, i) => {
    touch(r.lane, i)
    for (const f of r.forks) {
      touch(f.from, i)
      touch(f.to, i)
    }
  })
  for (const iv of intervals) {
    const to = iv.to === Number.MAX_SAFE_INTEGER ? bottom : iv.to
    for (let r = iv.from + 1; r < to; r++) {
      const row = rows[r]
      if (row && row.lane !== iv.lane && !row.through.includes(iv.lane)) row.through.push(iv.lane)
    }
    touch(iv.lane, Math.max(iv.from, Math.min(to, bottom) - 1))
  }
  // Trilho aberto: lane nunca fechada estende até o fim do grafo.
  for (const [lane, last] of lastUse) {
    if (!closedAt.has(lane)) {
      for (let r = last + 1; r < bottom; r++) {
        const row = rows[r]
        if (row && row.lane !== lane && !row.through.includes(lane)) row.through.push(lane)
      }
    }
  }
  for (const r of rows) r.through.sort((a, b) => a - b)
  return rows
}
