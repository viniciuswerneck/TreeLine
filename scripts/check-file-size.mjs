// Gate estrutural: nenhum arquivo novo em `src` pode passar de 800 linhas.
// Os dois monólitos legados abaixo ficam "congelados" no tamanho atual
// (ratchet): não podem crescer, mas podem encolher. Ao dividi-los, remova a
// entrada correspondente desta lista.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const LIMIT = 800

/** Tamanho máximo tolerado por arquivo legado (dívida técnica congelada). */
const GRANDFATHERED = new Map([
  ['src/renderer/i18n.ts', 1808],
  ['src/renderer/store.ts', 1743]
])

const ROOT = 'src'

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* walk(full)
    else yield full
  }
}

const violations = []
for (const file of walk(ROOT)) {
  if (!/\.(ts|tsx)$/.test(file) || /\.test\.tsx?$/.test(file) || /\.d\.ts$/.test(file)) continue
  const rel = relative(process.cwd(), file).split(sep).join('/')
  const content = readFileSync(file, 'utf-8')
  const lines = content.endsWith('\n') ? content.split('\n').length - 1 : content.split('\n').length
  const ceiling = GRANDFATHERED.get(rel) ?? LIMIT
  if (lines > ceiling) {
    const kind = GRANDFATHERED.has(rel) ? 'cresceu além do teto congelado' : `passa do limite de ${LIMIT} linhas`
    violations.push(`  ${rel}: ${lines} linhas — ${kind} (${ceiling})`)
  }
}

if (violations.length > 0) {
  console.error(`\n✖ check-file-size: ${violations.length} arquivo(s) fora do limite:\n`)
  console.error(violations.join('\n'))
  console.error('\nDivida o arquivo (ou ajuste o teto congelado) antes de continuar.\n')
  process.exit(1)
}

console.log(`✔ check-file-size: todos os arquivos dentro do limite (${GRANDFATHERED.size} exceções congeladas).`)
