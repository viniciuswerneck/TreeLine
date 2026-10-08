import { isAbsolute, join, normalize } from 'node:path'
import type { UILang } from '../messages'
import { asLang, mx } from '../messages'

export function assertSafeRef(name: string, lang: UILang, key = 'invalidRef'): void {
  const n = (name || '').trim()
  if (!n || n.includes('..') || n.includes('~') || n.includes('^') || n.includes(':') || n.startsWith('/') || n.endsWith('/')) {
    throw new Error(mx(lang, key, { n }))
  }
}

export function relPathSafe(root: string, p: string, lang: UILang): string {
  const rp = p.replace(/\\/g, '/')
  const np = normalize(join(root, rp))
  const nr = normalize(root)
  if (np === nr) return '.'
  if (!np.startsWith(nr + '/') && np !== nr) {
    throw new Error(mx(lang, 'pathOutOfRepo', { p: rp }))
  }
  return rp
}

export function assertRefName(name: string, lang: UILang): void {
  assertSafeRef(name, lang, 'invalidRefName')
}

export function assertRebasePlan(plan: string, lang: UILang): void {
  const p = plan.trim()
  if (!p) throw new Error(mx(lang, 'rebaseEmpty'))
  for (const line of p.split(/\r?\n/)) {
    const s = line.trim()
    if (!s) continue
    const [op] = s.split(/\s+/, 1)
    if (!['pick', 'p', 'reword', 'r', 'edit', 'e', 'squash', 's', 'fixup', 'f', 'drop', 'd', 'exec', 'x'].includes(op)) {
      throw new Error(mx(lang, 'rebaseInvalidOp', { op }))
    }
    if (op === 'exec' || op === 'x') {
      throw new Error(mx(lang, 'rebaseNoExec'))
    }
  }
}

export function assertCloneUrl(u: string, lang: UILang): void {
  const s = (u || '').trim()
  if (!s) throw new Error(mx(lang, 'cloneInvalidUrl'))
  const bad = /^(file:|localhost|127\.|::1|ext::|-)/i
  if (bad.test(s)) throw new Error(mx(lang, 'cloneUnsafeUrl'))
  if (/[\r\n]/.test(s)) throw new Error(mx(lang, 'cloneInvalidUrl'))
}
