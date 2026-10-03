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
 * CONTRATOS (quebrar qualquer um vira staircase):
 * 1. Entrada em ordem filho-antes-do-pai (`git log --topo-order`).
 *    Cada hash sem reserva ativa aloca lane nova — pai listado antes do
 *    filho nunca encontra reserva e abre coluna fantasma.
 * 2. SEMPRE layout sobre a lista completa; filtrar (busca, current-branch)
 *    DEPOIS. Filtrar antes remove elos da cadeia e cada commit restante
 *    vira lane nova (provado: c6,c4,c2 filtrados → lanes 0,1,2).
 */
export function layoutGraph(commits: CommitInfo[]): LaneCommit[] {
  const laneOf = new Map<string, number>()
  const free: number[] = []
  let next = 0
  const take = (): number => (free.length > 0 ? (free.pop() as number) : next++)

  return commits.map((c) => {
    let lane = laneOf.get(c.hash)
    if (lane === undefined) lane = take()
    else laneOf.delete(c.hash)

    // Reservas ativas atravessam esta linha na vertical.
    const through = [...new Set(laneOf.values())].filter((l) => l !== lane).sort((a, b) => a - b)

    const forks: GraphFork[] = []
    c.parents.forEach((p, i) => {
      const existing = laneOf.get(p)
      if (existing === undefined) {
        const nl = i === 0 ? (lane as number) : take()
        laneOf.set(p, nl)
        if (i > 0) forks.push({ from: lane as number, to: nl })
      } else if (existing !== lane) {
        // Pai já corre em outra lane: curva até ela.
        forks.push({ from: lane as number, to: existing })
        if (i === 0) free.push(lane as number)
      }
    })
    // Root commit: a lane morre aqui.
    if (c.parents.length === 0) free.push(lane as number)

    return { ...c, lane: lane as number, through, forks }
  })
}
