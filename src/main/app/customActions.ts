// Custom Actions: comandos externos por repo (nome + shell), salvos em JSON
// no userData. Execução com timeout e saída truncada; tokens {{repo}} etc.
// substituídos com quote de shell (aspas simples).

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { app, ipcMain } from 'electron'
import { mx, asLang } from '../messages'
import { enqueue } from '../git/runner'

function customActionsFile(): string {
  return join(app.getPath('userData'), 'custom-actions.json')
}

async function readCustomActions(): Promise<import('../../shared/types').CustomAction[]> {
  try {
    const raw = await fs.readFile(customActionsFile(), 'utf-8')
    const list = JSON.parse(raw) as unknown
    if (!Array.isArray(list)) return []
    return list
      .filter((x): x is { name?: unknown; cmd?: unknown; id?: unknown; args?: unknown } => typeof x === 'object' && x !== null)
      .map((x, i) => ({
        id: typeof x.id === 'string' && x.id ? x.id : `ca-${Date.now()}-${i}`,
        name: typeof x.name === 'string' ? x.name : '',
        cmd: typeof x.cmd === 'string' ? x.cmd : '',
        args: Array.isArray(x.args) ? x.args.filter((a): a is string => typeof a === 'string').slice(0, 20) : []
      }))
      .filter((x) => x.name.trim() && x.cmd.trim())
  } catch {
    return []
  }
}

/** Substitui tokens {{repo}} etc. em cmd/args de custom action. */
function expandActionTokens(s: string, ctx: import('../../shared/types').ActionContext): string {
  const map: Record<string, string> = {
    repo: ctx.repo ?? '',
    branch: ctx.branch ?? '',
    remoteBranch: ctx.remoteBranch ?? '',
    file: ctx.file ?? '',
    commit: ctx.commit ?? ''
  }
  return s.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(map, key) ? shellQuote(map[key]) : whole
  )
}

/** Aspas simples para shell quando o valor tiver espaço ou metacaractere. */
function shellQuote(v: string): string {
  if (v === '') return "''"
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(v) ? v : `'${v.replace(/'/g, `'\\''`)}'`
}

ipcMain.handle('treeline:getCustomActions', async () => readCustomActions())

ipcMain.handle(
  'treeline:saveCustomAction',
  async (_event, a: { id?: string; name: string; cmd: string; args?: string[] }) => {
    const list = await readCustomActions()
    const args = Array.isArray(a.args)
      ? a.args.map((x) => String(x).slice(0, 200)).filter((x) => x.trim()).slice(0, 20)
      : []
    const clean = {
      id: a.id?.trim() || `ca-${Date.now()}`,
      name: a.name.trim().slice(0, 80),
      cmd: a.cmd.trim().slice(0, 2000),
      args
    }
    if (!clean.name || !clean.cmd) throw new Error('empty')
    const next = [clean, ...list.filter((x) => x.id !== clean.id)].slice(0, 50)
    await fs.mkdir(app.getPath('userData'), { recursive: true })
    await fs.writeFile(customActionsFile(), JSON.stringify(next, null, 2))
    return next
  }
)

ipcMain.handle('treeline:deleteCustomAction', async (_event, id: string) => {
  const next = (await readCustomActions()).filter((x) => x.id !== id)
  await fs.writeFile(customActionsFile(), JSON.stringify(next, null, 2))
  return next
})

ipcMain.handle(
  'treeline:runCustomAction',
  (_event, repo: string, id: string, ctx?: import('../../shared/types').ActionContext, lang?: unknown) =>
    enqueue(repo, async (): Promise<import('../../shared/types').ActionResult> => {
      const l = asLang(lang)
      const found = (await readCustomActions()).find((x) => x.id === id)
      if (!found) throw new Error(mx(l, 'nameInvalid', { x: id }))
      const context: import('../../shared/types').ActionContext = { repo, ...(ctx ?? {}) }
      // Uma passada só por token: um valor com `{{...}}` literal não é reexpandido.
      const script = [
        expandActionTokens(found.cmd, context),
        ...found.args.map((a) => expandActionTokens(a, context))
      ].join(' ')
      return new Promise<import('../../shared/types').ActionResult>((resolve, reject) => {
        const cp = require('node:child_process') as typeof import('node:child_process')
        const child = cp.spawn('sh', ['-c', script], {
          cwd: repo,
          timeout: 60_000,
          env: { ...process.env, TERM: 'xterm-256color', FORCE_COLOR: '1', CLICOLOR_FORCE: '1' }
        })
        let out = ''
        child.stdout?.on('data', (d) => {
          out += String(d)
          if (out.length > 20000) out = out.slice(-20000)
        })
        child.stderr?.on('data', (d) => {
          out += String(d)
          if (out.length > 20000) out = out.slice(-20000)
        })
        child.on('error', (e) => reject(e instanceof Error ? e : new Error(String(e))))
        child.on('close', (code) => resolve({ code, output: out.trim().slice(-8000) }))
      })
    })
)