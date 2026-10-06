/**
 * Motor de resolução de conflito de 3 vias: PARSE dos marcadores + escolha
 * por região. Sem I/O e sem React — o main roda `git merge-file --object-id
 * --zdiff3` (que já devolve base/ours/theirs por região) e o renderer só
 * interpreta o texto.
 *
 * Por que o diff3 é do git e não nosso: o `zdiff3` do git é o mesmo que o
 * `git mergetool` mostra e o mesmo que o `git checkout --conflict=zdiff3`
 * escreve no worktree. Reescrever o algoritmo (Myers + zdiff3) seria ~300
 * linhas de bug esperando. O que é nosso é a PARSE dos marcadores e a
 * APLICAÇÃO das escolhas, que é o que a UI precisa.
 *
 * CONTRATOS:
 * 1. `parseRegions` é STATEFUL: só reconhece um marcador quando ele está na
 *    posição esperada do parser. Conteúdo do arquivo pode ter linhas
 *    `<<<<<<<` / `=======` de verdade (string literal, diff colado) — elas
 *    viram texto normal. Só saímos de uma fase pelo marcador exato da
 *    próxima fase.
 * 2. Regiões vêm em ordem de arquivo. `clean` carrega as linhas já
 *    reconciliadas pelo git (inclui o auto-merge de trechos sem sobreposição).
 * 3. `choice` começa NULA: uma região de conflito nasce indecisa e a UI
 *    precisa de uma escolha explícita antes de salvar. Default implícito
 *    seria traiçoeiro (o usuário stageia sem ter olhado).
 * 4. `oursMissing`/`theirsMissing` marcam delete/modify (estágio 2 ou 3
 *    ausente no index). Aceitar o lado ausente = apagar o arquivo, e não
 *    escrever string vazia.
 * 5. `applyChoices` recebe `trailingNewline` de `endsWithNewline(original)`:
 *    perder o `\n` final faria o `git diff` acusar "\ No newline at end of
 *    file" em todo arquivo resolvido.
 */

/** Escolha do usuário para uma região em conflito. `null` = indecisa. */
export type ConflictChoice = 'ours' | 'theirs' | 'base' | 'both' | 'both-reversed' | 'custom'

export type ConflictSide = 'clean' | 'conflict'

/** Uma região do arquivo: já reconciliada (`clean`) ou em conflito. */
export interface ConflictRegion {
  kind: ConflictSide
  /** Linhas reconciliadas (só em `clean`). */
  lines: string[]
  /** Conteúdo da base comum (stage 1), linha a linha. */
  base: string[]
  /** Conteúdo do nosso lado (stage 2 = HEAD/current). */
  ours: string[]
  /** Conteúdo do lado deles (stage 3 = MERGE_HEAD/theirs). */
  theirs: string[]
  /** Escolha atual; `null` enquanto o usuário não decidir. */
  choice: ConflictChoice | null
  /** Texto editado à mão quando `choice === 'custom'`. */
  custom?: string
  /** Stage 2 ausente no index (deleted-by-them): aceitar = apagar arquivo. */
  oursMissing?: boolean
  /** Stage 3 ausente no index (deleted-by-us): aceitar = apagar arquivo. */
  theirsMissing?: boolean
}

/** Rótulos que o main injeta em `-L ours -L base -L theirs`. */
export const MARKER_LABELS = { ours: 'ours', base: 'base', theirs: 'theirs' } as const

const MARK = 7
const OPEN = '<'.repeat(MARK)
const BAR = '|'.repeat(MARK)
const EQ = '='.repeat(MARK)
const CLOSE = '>'.repeat(MARK)

/** Linha de marcador = marcador + espaço + rótulo (`<<<<<<< ours`, `||||||| base`). */
function isLabelled(line: string, marker: string, label: string): boolean {
  return line === marker + ' ' + label
}

/**
 * Separador entre base e theirs: `=======` SEM espaço e SEM rótulo. Não
 * passar por `isLabelled(…, '')` — isso exigiria um espaço à direita que o
 * git não escreve (confirmado com `cat -A` no output do `merge-file`).
 */
function isSeparator(line: string, marker: string): boolean {
  return line === marker
}

/** Divide texto em linhas, sem o `''` fantasma do split de texto terminado em \n. */
export function toLines(text: string): string[] {
  if (text === '') return []
  const out = text.split('\n')
  if (out.length > 0 && out[out.length - 1] === '') out.pop()
  return out
}

/** Reconstrói texto a partir de linhas (invólucro de `toLines`). */
export function toText(lines: string[]): string {
  return lines.length === 0 ? '' : lines.join('\n')
}

/**
 * O arquivo original terminava em `\n`? Todo arquivo POSIX termina, e perder
 * esse byte faz o `git diff` mostrar "\ No newline at end of file" em TODOS os
 * arquivos resolvidos — e ainda pior, o stage do resultado difere do que o
 * usuário vê no editor. Por isso a flag viaja de `parseRegions` até
 * `applyChoices` em vez de ser adivinhada.
 */
export function endsWithNewline(text: string): boolean {
  return text.length > 0 && text.endsWith('\n')
}

function clean(lines: string[]): ConflictRegion {
  return { kind: 'clean', lines, base: [], ours: [], theirs: [], choice: null }
}

/**
 * Parse do texto do `git merge-file --zdiff3` em regiões.
 *
 * Statefulness é o contrato 1: `<<<<<<<` só abre região fora de um
 * conflito; dentro do lado `ours` um `<<<<<<<` do conteúdo é linha comum.
 */
export function parseRegions(text: string): ConflictRegion[] {
  const regions: ConflictRegion[] = []
  let pending: string[] = []
  let phase: 'none' | 'ours' | 'base' | 'theirs' = 'none'
  let ours: string[] = []
  let base: string[] = []
  let theirs: string[] = []

  const flushClean = (): void => {
    if (pending.length > 0) {
      regions.push(clean(pending.splice(0, pending.length)))
    }
  }

  for (const line of toLines(text)) {
    if (phase === 'none') {
      if (isLabelled(line, OPEN, MARKER_LABELS.ours)) {
        flushClean()
        phase = 'ours'
      } else {
        pending.push(line)
      }
      continue
    }
    if (phase === 'ours') {
      if (isLabelled(line, BAR, MARKER_LABELS.base)) phase = 'base'
      else if (isSeparator(line, EQ)) phase = 'theirs'
      else ours.push(line)
      continue
    }
    if (phase === 'base') {
      if (isSeparator(line, EQ)) phase = 'theirs'
      else base.push(line)
      continue
    }
    // phase === 'theirs'
    if (isLabelled(line, CLOSE, MARKER_LABELS.theirs)) {
      flushClean()
      regions.push({ kind: 'conflict', lines: [], base, ours, theirs, choice: null })
      ours = []
      base = []
      theirs = []
      phase = 'none'
    } else {
      theirs.push(line)
    }
  }

  // Texto sem conflito nenhum never abre região: só sobrou `pending`.
  flushClean()
  return regions
}

/**
 * Região única de arquivo inteiro para delete/modify, que NÃO tem marcadores
 * no worktree (o git resolve o conteúdo e só o index fica unmerged).
 * `presentIsOurs`: o stage sobreviveu é o 2 (deleted-by-them) ou o 3
 * (deleted-by-us).
 */
export function missingSideRegion(
  present: string[],
  presentIsOurs: boolean,
  flags: { oursMissing?: boolean; theirsMissing?: boolean } = {}
): ConflictRegion {
  return {
    kind: 'conflict',
    lines: [],
    base: [],
    ours: presentIsOurs ? present : [],
    theirs: presentIsOurs ? [] : present,
    choice: null,
    ...flags
  }
}

/** Escolha a aplicar numa região; devolve as linhas e se isso apaga o arquivo. */
export function resolveRegion(r: ConflictRegion): { lines: string[]; del: boolean } {
  if (r.kind === 'clean') return { lines: r.lines, del: false }
  switch (r.choice) {
    case 'ours':
      return { lines: r.ours, del: r.oursMissing === true }
    case 'theirs':
      return { lines: r.theirs, del: r.theirsMissing === true }
    case 'base':
      return { lines: r.base, del: false }
    case 'both':
      return { lines: [...r.ours, ...r.theirs], del: false }
    case 'both-reversed':
      return { lines: [...r.theirs, ...r.ours], del: false }
    case 'custom':
      return { lines: toLines(r.custom ?? ''), del: false }
    default:
      // Indecisa: devolve o lado nosso como prévia, mas o caller trata
      // `unresolved` como bloqueio de stage.
      return { lines: r.ours, del: false }
  }
}

/** Escolha de uma região; imutável porque o estado mora no componente. */
export function setChoice(r: ConflictRegion, choice: ConflictChoice, custom?: string): ConflictRegion {
  const next: ConflictRegion = { ...r, choice }
  if (choice === 'custom') next.custom = custom ?? r.custom ?? ''
  return next
}

export interface ResolveResult {
  text: string
  /** Regiões em conflito sem escolha. */
  unresolved: number
  /** Regiões em conflito totais. */
  conflicts: number
  /** Alguma escolha implica apagar o arquivo (delete/modify resolvido). */
  deletes: boolean
  /** Não há região pendente de decisão — dá para salvar e stagear. */
  resolved: boolean
}

/**
 * Achata as regiões no texto final.
 *
 * `trailingNewline` tem que vir de `endsWithNewline(textoOriginal)`: sem ele
 * o resultado perde o `\n` final e o `git diff` acusa mudança em todo o fim
 * do arquivo (contrato 5).
 */
export function applyChoices(regions: ConflictRegion[], trailingNewline = true): ResolveResult {
  const out: string[] = []
  let unresolved = 0
  let conflicts = 0
  let deletes = false
  for (const r of regions) {
    const res = resolveRegion(r)
    if (r.kind === 'conflict') {
      conflicts++
      if (r.choice === null) unresolved++
    }
    if (res.del) deletes = true
    out.push(...res.lines)
  }
  const text = out.length === 0 ? '' : toText(out) + (trailingNewline ? '\n' : '')
  return { text, unresolved, conflicts, deletes, resolved: unresolved === 0 }
}

/** Aplica o mesmo choice em todas as regiões (botões "todos ours/theirs"). */
export function applyChoiceToAll(text: string, choice: ConflictChoice): ConflictRegion[] {
  return parseRegions(text).map((r) => (r.kind === 'clean' ? r : setChoice(r, choice)))
}

/** Só as regiões em conflito (barra de navegação). */
export function conflictRegions(regions: ConflictRegion[]): ConflictRegion[] {
  return regions.filter((r) => r.kind === 'conflict')
}

/** Índice da próxima região em conflito, com wrap (navegação `[` `]` / F8). */
export function stepConflict(regions: ConflictRegion[], current: number, delta: number): number {
  const total = conflictRegions(regions).length
  if (total === 0) return -1
  return (((current + delta) % total) + total) % total
}

/**
 * Ainda sobrou marcador no texto aplicado? O `merge-file` sempre escreve
 * marcadores de 7 chars + rótulo, então checamos as duas formas: a nossa
 * (com rótulo) e a genérica (usuário colou um diff no arquivo).
 */
export function hasMarkers(text: string): boolean {
  for (const line of toLines(text)) {
    if (line === OPEN || line === EQ || line === CLOSE) return true
    if (isLabelled(line, OPEN, MARKER_LABELS.ours)) return true
    if (isLabelled(line, CLOSE, MARKER_LABELS.theirs)) return true
  }
  return false
}
