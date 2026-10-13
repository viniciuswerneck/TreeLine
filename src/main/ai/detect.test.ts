import { describe, expect, it } from 'vitest'
import { extractModel, opencodeConfigPaths } from './detect'

describe('detect (opencode)', () => {
  it('extractModel lê a chave model', () => {
    expect(extractModel('{ "model": "anthropic/claude-3-5" }')).toBe('anthropic/claude-3-5')
    expect(extractModel('{\n  // comentário\n  "model": "openai/gpt-4o"\n}')).toBe('openai/gpt-4o')
  })

  it('extractModel retorna null sem model definido', () => {
    expect(extractModel('{ "$schema": "https://opencode.ai/config.json" }')).toBeNull()
    expect(extractModel('{ "model": "" }')).toBeNull()
    expect(extractModel('{}')).toBeNull()
  })

  it('opencodeConfigPaths respeita XDG_CONFIG_HOME', () => {
    const paths = opencodeConfigPaths({ XDG_CONFIG_HOME: '/tmp/xdg' } as NodeJS.ProcessEnv)
    expect(paths).toEqual([
      '/tmp/xdg/opencode/opencode.jsonc',
      '/tmp/xdg/opencode/opencode.json'
    ])
  })

  it('opencodeConfigPaths cai em ~/.config', () => {
    const paths = opencodeConfigPaths({} as NodeJS.ProcessEnv)
    expect(paths[0]).toMatch(/\.config\/opencode\/opencode\.jsonc$/)
    expect(paths).toHaveLength(2)
  })
})
