/**
 * Smoke end-to-end dos handlers IPC de conflito contra um repo git real,
 * dentro do app empacotado (via CDP). Cobre os 4 tipos de conflito.
 *
 * Uso: node tests/e2e-conflict.mjs <repo>
 */
const repo = process.argv[2]
if (!repo) {
  console.error('uso: node tests/e2e-conflict.mjs <repo>')
  process.exit(2)
}

const list = await (await fetch('http://localhost:9222/json/list')).json()
const page = list.find((t) => t.type === 'page' && t.url.includes('index.html')) ?? list.find((t) => t.type === 'page')
if (!page) {
  console.error('sem alvo CDP')
  process.exit(3)
}

// Node 22 tem WebSocket global (undici): não precisa de dependencia `ws`.
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString())
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
  }
})
await new Promise((r, j) => {
  ws.addEventListener('open', r, { once: true })
  ws.addEventListener('error', j, { once: true })
})

async function evaluate(expression) {
  const r = await new Promise((resolve, reject) => {
    const n = ++id
    pending.set(n, { resolve, reject })
    ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
  })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'exception')
  return r.result.value
}

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

// Sem `openRepo`: ele abre diálogo NATIVO (não aceita path) e travaria o
// teste. Cada handler IPC recebe `repo` como argumento, então basta chamá-los
// direto com o path do fixture.
const files = await evaluate(`window.treeline.getConflictFiles(${JSON.stringify(repo)})`)
const byPath = Object.fromEntries(files.map((f) => [f.path, f]))
console.log('conflitos:', files.map((f) => `${f.path}:${f.kind}/${f.xy}`).join(' '))

check('lista 4 arquivos em conflito', files.length === 4, `veio ${files.length}`)
check('UU vira both-modified', byPath['mod.txt']?.kind === 'both-modified', byPath['mod.txt']?.kind)
check('UD vira deleted-by-them', byPath['del.txt']?.kind === 'deleted-by-them', byPath['del.txt']?.kind)
check('rótulo do lado deles vem do MERGE_HEAD', byPath['mod.txt']?.theirsLabel === 'side', byPath['mod.txt']?.theirsLabel)
check('nenhum rótulo é a string "undefined" (armadilha do name-rev)', !files.some((f) => String(f.theirsLabel).includes('undefined')), files.map((f) => f.theirsLabel).join(','))
check('rótulo do nosso lado é o branch atual', byPath['mod.txt']?.oursLabel === 'main', byPath['mod.txt']?.oursLabel)
check('op detected = merge', (await evaluate(`window.treeline.getConflictOp(${JSON.stringify(repo)})`)) === 'merge')

// --- UU: os 3 estágios + merge-file --zdiff3 ---
const mod = await evaluate(`window.treeline.getConflictStages(${JSON.stringify(repo)}, "mod.txt")`)
check(
  'UU tem base/ours/theirs',
  mod.base === 'a\nb\nc\nd\ne\n' && mod.ours === 'a\nOURS\nc\nd\nEXTRA\ne\n' && mod.theirs === 'a\nTHEIRS\nc\nd\ne\n',
  JSON.stringify([mod.base, mod.ours, mod.theirs])
)
check('UU traz marcadores com a seção base', mod.marked.includes('<<<<<<< ours') && mod.marked.includes('||||||| base') && mod.marked.includes('=======') && mod.marked.includes('>>>>>>> theirs'), mod.marked.replace(/\n/g, '\\n'))

// --- UU com 2 regioes: base com contexto nos dois lados ---
check(
  'UU: as DUAS regioes de conflito estao nos marcadores',
  mod.marked.split('<<<<<<< ours').length - 1 === 1 && mod.marked.includes('||||||| base\nb\n=======\nTHEIRS'),
  mod.marked.replace(/\n/g, '\\n')
)
// neste fixture added.txt existe na base, entao e UU (modify/modify), nao AA
const added = await evaluate(`window.treeline.getConflictStages(${JSON.stringify(repo)}, "added.txt")`)
check('added.txt (base existente) e modify/modify', added.kind === 'both-modified' && added.base === 'x\ny\n', `${added.kind} base=${JSON.stringify(added.base)}`)
check('added: os dois lados', added.ours === 'x\nMAIN\n' && added.theirs === 'x\nSIDE\n', JSON.stringify([added.ours, added.theirs]))

// --- UD: sem marcadores, lado ausente é null ---
const del = await evaluate(`window.treeline.getConflictStages(${JSON.stringify(repo)}, "del.txt")`)
check('UD: kind deleted-by-them', del.kind === 'deleted-by-them', del.kind)
check('UD: sem marcador no worktree', del.marked === '', JSON.stringify(del.marked))
check('UD: lado deles é null (apagado)', del.theirs === null, String(del.theirs))
check('UD: nosso lado preservado', del.ours === 'keep\nours\n', JSON.stringify(del.ours))
check('UD: base preservada', del.base === 'keep\nbase\n', JSON.stringify(del.base))

// --- binário ---
const bin = await evaluate(`window.treeline.getConflictStages(${JSON.stringify(repo)}, "img.png")`)
check('binário detectado', bin.binary === true, String(bin.binary))

// --- Continue barrado enquanto houver unmerged ---
let bloqueou = false
try {
  await evaluate(`window.treeline.mergeContinue(${JSON.stringify(repo)}, "pt")`)
} catch (e) {
  bloqueou = String(e).includes('ainda em conflito')
}
check('mergeContinue bloqueado com conflito pendente', bloqueou)

// --- rerere opt-in ---
const r0 = await evaluate(`window.treeline.getRerere(${JSON.stringify(repo)})`)
check('rerere começa desligado', r0 === false, String(r0))
await evaluate(`window.treeline.setRerere(${JSON.stringify(repo)}, true)`)
check('rerere ligou', (await evaluate(`window.treeline.getRerere(${JSON.stringify(repo)})`)) === true)
await evaluate(`window.treeline.setRerere(${JSON.stringify(repo)}, false)`)
check('rerere desligou', (await evaluate(`window.treeline.getRerere(${JSON.stringify(repo)})`)) === false)

// --- resolver 3-vias: grava e dá stage ---
await evaluate(
  `window.treeline.applyConflictResult(${JSON.stringify(repo)}, "mod.txt", "a\\nRESOLVIDO\\nc\\n", false)`
)
const modAfter = await evaluate(`window.treeline.getConflictStages(${JSON.stringify(repo)}, "mod.txt")`).catch(() => null)
check('após aplicar, mod.txt sai do index unmerged', modAfter === null, JSON.stringify(modAfter))
const rest = await evaluate(`window.treeline.getConflictFiles(${JSON.stringify(repo)})`)
check('restam 3 conflitos', rest.length === 3, `veio ${rest.length}`)

// --- resolver por lado ---
await evaluate(`window.treeline.resolveConflictSide(${JSON.stringify(repo)}, "added.txt", "theirs", "pt")`)
const addedAfter = await evaluate(`window.treeline.getConflictStages(${JSON.stringify(repo)}, "added.txt")`).catch(() => null)
check('resolver por lado tira do unmerged', addedAfter === null)
check('resolver por lado deu stage do conteúdo deles', (await evaluate(
  `window.treeline.getStatus(${JSON.stringify(repo)})`
)).staged.some((f) => f.path === 'added.txt'))

// --- Continue ainda barrado (2 conflitos de pé) ---
let bloqueou2 = false
try {
  await evaluate(`window.treeline.mergeContinue(${JSON.stringify(repo)}, "pt")`)
} catch (e) {
  bloqueou2 = String(e).includes('ainda em conflito')
}
check('Continue segue barrado com 2 conflitos', bloqueou2)

// --- resolver tudo por nosso lado e fechar o merge ---
for (const p of ['del.txt', 'img.png']) {
  await evaluate(`window.treeline.resolveConflictSide(${JSON.stringify(repo)}, ${JSON.stringify(p)}, 'ours', 'pt')`)
}
check('nenhum unmerged restante', (await evaluate(`window.treeline.getConflictFiles(${JSON.stringify(repo)})`)).length === 0)

const diff = await evaluate(`window.treeline.getDiff(${JSON.stringify(repo)}, "del.txt", false, "pt")`)
check('getDiff de arquivo já resolvido traz diff real', !diff.includes('@@ ours @@') && !diff.includes('diff.oursSide'), diff.split('\n')[0])

await evaluate(`window.treeline.mergeContinue(${JSON.stringify(repo)}, "pt")`)
const st = await evaluate(`window.treeline.getStatus(${JSON.stringify(repo)})`)
check('merge concluído: sem conflito', st.conflicted.length === 0, JSON.stringify(st.conflicted))
check('merge concluído: op encerrada', (await evaluate(`window.treeline.getConflictOp(${JSON.stringify(repo)})`)) === null)

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passaram`)
ws.close()
process.exit(failed.length === 0 ? 0 : 1)
