import { app, screen } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

/**
 * Geometria da janela persistida entre sessões (tamanho/posição/maximizado).
 * A posição é validada contra os monitores atuais — um monitor removido não
 * pode jogar a janela para fora da tela.
 */
export interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

const FALLBACK: WindowState = { width: 1280, height: 800, maximized: false }

function windowStateFile(): string {
  return join(app.getPath('userData'), 'window.json')
}

export async function readWindowState(): Promise<WindowState | null> {
  try {
    const raw = JSON.parse(await fs.readFile(windowStateFile(), 'utf-8')) as Partial<WindowState>
    if (typeof raw.width !== 'number' || typeof raw.height !== 'number') return null
    return {
      x: typeof raw.x === 'number' ? raw.x : undefined,
      y: typeof raw.y === 'number' ? raw.y : undefined,
      width: Math.max(960, Math.round(raw.width)),
      height: Math.max(600, Math.round(raw.height)),
      maximized: raw.maximized === true
    }
  } catch {
    return null
  }
}

/** Descarta x/y órfãos (monitor removido); mantém dimensões. */
export function placeWindow(saved: WindowState | null): WindowState {
  if (!saved) return FALLBACK
  if (saved.x === undefined || saved.y === undefined) return saved
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea
    return (
      saved.x! < a.x + a.width &&
      saved.x! + saved.width > a.x &&
      saved.y! < a.y + a.height &&
      saved.y! + saved.height > a.y
    )
  })
  return visible ? saved : { width: saved.width, height: saved.height, maximized: saved.maximized }
}

export function writeWindowState(state: WindowState): void {
  void fs.writeFile(windowStateFile(), JSON.stringify(state)).catch(() => undefined)
}
