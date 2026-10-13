// Detecção do opencode (agente CLI) instalado na máquina — integração opcional.
// O TreeLine funciona 100% sem ele; quando existe, oferecemos o assistente.
// Aqui só rodamos `which`/`--version` e lemos o config: nada de rede/servidor.

import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ipcMain } from 'electron'
import type { AiStatus } from '../../shared/types'

/** Caminhos candidatos do config do opencode (segue XDG). */
export function opencodeConfigPaths(env: NodeJS.ProcessEnv = process.env): string[] {
  const base = env['XDG_CONFIG_HOME']?.trim() || join(homedir(), '.config')
  return [join(base, 'opencode', 'opencode.jsonc'), join(base, 'opencode', 'opencode.json')]
}

/**
 * Modelo padrão declarado no config (`"model": "provider/model"`). Leitura por
 * regex evita depender de um parser JSONC completo — só precisamos desta chave.
 */
export function extractModel(raw: string): string | null {
  const m = raw.match(/"model"\s*:\s*"([^"\n]+)"/)
  return m ? m[1].trim() || null : null
}

/** Localiza um executável no PATH. Usa o binário `which` (execFile não acha builtins). */
function which(cmd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('which', [cmd], (err, stdout) => resolve(err ? null : stdout.trim() || null))
  })
}

/** Caminho absoluto do binário `opencode`, ou null. Compartilhado com o server. */
export function findOpencode(): Promise<string | null> {
  return which('opencode')
}

/** Versão reportada por `opencode --version` (ex.: "1.18.35"). */
function versionOf(bin: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(bin, ['--version'], { timeout: 5_000 }, (err, stdout) => {
      if (err) return resolve(null)
      const out = String(stdout).trim()
      const m = out.match(/\d+\.\d+(?:\.\d+)?[^\s]*/)
      resolve(m ? m[0] : out || null)
    })
  })
}

/** Detecta binário, versão e config do opencode. Nunca lança. */
export async function detectOpencode(): Promise<AiStatus> {
  const bin = await findOpencode()
  if (!bin) return { installed: false, path: null, version: null, configPath: null, model: null }

  const version = await versionOf(bin)

  let configPath: string | null = null
  let model: string | null = null
  for (const p of opencodeConfigPaths()) {
    try {
      const raw = await fs.readFile(p, 'utf-8')
      configPath = p
      model = extractModel(raw)
      break
    } catch {
      /* tenta o próximo candidato */
    }
  }

  return { installed: true, path: bin, version, configPath, model }
}

ipcMain.handle('treeline:aiDetect', () => detectOpencode())
