/**
 * Cria um repo Git sintético com N commits para stress test da virtualização.
 * Uso: node scripts/make-stress-repo.js [commits] [destino]
 * Default: 10000 commits em /tmp/opencode/stress-10k
 * Usa `git fast-import`, então 10k commits levam poucos segundos.
 */
const fs = require('node:fs');
const { execFileSync, spawnSync } = require('node:child_process');

const N = Number(process.argv[2] || 10000);
const DEST = process.argv[3] || `/tmp/opencode/stress-${N / 1000}k`;

const run = (args, cwd) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
run(['init', '-q', '-b', 'main'], DEST);
run(['config', 'user.name', 'TreeLine Stress'], DEST);
run(['config', 'user.email', 'stress@treeline.dev'], DEST);

const stamp = Math.floor(Date.UTC(2024, 0, 1) / 1000);
let stream = '';
for (let i = 1; i <= N; i++) {
  const who = `Stress Bot <stress@treeline.dev> ${stamp + i * 60} +0000`;
  const msg = `commit ${i}: synthetic history for virtualization test\n`;
  stream += `commit refs/heads/main\nmark :${i}\n`;
  stream += `author ${who}\ncommitter ${who}\n`;
  stream += `data ${Buffer.byteLength(msg)}\n${msg}`;
  if (i > 1) stream += `from :${i - 1}\n`;
  // Só um arquivo muda a cada 100 commits, variando o status do worktree.
  if (i % 100 === 0) {
    const body = `linha ${i}\n`;
    stream += `M 100644 inline data.txt\ndata ${Buffer.byteLength(body)}\n${body}`;
  }
  stream += '\n';
}

const imported = spawnSync('git', ['fast-import', '--quiet', '--done'], {
  cwd: DEST,
  input: `${stream}done\n`,
  maxBuffer: 1 << 28
});
if (imported.status !== 0) {
  console.error('fast-import falhou:', imported.stderr.toString().slice(0, 400));
  process.exit(1);
}
run(['reset', '-q', '--hard', 'main'], DEST);

const count = run(['rev-list', '--count', 'HEAD'], DEST).toString().trim();
const size = execFileSync('du', ['-sh', DEST], { encoding: 'utf-8' }).split('\t')[0];
console.log(`repo: ${DEST}`);
console.log(`commits: ${count}`);
console.log(`tamanho: ${size}`);