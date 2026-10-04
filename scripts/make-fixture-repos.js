/**
 * Cria os repos de fixture usados pelos harnesses E2E.
 * Uso: node scripts/make-fixture-repos.js
 *
 *   /tmp/opencode/lfs-test  — .gitattributes com filter=lfs (2 padrões),
 *                             sem precisar do binário git-lfs instalado.
 *   /tmp/opencode/sub-test  — submódulo aninhado (inner/deep) via git daemon,
 *                             para validar `submodule update --init --recursive`.
 *
 * O sub-submódulo usa git:// porque o Git bloqueia o transporte `file`
 * (CVE-2022-39253) por padrão; por isso o git daemon sobe em background.
 */
const { execFileSync, spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');

const BASE = '/tmp/opencode';
const PORT = 9418;
const git = (args, cwd) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

function initRepo(path) {
  fs.rmSync(path, { recursive: true, force: true });
  fs.mkdirSync(path, { recursive: true });
  git(['init', '-q', '-b', 'main'], path);
  git(['config', 'user.name', 'TreeLine Test'], path);
  git(['config', 'user.email', 'test@treeline.dev'], path);
  return path;
}

// --- LFS: apenas .gitattributes, sem binário git-lfs --------------------
function makeLfsRepo() {
  const r = initRepo(`${BASE}/lfs-test`);
  fs.writeFileSync(`${r}/.gitattributes`, '*.bin filter=lfs diff=lfs merge=lfs -text\n*.psd filter=lfs diff=lfs merge=lfs -text\n');
  fs.mkdirSync(`${r}/src`, { recursive: true });
  fs.writeFileSync(`${r}/src/app.js`, 'console.log(1)\n');
  fs.writeFileSync(`${r}/data.bin`, 'binario');
  git(['add', '-A'], r);
  git(['commit', '-qm', 'repo com tracking LFS'], r);
  console.log('lfs-test:', git(['rev-parse', '--short', 'HEAD'], r));
}

// --- Submódulo aninhado servindo via git daemon -------------------------
function makeSubmoduleRepos() {
  const deep = initRepo(`${BASE}/deep-src`);
  fs.writeFileSync(`${deep}/d.txt`, 'deep\n');
  git(['add', '-A'], deep);
  git(['commit', '-qm', 'deep'], deep);

  const inner = initRepo(`${BASE}/inner-src`);
  fs.writeFileSync(`${inner}/i.txt`, 'inner\n');
  git(['add', '-A'], inner);
  git(['commit', '-qm', 'inner'], inner);
  // .gitmodules escrito à mão: evita `submodule add` antes do daemon existir.
  fs.writeFileSync(
    `${inner}/.gitmodules`,
    `[submodule "deep"]\n\tpath = deep\n\turl = git://127.0.0.1:${PORT}/bare-deep.git\n`
  );
  const shaDeep = git(['rev-parse', 'HEAD'], deep);
  git(['update-index', '--add', '--cacheinfo', `160000,${shaDeep},deep`], inner);
  git(['add', '.gitmodules'], inner);
  git(['commit', '-qm', 'inner + sub-submodulo'], inner);

  for (const name of ['bare-deep.git', 'bare-inner.git']) {
    fs.rmSync(`${BASE}/${name}`, { recursive: true, force: true });
    git(['clone', '-q', '--bare', `${BASE}/${name === 'bare-deep.git' ? 'deep-src' : 'inner-src'}`, `${BASE}/${name}`], BASE);
  }

  // Daemon precisa estar de pé antes do clone do submódulo.
  const probe = spawnSync('git', ['ls-remote', `git://127.0.0.1:${PORT}/bare-deep.git`], { encoding: 'utf8' });
  if (probe.status !== 0) {
    const child = spawn('git', ['daemon', '--export-all', `--base-path=${BASE}`, `--port=${PORT}`, '--reuseaddr'], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    // Espera o daemon responder.
    for (let i = 0; i < 20; i++) {
      const ok = spawnSync('git', ['ls-remote', `git://127.0.0.1:${PORT}/bare-deep.git`], { stdio: 'ignore' }).status === 0;
      if (ok) break;
      spawnSync('sleep', ['0.3']);
    }
  }

  const r = initRepo(`${BASE}/sub-test`);
  fs.writeFileSync(`${r}/r.txt`, 'root\n');
  git(['add', '-A'], r);
  git(['commit', '-qm', 'root'], r);
  git(['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', `git://127.0.0.1:${PORT}/bare-inner.git`, 'inner'], r);
  git(['commit', '-qm', 'add inner via git://'], r);
  console.log('sub-test:', git(['rev-parse', '--short', 'HEAD'], r));
}

makeLfsRepo();
makeSubmoduleRepos();
console.log('\nstatus recursivo do sub-test (o "-" é o sub-submódulo não inicializado):');
console.log(git(['submodule', 'status', '--recursive'], `${BASE}/sub-test`));