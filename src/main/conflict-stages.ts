import type { ConflictKind } from '../shared/types'

/** Uma linha de `git ls-files -u`: mode sha stage<TAB>path. */
export interface UnmergedEntry {
  sha: string
  stage: number
  path: string
}

/**
 * Linhas de `git ls-files -u` (`mode sha stage<TAB>path`).
 *
 * O main sempre chama com `-z`, e no modo `-z` o separador de registro é NUL
 * (o path é o último campo). Splittar por `\n` — como na primeira versão —
 * colava os 3 estágios num path só.
 */
export function parseLsFilesU(raw: string): UnmergedEntry[] {
  const out: UnmergedEntry[] = []
  for (const line of raw.split('\0')) {
    if (!line.trim()) continue
    const tab = line.indexOf('\t')
    if (tab < 0) continue
    const meta = line.slice(0, tab).trim().split(/\s+/)
    out.push({ sha: meta[1] ?? '', stage: Number(meta[2]), path: line.slice(tab + 1) })
  }
  return out
}

/**
 * Tipo de conflito. `stages` vem do index (`ls-files -u`), que é a fonte
 * autoritativa: o XY do porcelain sozinho não distingue "add/add" de
 * "modify/modify" quando os dois lados criaram o arquivo.
 */
export function conflictKindOf(xy: string, stages: number[]): ConflictKind {
  const has = (s: number): boolean => stages.includes(s)
  // O index manda, não o XY. Pelo `git status`, DU = "deleted by us" e
  // UD = "deleted by them" — e é o estágio ausente que diz qual é: sem stage 2
  // o NOSSO lado foi apagado, sem stage 3 o DELE. Descobrir isso pelo XY já
  // errou uma vez (DU/UD trocados), então o XY é só o desempate.
  if (!has(1) && has(2) && has(3)) return 'both-added'
  if (xy.startsWith('DD') || (has(1) && !has(2) && !has(3))) return 'both-deleted'
  if (has(1) && has(2) && !has(3)) return 'deleted-by-them'
  if (has(1) && has(3) && !has(2)) return 'deleted-by-us'
  if (has(1) && has(2) && has(3)) return 'both-modified'
  if (xy.startsWith('UU')) return 'both-modified'
  return 'binary'
}

/** Byte NUL nos primeiros 4 KB = binário: não tenta parsear como texto. */
export function looksBinary(buf: Buffer): boolean {
  return buf.subarray(0, 4096).includes(0)
}

/** `refs/remotes/origin/develop` -> `origin/develop`; sem ref, cai no sha. */
export function shortRef(name: string): string {
  return name.replace(/^refs\/(remotes\/|heads\/|tags\/)/, '')
}

/**
 * XY + path dos unmerged em `git status --porcelain=v2 -z`.
 *
 * Formato real (medido em repo com conflito, não de memória):
 *
 *   u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>NUL
 *
 * O NUL fecha o REGISTRO inteiro, não separa o path: o path é o resto da
 * linha depois dos 7 campos de metadado, separado por espaço (e pode ele
 * mesmo ter espaços). Duas versões erradas deste parser existiram — uma
 * procurava TAB, outra pegava o campo seguinte — e as duas faziam a lista de
 * conflitos sair com path de outro arquivo. Por isso a regex fixa os 7 campos
 * e deixa o resto para o path.
 */
const UNMERGED_RE = /^u (\S+) \S+ (?:\S+ ){7}([\s\S]*)$/

export function parseUnmergedXY(raw: string): Array<{ xy: string; path: string }> {
  const out: Array<{ xy: string; path: string }> = []
  for (const rec of raw.split('\0')) {
    if (!rec.startsWith('u ')) continue
    const m = UNMERGED_RE.exec(rec)
    if (!m || !m[2]) continue
    out.push({ xy: m[1], path: m[2] })
  }
  return out
}

/** Estágios presentes por path, do `ls-files -u`. */
export function stagesByPath(entries: UnmergedEntry[]): Map<string, number[]> {
  const map = new Map<string, number[]>()
  for (const e of entries) {
    const list = map.get(e.path) ?? []
    list.push(e.stage)
    map.set(e.path, list)
  }
  for (const list of map.values()) list.sort()
  return map
}
