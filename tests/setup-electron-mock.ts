// Mock do módulo `electron` para Vitest (Node puro importa o binário, sem API).
// O `ipcMain.handle` captura cada registro do motor para os testes invocarem
// o handler direto (sem janela), exercitando o fluxo git real ponta a ponta.
import { rmSync } from 'node:fs'
import { vi } from 'vitest'

const handlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => {
  const ipcMain = {
    handle(channel: string, fn: (...args: unknown[]) => unknown) {
      handlers.set(channel, fn)
    },
    on: ((_ch: string, _fn: unknown) => undefined) as unknown as typeof import('electron').ipcMain['on'],
    removeAllListeners: vi.fn()
  }
  return {
    ipcMain,
    app: {
      getVersion: () => '0.0.0-test',
      getPath: () => '/tmp/treeline-test-userdata',
      whenReady: async () => undefined,
      on: vi.fn(),
      quit: vi.fn()
    },
    dialog: {
      // vi.fn real: os testes trocam o retorno por caso via mockResolvedValue.
      showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ['/tmp'] })),
      showMessageBox: vi.fn(async () => ({ response: 0 }))
    },
    shell: {
      showItemInFolder: vi.fn(),
      openExternal: vi.fn(async () => undefined),
      // O descarte de untracked só é real se o mock apagar o arquivo.
      trashItem: vi.fn(async (p: string) => {
        rmSync(p, { recursive: true, force: true })
      })
    },
    clipboard: { writeText: vi.fn() },
    BrowserWindow: class BrowserWindowMock {
      static fromWebContents() {
        return null
      }
      static getAllWindows() {
        return []
      }
      webContents = { isDestroyed: () => false, send: vi.fn() }
      on(_event: string, _fn: unknown) {
        return this
      }
      isDestroyed() {
        return false
      }
    }
  }
})

// Registro acessível pelos testes: canal → função do handler.
;(globalThis as { __treelineHandlers?: Map<string, (...a: unknown[]) => unknown> }).__treelineHandlers =
  handlers