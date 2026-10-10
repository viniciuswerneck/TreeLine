import { defineConfig } from 'vitest/config'

/** Config global dos testes do TreeLine.
 *  - setupFiles: mock do módulo `electron` (node não expõe o objeto `ipcMain`),
 *    necessário para importar os módulos do motor `src/main/git/*` em testes.
 *  - coverage: motor git (`src/main/git/**`) com piso 60% (Camada 0, item C0/2).
 */
export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ['./tests/setup-electron-mock.ts'],
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/main/git/**'],
      reporter: ['text', 'html']
    }
  }
})