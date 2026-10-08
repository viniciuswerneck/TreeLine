import { realpathSync } from 'node:fs'
import { dirname, join, normalize, sep } from 'node:path'
import type { UILang } from '../messages'
import { mx } from '../messages'

export function assertSafeRef(name: string, lang: UILang, key = 'invalidRef'): void {
  const n = (name || '').trim()
  // `startsWith('-')`: option injection — `--force`, `-c core.sshCommand=…`,
  // `--upload-pack=` viram opções do git quando a ref vai crua para argv.
  if (
    !n ||
    n.startsWith('-') ||
    n.includes('..') ||
    n.includes('~') ||
    n.includes('^') ||
    n.includes(':') ||
    n.startsWith('/') ||
    n.endsWith('/')
  ) {
    throw new Error(mx(lang, key, { n }))
  }
}

/** realpath do alvo; arquivo ainda inexistente resolve pelo ancestral existente. */
function real(target: string): string {
  let cur = target
  for (;;) {
    try {
      return realpathSync(cur)
    } catch {
      const parent = dirname(cur)
      if (parent === cur) return target
      cur = parent
    }
  }
}

/**
 * Path relativo seguro dentro de `root` (paths do git são relativos ao cwd).
 * Além do check textual de `..`, compara o **realpath**: symlink dentro do
 * repo apontando para fora não vira escrita/`trashItem` fora dele.
 */
export function relPathSafe(root: string, p: string, lang: UILang): string {
  const rp = p.replace(/\\/g, '/')
  const np = normalize(join(root, rp))
  const nr = normalize(root)
  if (np === nr) return '.'
  if (!np.startsWith(nr + sep) && np !== nr) {
    throw new Error(mx(lang, 'pathOutOfRepo', { p: rp }))
  }
  const realRoot = real(root)
  const realTarget = real(np)
  if (realTarget !== realRoot && !realTarget.startsWith(realRoot + sep)) {
    throw new Error(mx(lang, 'pathOutOfRepo', { p: rp }))
  }
  return rp
}

export function assertRefName(name: string, lang: UILang): void {
  assertSafeRef(name, lang, 'invalidRefName')
}

export function assertCloneUrl(u: string, lang: UILang): void {
  const s = (u || '').trim()
  if (!s) throw new Error(mx(lang, 'cloneInvalidUrl'))
  const bad = /^(file:|localhost|127\.|::1|ext::|-)/i
  if (bad.test(s)) throw new Error(mx(lang, 'cloneUnsafeUrl'))
  if (/[\r\n]/.test(s)) throw new Error(mx(lang, 'cloneInvalidUrl'))
}
