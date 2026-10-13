// Servidor embutido do opencode: sobe `opencode serve` em loopback sob
// demanda, repassa os eventos SSE ao renderer e expõe a API via IPC.
//
// Ciclo de vida: o processo é filho do main e morre no `will-quit`. O app
// funciona 100% sem ele; nada aqui roda se o usuário não ativar o assistente
// (os handlers chamam `ensureServer()` só quando requisitados).

import { spawn, type ChildProcess } from 'node:child_process'
import { app, BrowserWindow, ipcMain } from 'electron'
import type { AiEvent, AiServerStatus } from '../../shared/types'
import { normalizePermission } from '../../shared/ai'
import { findOpencode } from './detect'
import { OpencodeClient } from './client'

interface Running {
  proc: ChildProcess
  url: string
  pid: number
}

let running: Running | null = null
let startError: string | null = null
let starting: Promise<AiServerStatus> | null = null

// O SSE do opencode é *escopado por diretório*: `GET /event` sem `?directory=`
// só emite `server.connected`/heartbeat. Por isso mantemos uma assinatura por
// diretório ativo (idempotente) e repassamos tudo ao renderer, que já filtra
// por sessionID.
const subs = new Map<string, AbortController>()

function broadcast(ev: AiEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('treeline:aiEvent', ev)
  }
}

function statusOf(): AiServerStatus {
  return {
    running: !!running,
    url: running?.url ?? null,
    pid: running?.pid ?? null,
    error: startError
  }
}

/** Lê os eventos SSE de um diretório e repassa ao renderer. */
function subscribeEvents(url: string, directory: string): void {
  if (subs.has(directory)) return
  const ctrl = new AbortController()
  subs.set(directory, ctrl)
  void (async () => {
    try {
      const res = await fetch(`${url}/event?directory=${encodeURIComponent(directory)}`, { signal: ctrl.signal })
      if (!res.body) return
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let idx: number
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          const line = chunk.split('\n').find((l) => l.startsWith('data:'))
          if (!line) continue
          try {
            broadcast(JSON.parse(line.slice(5).trim()) as AiEvent)
          } catch {
            /* linha não-JSON: ignora */
          }
        }
      }
    } catch {
      /* abortado ou servidor morreu */
    } finally {
      if (subs.get(directory) === ctrl) subs.delete(directory)
    }
  })()
}

/** Garante a assinatura SSE do diretório ativo (chamado nas ações por repo). */
export function watchDirectory(directory: string | undefined): void {
  if (running && directory) subscribeEvents(running.url, directory)
}

/** Sobe o servidor (idempotente). Lança se `opencode` não existir. */
export function ensureServer(): Promise<AiServerStatus> {
  if (running) return Promise.resolve(statusOf())
  if (starting) return starting
  starting = (async () => {
    startError = null
    const bin = await findOpencode()
    if (!bin) {
      startError = 'opencode não encontrado no PATH'
      throw new Error(startError)
    }
    const proc = spawn(bin, ['serve', '--hostname', '127.0.0.1', '--port', '0'], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const url = await new Promise<string>((resolve, reject) => {
      let out = ''
      const timer = setTimeout(() => reject(new Error('timeout ao subir o opencode serve')), 20_000)
      const onData = (d: Buffer): void => {
        out += d.toString()
        const m = out.match(/(https?:\/\/127\.0\.0\.1:\d+)/)
        if (m) {
          clearTimeout(timer)
          resolve(m[1])
        }
      }
      proc.stdout?.on('data', onData)
      proc.stderr?.on('data', onData)
      proc.once('exit', (code) => {
        clearTimeout(timer)
        reject(new Error(`opencode serve saiu com código ${code}`))
      })
    }).catch((e: unknown) => {
      try {
        proc.kill()
      } catch {
        /* já morreu */
      }
      throw e
    })

    running = { proc, url, pid: proc.pid ?? -1 }
    proc.once('exit', () => {
      running = null
    })
    await new OpencodeClient(url).health()
    return statusOf()
  })()
    .catch((e: unknown) => {
      startError = e instanceof Error ? e.message : String(e)
      throw e
    })
    .finally(() => {
      starting = null
    })
  return starting
}

/** Derruba o servidor (idempotente). */
export function stopServer(): AiServerStatus {
  if (running) {
    for (const ctrl of subs.values()) ctrl.abort()
    subs.clear()
    try {
      running.proc.kill()
    } catch {
      /* já morreu */
    }
    running = null
  }
  return statusOf()
}

/** Cliente pronto (sobe o servidor se preciso). */
export async function getClient(): Promise<OpencodeClient> {
  const st = await ensureServer()
  if (!st.url) throw new Error(st.error ?? 'servidor do opencode indisponível')
  return new OpencodeClient(st.url)
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
ipcMain.handle('treeline:aiServerStatus', () => statusOf())
ipcMain.handle('treeline:aiServerStart', () => ensureServer().catch(() => statusOf()))
ipcMain.handle('treeline:aiServerStop', () => stopServer())
ipcMain.handle('treeline:aiServerRestart', async () => {
  stopServer()
  return ensureServer().catch(() => statusOf())
})
ipcMain.handle('treeline:aiAgents', async () => (await getClient()).agents())
ipcMain.handle('treeline:aiModels', async () => (await getClient()).models())
ipcMain.handle('treeline:aiSessions', async (_e, directory?: string) => {
  const c = await getClient()
  watchDirectory(directory)
  return c.sessions(directory)
})
ipcMain.handle('treeline:aiSessionCreate', async (_e, directory: string, opts?: Parameters<OpencodeClient['createSession']>[1]) => {
  const c = await getClient()
  watchDirectory(directory)
  return c.createSession(directory, opts)
})
ipcMain.handle('treeline:aiSessionDelete', async (_e, sessionID: string) => (await getClient()).deleteSession(sessionID))
ipcMain.handle('treeline:aiMessages', async (_e, sessionID: string, directory?: string) => {
  const c = await getClient()
  watchDirectory(directory)
  return c.messages(sessionID, directory)
})
ipcMain.handle(
  'treeline:aiSend',
  async (_e, sessionID: string, directory: string, text: string, opts?: Parameters<OpencodeClient['promptAsync']>[3]) => {
    const c = await getClient()
    watchDirectory(directory)
    return c.promptAsync(sessionID, directory, text, opts)
  }
)
ipcMain.handle('treeline:aiAbort', async (_e, sessionID: string) => (await getClient()).abort(sessionID))
ipcMain.handle(
  'treeline:aiPermissionReply',
  async (_e, sessionID: string, requestID: string, response: 'once' | 'always' | 'reject') => {
    const norm = normalizePermission({ type: 'permission.asked', properties: { id: requestID, sessionID } })
    const req = norm ?? { id: requestID, sessionID, title: requestID, kind: 'permission', scheme: 'classic' as const }
    await (await getClient()).permissionReply(req, response)
  }
)

app.on('will-quit', () => stopServer())
