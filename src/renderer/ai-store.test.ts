import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiStatus } from '../shared/types'

const installed: AiStatus = {
  installed: true,
  path: '/usr/bin/opencode',
  version: '1.18.35',
  configPath: null,
  model: null
}
const missing: AiStatus = { installed: false, path: null, version: null, configPath: null, model: null }

function makeLocalStorage(): {
  getItem: (k: string) => string | null
  setItem: (k: string, v: string) => void
  removeItem: (k: string) => void
} {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      m.set(k, v)
    },
    removeItem: (k) => {
      m.delete(k)
    }
  }
}

/** Reimporta o módulo com globais frescos (o store é criado no import). */
async function loadStore(detectImpl: () => Promise<AiStatus>): Promise<{
  mod: typeof import('./ai-store')
  ls: ReturnType<typeof makeLocalStorage>
}> {
  vi.resetModules()
  const ls = makeLocalStorage()
  vi.stubGlobal('localStorage', ls)
  vi.stubGlobal('window', { treeline: { aiDetect: detectImpl } })
  const mod = await import('./ai-store')
  return { mod, ls }
}

describe('ai-store', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('detect guarda o status e mantém desligado por padrão', async () => {
    const { mod } = await loadStore(async () => installed)
    await mod.useAiStore.getState().detect()
    expect(mod.useAiStore.getState().status?.installed).toBe(true)
    expect(mod.useAiStore.getState().enabled).toBe(false)
  })

  it('setEnabled liga e persiste no localStorage', async () => {
    const { mod, ls } = await loadStore(async () => installed)
    mod.useAiStore.getState().setEnabled(true)
    expect(mod.useAiStore.getState().enabled).toBe(true)
    expect(ls.getItem('treeline-ai-enabled')).toBe('1')
  })

  it('detect desliga enabled quando o binário não existe', async () => {
    const { mod } = await loadStore(async () => missing)
    mod.useAiStore.getState().setEnabled(true)
    await mod.useAiStore.getState().detect()
    expect(mod.useAiStore.getState().enabled).toBe(false)
  })

  it('detect tolera falha do IPC', async () => {
    const { mod } = await loadStore(async () => {
      throw new Error('ipc down')
    })
    await mod.useAiStore.getState().detect()
    expect(mod.useAiStore.getState().loading).toBe(false)
    expect(mod.useAiStore.getState().status).toBeNull()
  })

  it('dismissSuggestion persiste a dispensa', async () => {
    const { mod, ls } = await loadStore(async () => installed)
    mod.useAiStore.getState().dismissSuggestion()
    expect(mod.useAiStore.getState().suggestionDismissed).toBe(true)
    expect(ls.getItem('treeline-ai-suggestion-dismissed')).toBe('1')
  })

  it('shouldSuggest só quando instalado, desligado e não dispensado', async () => {
    const { mod } = await loadStore(async () => installed)
    expect(mod.shouldSuggest(installed, false, false)).toBe(true)
    expect(mod.shouldSuggest(installed, true, false)).toBe(false)
    expect(mod.shouldSuggest(installed, false, true)).toBe(false)
    expect(mod.shouldSuggest(missing, false, false)).toBe(false)
    expect(mod.shouldSuggest(null, false, false)).toBe(false)
  })
})
