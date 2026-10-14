/**
 * Gera os repositórios de DEMONSTRAÇÃO usados nos screenshots (site + manual).
 *
 * Tudo é fictício: nomes, e-mails, projeto, datas. Nenhum dado real do autor é
 * usado (o commit é sempre `--author` fictício e o `user.name/email` local do
 * repo é sobrescrito). Datas ficam no passado (set/2026) para o grafo parecer
 * natural.
 *
 * Uso:
 *   DEMO_DIR=/tmp/opencode/treeline-demo node scripts/make-demo-repo.js
 *
 * Cria:
 *   <BASE>/aurora            projeto principal (branches
 *                            main/develop/feature/novo-layout, tag v1.0.0,
 *                            um stash, remote `origin` com ahead 2 e
 *                            alterações pendentes no stage/worktree)
 *   <BASE>/aurora-origin.git remote bare de `aurora`
 *   <BASE>/aurora-conflito   merge em andamento com conflito (2 arquivos)
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const BASE = process.env.DEMO_DIR || '/tmp/opencode/treeline-demo'
const AURORA = path.join(BASE, 'aurora')
const ORIGIN = path.join(BASE, 'aurora-origin.git')
const CONFLITO = path.join(BASE, 'aurora-conflito')

const ANA = { name: 'Ana Beatriz Moraes', email: 'ana.moraes@exemplo.dev' }
const CAIO = { name: 'Caio Ribeiro', email: 'caio.ribeiro@exemplo.dev' }
const MARINA = { name: 'Marina Lopes', email: 'marina.lopes@exemplo.dev' }

function git(args, cwd) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim()
}

function write(dir, rel, content) {
  const p = path.join(dir, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}

function initRepo(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  git(['init', '-q', '-b', 'main'], dir)
  // Identidade local fictícia: nada do global do usuário vaza para os commits.
  git(['config', 'user.name', ANA.name], dir)
  git(['config', 'user.email', ANA.email], dir)
  git(['config', 'commit.gpgsign', 'false'], dir)
  git(['config', 'tag.gpgsign', 'false'], dir)
  return dir
}

// Data determinística por commit (set/2026), uma por dia, horário comercial.
let day = 11
function nextDate() {
  const d = new Date(Date.UTC(2026, 8, day++, 13, 5, 0))
  return d.toISOString()
}

function commit(dir, who, msg) {
  const stamp = nextDate()
  execFileSync('git', ['commit', '-qm', msg, '--author', `${who.name} <${who.email}>`], {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_AUTHOR_DATE: stamp, GIT_COMMITTER_DATE: stamp }
  })
}

// Merge também precisa de data fixa (senão o commit de merge herda "hoje" e
// polui o grafo com uma data fora do passado).
function merge(dir, who, args) {
  const stamp = nextDate()
  execFileSync('git', ['merge', ...args], {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: stamp,
      GIT_COMMITTER_DATE: stamp,
      GIT_AUTHOR_NAME: who.name,
      GIT_AUTHOR_EMAIL: who.email,
      GIT_COMMITTER_NAME: who.name,
      GIT_COMMITTER_EMAIL: who.email
    }
  })
}

const README = (extra = '') =>
  `# Aurora\n\nPainel interno de vendas da equipe Aurora.\n\n## Como rodar\n\n    npm install\n    npm run dev\n${extra}`
const TEMA_CLARO = ':root {\n  --azul: #2f6bff;\n  --texto: #1c1f26;\n  --fundo: #f6f7fb;\n}\n\nbody {\n  background: var(--fundo);\n  color: var(--texto);\n  font-family: system-ui, sans-serif;\n}\n'
const TEMA_ESCURO = ':root {\n  --azul: #2f6bff;\n  --texto: #e6e8ef;\n  --fundo: #12141b;\n  --card: #1b1e28;\n}\n\nbody {\n  background: var(--fundo);\n  color: var(--texto);\n  font-family: system-ui, sans-serif;\n}\n\n.card {\n  background: var(--card);\n  border-radius: 8px;\n  padding: 16px;\n}\n'

function buildAurora() {
  initRepo(AURORA)
  const g = (args) => git(args, AURORA)
  const w = (rel, c) => write(AURORA, rel, c)

  // --- main: estrutura + login -------------------------------------------
  w('README.md', README())
  w('package.json', JSON.stringify({ name: 'aurora', version: '1.0.0', private: true, scripts: { dev: 'node src/app.js', test: 'node --test' }, dependencies: { express: '^4.19.2' } }, null, 2) + '\n')
  w('public/index.html', '<!doctype html>\n<html lang="pt-BR">\n  <head>\n    <meta charset="utf-8" />\n    <title>Aurora</title>\n  </head>\n  <body>\n    <div id="app"></div>\n    <script src="/src/app.js"></script>\n  </body>\n</html>\n')
  w('styles/tema.css', TEMA_CLARO)
  g(['add', '-A'])
  commit(AURORA, ANA, 'chore: estrutura inicial do projeto')

  w('src/auth.js', 'function autenticar(usuario, senha) {\n  return usuario === \'aurora\' && senha.length >= 8\n}\n\nmodule.exports = { autenticar }\n')
  g(['add', '-A'])
  commit(AURORA, ANA, 'feat: tela de login com validação')

  // develop nasce aqui; main segue com um commit de docs (gera divergência).
  g(['checkout', '-q', '-b', 'develop'])

  // --- develop: painel base ----------------------------------------------
  w('src/painel.js', 'const vendas = [\n  { dia: \'2026-09-01\', total: 1840.5 },\n  { dia: \'2026-09-02\', total: 2310.0 },\n  { dia: \'2026-09-03\', total: 1990.75 }\n]\n\nfunction resumo(periodo) {\n  const itens = vendas.filter((v) => v.dia >= periodo.de && v.dia <= periodo.ate)\n  const total = itens.reduce((s, v) => s + v.total, 0)\n  return { total, media: total / (itens.length || 1) }\n}\n\nmodule.exports = { resumo }\n')
  w('src/app.js', 'const painel = require(\'./painel\')\nconst auth = require(\'./auth\')\n\nfunction iniciar() {\n  console.log(\'Aurora em http://localhost:3000\')\n  return { painel, auth }\n}\n\nmodule.exports = { iniciar }\n')
  g(['add', '-A'])
  commit(AURORA, CAIO, 'feat: layout base do painel de vendas')

  // --- feature/relatorios: 3 commits -------------------------------------
  g(['checkout', '-q', '-b', 'feature/relatorios'])
  w('src/relatorios.js', 'function porPeriodo(vendas, de, ate) {\n  return vendas.filter((v) => v.dia >= de && v.dia <= ate)\n}\n\nmodule.exports = { porPeriodo }\n')
  g(['add', '-A'])
  commit(AURORA, MARINA, 'feat: relatório de vendas por período')

  w('src/exportar.js', 'function paraCSV(linhas) {\n  return linhas.map((l) => Object.values(l).join(\',\')).join(\'\\n\')\n}\n\nmodule.exports = { paraCSV }\n')
  g(['add', '-A'])
  commit(AURORA, MARINA, 'feat: exportação dos relatórios em CSV')

  w('src/relatorios.test.js', 'const { porPeriodo } = require(\'./relatorios\')\n\nconst vendas = [\n  { dia: \'2026-09-01\', total: 10 },\n  { dia: \'2026-09-05\', total: 20 }\n]\n\ntest(\'filtra pelo período\', () => {\n  const r = porPeriodo(vendas, \'2026-09-01\', \'2026-09-03\')\n  if (r.length !== 1) throw new Error(\'esperava 1 item\')\n})\n')
  g(['add', '-A'])
  commit(AURORA, CAIO, 'test: cobre o filtro de período')

  // --- develop: merge do relatórios + integração -------------------------
  g(['checkout', '-q', 'develop'])
  merge(AURORA, CAIO, ['-q', '--no-ff', 'feature/relatorios', '-m', "Merge branch 'feature/relatorios' into develop"])
  w('src/painel.js', 'const { porPeriodo } = require(\'./relatorios\')\n\nconst vendas = [\n  { dia: \'2026-09-01\', total: 1840.5 },\n  { dia: \'2026-09-02\', total: 2310.0 },\n  { dia: \'2026-09-03\', total: 1990.75 }\n]\n\nfunction resumo(periodo) {\n  const itens = porPeriodo(vendas, periodo.de, periodo.ate)\n  const total = itens.reduce((s, v) => s + v.total, 0)\n  return { total, media: total / (itens.length || 1) }\n}\n\nmodule.exports = { resumo }\n')
  g(['add', '-A'])
  commit(AURORA, CAIO, 'feat: integra relatórios ao menu lateral')

  w('src/painel.js', 'const { porPeriodo } = require(\'./relatorios\')\n\nconst vendas = [\n  { dia: \'2026-09-01\', total: 1840.5 },\n  { dia: \'2026-09-02\', total: 2310.0 },\n  { dia: \'2026-09-03\', total: 1990.75 }\n]\n\nfunction resumo(periodo) {\n  const itens = porPeriodo(vendas, periodo.de, periodo.ate)\n  const total = itens.reduce((s, v) => s + Math.round(v.total * 100) / 100, 0)\n  return { total, media: total / (itens.length || 1) }\n}\n\nmodule.exports = { resumo }\n')
  g(['add', '-A'])
  commit(AURORA, ANA, 'fix: corrige arredondamento de preços no resumo')

  // --- main: commit de docs (divergência) + hotfix -----------------------
  g(['checkout', '-q', 'main'])
  w('README.md', README('\n## Instalação\n\nCopie o `.env.exemplo` para `.env` antes do primeiro `npm run dev`.\n'))
  g(['add', '-A'])
  commit(AURORA, ANA, 'docs: instruções de instalação no README')

  g(['checkout', '-q', '-b', 'hotfix/preco'])
  w('src/carrinho.js', 'function total(itens) {\n  return itens.reduce((s, i) => s + Math.max(0, i.preco) * i.qtd, 0)\n}\n\nmodule.exports = { total }\n')
  g(['add', '-A'])
  commit(AURORA, ANA, 'fix: valida desconto negativo no carrinho')

  g(['checkout', '-q', 'main'])
  merge(AURORA, ANA, ['-q', '--no-ff', 'hotfix/preco', '-m', "Merge branch 'hotfix/preco'"])

  g(['checkout', '-q', 'develop'])
  merge(AURORA, ANA, ['-q', '--no-ff', 'hotfix/preco', '-m', "Merge branch 'hotfix/preco' into develop"])

  // --- feature/novo-layout -----------------------------------------------
  g(['checkout', '-q', '-b', 'feature/novo-layout'])
  w('styles/tema.css', TEMA_ESCURO)
  g(['add', '-A'])
  commit(AURORA, MARINA, 'feat: novo layout com tema escuro')

  g(['checkout', '-q', 'develop'])
  merge(AURORA, MARINA, ['-q', '--no-ff', 'feature/novo-layout', '-m', "Merge branch 'feature/novo-layout' into develop"])
  w('package.json', JSON.stringify({ name: 'aurora', version: '1.1.0', private: true, scripts: { dev: 'node src/app.js', test: 'node --test' }, dependencies: { express: '^4.19.2' } }, null, 2) + '\n')
  g(['add', '-A'])
  commit(AURORA, MARINA, 'chore: bump versão para 1.1.0')

  // --- integra develop na main: main vira a branch de trabalho -----------
  // (o manual assume a branch atual = main, com develop atrás e a tag v1.0.0)
  g(['checkout', '-q', 'main'])
  merge(AURORA, ANA, ['-q', '--no-ff', 'develop', '-m', "Merge branch 'develop' into main"])
  execFileSync('git', ['tag', '-a', 'v1.0.0', '-m', 'Primeira versão estável'], { cwd: AURORA, stdio: ['ignore', 'pipe', 'pipe'] })

  // --- remote origin: main/develop publicados; depois 2 commits locais ---
  fs.rmSync(ORIGIN, { recursive: true, force: true })
  git(['init', '-q', '--bare', ORIGIN], BASE)
  g(['remote', 'add', 'origin', ORIGIN])
  execFileSync('git', ['push', '-q', '-u', 'origin', 'main', 'develop'], { cwd: AURORA, stdio: ['ignore', 'pipe', 'pipe'] })

  w('src/filtros.js', 'function porVendedor(vendas, vendedor) {\n  return vendas.filter((v) => v.vendedor === vendedor)\n}\n\nmodule.exports = { porVendedor }\n')
  g(['add', '-A'])
  commit(AURORA, CAIO, 'feat: filtro por vendedor no painel')

  w('README.md', README('\n## Filtros\n\nUse o filtro por vendedor no topo do painel para ver só as vendas de uma pessoa.\n'))
  g(['add', '-A'])
  commit(AURORA, CAIO, 'docs: explica o filtro por vendedor no README')

  // branches já mergeadas saem de cena (o README cita só as 3 ativas)
  g(['branch', '-q', '-D', 'feature/relatorios', 'hotfix/preco'])

  // --- stash -------------------------------------------------------------
  w('src/relatorios.js', 'function porPeriodo(vendas, de, ate) {\n  return vendas.filter((v) => v.dia >= de && v.dia <= ate)\n}\n\nfunction agrupar(vendas, campo) {\n  return vendas.reduce((acc, v) => {\n    acc[v[campo]] = (acc[v[campo]] || 0) + v.total\n    return acc\n  }, {})\n}\n\nmodule.exports = { porPeriodo, agrupar }\n')
  const stashStamp = nextDate()
  execFileSync('git', ['stash', 'push', '-q', '-m', 'WIP: agrupar relatórios por período', '--', 'src/relatorios.js'], {
    cwd: AURORA,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_AUTHOR_DATE: stashStamp, GIT_COMMITTER_DATE: stashStamp }
  })

  // --- alterações pendentes (stage + worktree + untracked) ---------------
  w('README.md', README('\n## Filtros\n\nUse o filtro por vendedor no topo do painel.\n\n## Licença\n\nMIT — uso interno.\n'))
  w('src/carrinho.js', 'function total(itens) {\n  return itens.reduce((s, i) => s + Math.max(0, i.preco) * i.qtd, 0)\n}\n\nfunction comDesconto(itens, percentual) {\n  const bruto = total(itens)\n  return bruto - bruto * (percentual / 100)\n}\n\nmodule.exports = { total, comDesconto }\n')
  g(['add', 'README.md', 'src/carrinho.js'])

  w('src/painel.js', 'const { porPeriodo } = require(\'./relatorios\')\n\nconst vendas = [\n  { dia: \'2026-09-01\', total: 1840.5 },\n  { dia: \'2026-09-02\', total: 2310.0 },\n  { dia: \'2026-09-03\', total: 1990.75 },\n  { dia: \'2026-09-04\', total: 2755.2 }\n]\n\nfunction resumo(periodo) {\n  const itens = porPeriodo(vendas, periodo.de, periodo.ate)\n  const total = itens.reduce((s, v) => s + Math.round(v.total * 100) / 100, 0)\n  return { total, media: total / (itens.length || 1) }\n}\n\nmodule.exports = { resumo }\n')
  w('styles/tema.css', TEMA_ESCURO.replace('  --card: #1b1e28;\n', '  --card: #1b1e28;\n  --borda: #2a2e3a;\n').replace('  background: var(--card);\n  border-radius: 8px;', '  background: var(--card);\n  border: 1px solid var(--borda);\n  border-radius: 8px;'))
  w('src/preferencias.js', 'function temaSalvo() {\n  return \'escuro\'\n}\n\nmodule.exports = { temaSalvo }\n')

  return git(['rev-parse', '--short', 'HEAD'], AURORA)
}

function buildConflito() {
  initRepo(CONFLITO)
  const g = (args) => git(args, CONFLITO)
  const w = (rel, c) => write(CONFLITO, rel, c)

  w('src/precos.js', 'const PRECOS = {\n  basico: 49.9,\n  pro: 99.9,\n  enterprise: 199.9\n}\n\nmodule.exports = { PRECOS }\n')
  w('src/planos.js', 'const PLANOS = {\n  pro: \'Plano Pro — ideal para times pequenos\',\n  enterprise: \'Plano Enterprise — suporte dedicado\'\n}\n\nmodule.exports = { PLANOS }\n')
  g(['add', '-A'])
  commit(CONFLITO, ANA, 'chore: tabela de preços e planos')

  g(['checkout', '-q', '-b', 'feature/desconto'])
  w('src/precos.js', 'const PRECOS = {\n  basico: 49.9,\n  pro: 89.9,\n  enterprise: 199.9\n}\n\nmodule.exports = { PRECOS }\n')
  w('src/planos.js', 'const PLANOS = {\n  pro: \'Plano Pro — com desconto anual\',\n  enterprise: \'Plano Enterprise — suporte dedicado\'\n}\n\nmodule.exports = { PLANOS }\n')
  g(['add', '-A'])
  commit(CONFLITO, MARINA, 'feat: desconto anual no plano pro')

  g(['checkout', '-q', 'main'])
  w('src/precos.js', 'const PRECOS = {\n  basico: 49.9,\n  pro: 109.9,\n  enterprise: 199.9\n}\n\nmodule.exports = { PRECOS }\n')
  w('src/planos.js', 'const PLANOS = {\n  pro: \'Plano Pro — ideal para times pequenos\',\n  enterprise: \'Plano Enterprise — suporte dedicado 24/7\'\n}\n\nmodule.exports = { PLANOS }\n')
  g(['add', '-A'])
  commit(CONFLITO, CAIO, 'fix: reajuste de preço e suporte 24/7')

  // Merge que conflita: deixamos EM ANDAMENTO de propósito (2 arquivos).
  try {
    g(['merge', '--no-ff', 'feature/desconto', '-m', "Merge branch 'feature/desconto' into main"])
  } catch {
    /* exit 1 esperado: conflito */
  }
  return git(['status', '--short'], CONFLITO)
}

console.log('base:', BASE)
console.log('aurora HEAD:', buildAurora())
console.log('conflito:', buildConflito())
console.log('\naurora — branches:')
console.log(git(['branch'], AURORA))
console.log('aurora — tags:', git(['tag'], AURORA))
console.log('aurora — stash:', git(['stash', 'list'], AURORA))
console.log('aurora — status:')
console.log(git(['status', '--short'], AURORA))
