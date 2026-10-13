import { defineConfig } from 'vitest/config'

/** Config global dos testes do TreeLine.
 *  - setupFiles: mock do módulo `electron` (node não expõe o objeto `ipcMain`),
 *    necessário para importar os módulos do motor `src/main/git/*` em testes.
 *  - include: integração em `tests/**` E unitários colocados ao lado do código
 *    em `src` (search/ansi/shortcuts) — antes os testes em `src` existiam
 *    mas nunca eram executados.
 *  - coverage: motor git (`src/main/git/**`) com piso 70% (Camada 0, item C0/2).
 *    `branches` fica mais baixo de propósito: cobre ramos de erro/defensivos
 *    difíceis de atingir sem inflar o harness.
 */
export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ['./tests/setup-electron-mock.ts'],
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/main/git/**'],
      exclude: ['**/*.test.ts'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 70,
        branches: 50
      }
    }
  }
})