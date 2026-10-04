import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Trava contra o bug "handler retorna função": todo IPC assíncrono passa
 * por `enqueue` (escrita serializada) ou `readOp` (leitura imediata).
 * Um `(async ...)` solto como retorno do handle devolve a FUNÇÃO ao
 * Electron ("An object could not be cloned") em vez da Promise —
 * bug real que quebrou getDiff/getHunks e esvaziou o app.
 */
describe('ipc handlers invocados', () => {
  const src = readFileSync(join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf-8')

  it('nenhum async solto fora de enqueue/readOp', () => {
    const lines = src.split('\n')
    const bad: string[] = []
    lines.forEach((l, i) => {
      // opener de IIFE: "(async" com ou sem espaço, exceto callbacks
      // legítimos (.then(async, new Promise(async) etc. — esses têm prefixo
      // diferente de início de expressão).
      if (/^  \( ?async[ (]/.test(l)) {
        bad.push(`${i + 1}: ${l.trim().slice(0, 60)}`)
      }
    })
    expect(bad).toEqual([])
  })

  it('readOp existe e invoca', () => {
    expect(src).toContain('function readOp<T>(fn: () => Promise<T>): Promise<T> {')
  })
})
