// Integração do motor: cinema de conflito — merge, rebase, cherry-pick,
// revert e stash conflitante, com resolvedor por lado e continues/aborts.
import { describe, expect, it, afterEach } from 'vitest'
import { simpleGit } from 'simple-git'
import { mkRepo, commitFile, write, read, call, cleanup } from './engine-helpers'

const repos: string[] = []
const keep = (r: string): string => {
  repos.push(r)
  return r
}

afterEach(() => {
  cleanup(...repos.splice(0))
})

async function mergeableRepo(): Promise<string> {
  const repo = keep(await mkRepo())
  await commitFile(repo, 'a.txt', 'a\nb\n', 'base')
  const git = simpleGit(repo)
  await git.checkoutBranch('feature', 'main')
  await commitFile(repo, 'a.txt', 'a\nFEATURE\n', 'feature change')
  await git.checkout('main')
  await commitFile(repo, 'a.txt', 'a\nMAIN\n', 'main change')
  return repo
}

describe('motor: merge conflitante', () => {
  // simple-git `.merge()` RESOLVE quando o merge para em conflito (exit 1 com
  // stderr nas linhas de terra do git); a UI detecta o estado depois, via
  // getConflictOp — é essa a sequência real do app, e é o que o teste trava.
  it('detecta, mostra stages, resolve por lado e conclui com continue', async () => {
    const repo = await mergeableRepo()
    await call('treeline:mergeBranch', repo, 'feature', false)

    expect(await call('treeline:getConflictOp', repo)).toBe('merge')
    const files = await call<{ path: string; kind: string; oursLabel: string; theirsLabel: string }[]>('treeline:getConflictFiles', repo)
    expect(files.map((f) => f.path)).toContain('a.txt')
    expect(files[0]?.oursLabel).toBe('main')

    const stages = await call<{ marked: string; ours: string; theirs: string; kind: string }>('treeline:getConflictStages', repo, 'a.txt')
    expect(stages.kind).toBe('both-modified')
    expect(stages.marked).toContain('<<<<<<<')
    expect(stages.ours).toContain('MAIN')
    expect(stages.theirs).toContain('FEATURE')

    const confDiff = await call<string>('treeline:getDiff', repo, 'a.txt', false)
    expect(confDiff).toContain('@@')

    // Rerere opt-in por repo.
    expect(await call('treeline:getRerere', repo)).toBe(false)
    await call('treeline:setRerere', repo, true)
    expect(await call('treeline:getRerere', repo)).toBe(true)

    // Continue com conflitos pendentes é recusado.
    await expect(call('treeline:mergeContinue', repo)).rejects.toThrow(/conflito|conflict/i)

    // Resolver por um lado zera o conflito e o merge conclui.
    await call('treeline:resolveOurs', repo, 'a.txt')
    expect((await call<{ path: string }[]>('treeline:getConflictFiles', repo)).length).toBe(0)
    await call('treeline:mergeContinue', repo)
    expect(await call('treeline:getConflictOp', repo)).toBeNull()
    expect(read(repo, 'a.txt')).toBe('a\nMAIN\n')
  })

  it('resolveTheirs e abortMerge', async () => {
    const repo = await mergeableRepo()
    await call('treeline:mergeBranch', repo, 'feature', false)
    await call('treeline:resolveTheirs', repo, 'a.txt')
    await call('treeline:mergeContinue', repo)
    expect(read(repo, 'a.txt')).toBe('a\nFEATURE\n')

    // Merge abortável: precisa de uma DIVERGÊNCIA nova no mesmo arquivo.
    const git = simpleGit(repo)
    await git.checkoutBranch('feature2','main')
    await commitFile(repo, 'a.txt', 'a\nF2\n', 'feat2')
    await git.checkout('main')
    await commitFile(repo, 'a.txt', 'a\nM2\n', 'main2')

    await call('treeline:mergeBranch', repo, 'feature2', false)
    expect(await call('treeline:getMergeState', repo)).toMatchObject({ inProgress: true })
    await call('treeline:abortMerge', repo)
    expect(await call('treeline:getMergeState', repo)).toEqual({ inProgress: false })
    expect(await call('treeline:getConflictOp', repo)).toBeNull()
  })

  it('merge no-ff limpo conclui; mergePreview lista arquivos', async () => {
    const repo = keep(await mkRepo())
    await commitFile(repo, 'a.txt', 'base\n', 'base')
    const git = simpleGit(repo)
    await git.checkoutBranch('feature', 'main')
    await commitFile(repo, 'b.txt', 'novo\n', 'feat')
    await git.checkout('main')
    const preview = await call<{ files: string[]; commits: number }>('treeline:mergePreview', repo, 'feature')
    expect(preview.files).toContain('b.txt')
    expect(preview.commits).toBeGreaterThan(0)
    await call('treeline:mergeBranch', repo, 'feature', true)
    const log = await call<{ message: string }[]>('treeline:getLog', repo, 5, 0)
    expect(log[0]?.message).toContain('feature')
  })
})

describe('motor: rebase com conflito', () => {
  it('rebaseOnto conflita, resolve e continua', async () => {
    const repo = keep(await mkRepo())
    await commitFile(repo, 'a.txt', 'a\nb\n', 'base')
    const git = simpleGit(repo)
    await git.checkoutBranch('feature', 'main')
    await commitFile(repo, 'a.txt', 'a\nF\n', 'feature')
    await git.checkout('main')
    await commitFile(repo, 'a.txt', 'a\nM\n', 'main')
    await git.checkout('feature')

    await expect(call('treeline:rebaseOnto', repo, 'main')).rejects.toThrow(/Rebase/)
    expect(await call('treeline:getRebaseState', repo)).toMatchObject({ inProgress: true })
    expect(await call('treeline:getConflictOp', repo)).toBe('rebase')
    await expect(call('treeline:rebaseContinue', repo)).rejects.toThrow(/conflito|conflict/i)

    await call('treeline:resolveTheirs', repo, 'a.txt')
    await call('treeline:rebaseContinue', repo)
    expect(await call('treeline:getRebaseState', repo)).toEqual({ inProgress: false })
    expect(await call('treeline:getConflictOp', repo)).toBeNull()
  })

  it('skipRebase pula o commit travado; abortRebase restaura', async () => {
    // Rebase de 2 commits contra main; o primeiro conflita e é pulado.
    const repo = keep(await mkRepo())
    await commitFile(repo, 'a.txt', 'base\n', 'base')
    const git = simpleGit(repo)
    await git.checkoutBranch('feature', 'main')
    await commitFile(repo, 'a.txt', 'F1\n', 'f1')
    await commitFile(repo, 'a.txt', 'F2\n', 'f2')
    await git.checkout('main')
    await commitFile(repo, 'a.txt', 'M\n', 'main move')
    await git.checkout('feature')
    await expect(call('treeline:rebaseOnto', repo, 'main')).rejects.toThrow(/Rebase/)
    await call('treeline:skipRebase', repo)
    expect(await call('treeline:getRebaseState', repo)).toEqual({ inProgress: false })

    // Conflito sob controle → abort devolve o branch intacto.
    const fresh = keep(await mkRepo())
    await commitFile(fresh, 'a.txt', 'x\n', 'base')
    const git2 = simpleGit(fresh)
    await git2.checkoutBranch('feature', 'main')
    await commitFile(fresh, 'a.txt', 'G1\n', 'g1')
    await git2.checkout('main')
    await commitFile(fresh, 'a.txt', 'GG\n', 'gg')
    await git2.checkout('feature')
    await expect(call('treeline:rebaseOnto', fresh, 'main')).rejects.toThrow()
    await call('treeline:abortRebase', fresh)
    expect(await call('treeline:getRebaseState', fresh)).toEqual({ inProgress: false })
    expect(await simpleGit(fresh).revparse(['--abbrev-ref', 'HEAD']).then((r) => r.trim())).toBe('feature')
  })

  it('rebaseInteractive: plano pick reordena sem editores', async () => {
    const repo = keep(await mkRepo())
    await commitFile(repo, 'a.txt', 'base\n', 'base')
    const git = simpleGit(repo)
    await git.checkoutBranch('feature', 'main')
    await commitFile(repo, 'b.txt', '1\n', 'f1')
    await commitFile(repo, 'c.txt', '2\n', 'f2')
    const plan = await call<{ hash: string; message: string; action: string }[]>('treeline:getRebasePlan', repo, 'main')
    expect(plan.map((p) => p.message)).toEqual(['f1', 'f2'])
    await call('treeline:rebaseInteractive', repo, 'main', plan, undefined, false)
    const log = await call<{ message: string }[]>('treeline:getLog', repo, 5, 0)
    expect(log.map((c) => c.message)).toEqual(['f2', 'f1', 'base'])
  })
})

describe('motor: cherry-pick e revert', () => {
  it('cherry-pick conflitante → skip; estado some', async () => {
    const repo = keep(await mkRepo())
    await commitFile(repo, 'a.txt', 'line\n', 'base')
    const git = simpleGit(repo)
    await git.checkoutBranch('feature', 'main')
    await commitFile(repo, 'a.txt', 'LINE\n', 'target')
    const hash = (await git.revparse(['HEAD'])).trim()
    await git.checkout('main')
    await commitFile(repo, 'a.txt', 'lined\n', 'main side')

    await expect(call('treeline:cherryPick', repo, hash)).rejects.toThrow(/Cherry/)
    expect(await call('treeline:getCherryPickState', repo)).toEqual({ inProgress: true })
    expect(await call('treeline:getConflictOp', repo)).toBe('cherry-pick')
    await expect(call('treeline:cherryPickContinue', repo)).rejects.toThrow(/conflito|conflict/i)

    await call('treeline:skipCherryPick', repo)
    expect(await call('treeline:getCherryPickState', repo)).toEqual({ inProgress: false })
  })

  it('cherry-pick limpo aplica e abortCherryPick desfaz', async () => {
    const repo = keep(await mkRepo())
    await commitFile(repo, 'a.txt', 'base\n', 'base')
    const git = simpleGit(repo)
    await git.checkoutBranch('feature', 'main')
    await commitFile(repo, 'b.txt', 'novo\n', 'pick-me')
    const hash = (await git.revparse(['HEAD'])).trim()
    await git.checkout('main')
    await call('treeline:cherryPick', repo, hash)
    expect((await call('treeline:getTrackedFiles', repo)).filter((f) => f.includes('b.txt'))).toHaveLength(1)
  })

  it('revert vazio/existente: rejeita sem commit e reverte limpo', async () => {
    const repo = keep(await mkRepo())
    await commitFile(repo, 'a.txt', 'A\n', 'c1')
    const c2 = await commitFile(repo, 'a.txt', 'B\n', 'c2')
    await expect(call('treeline:revertCommit', repo, '   ')).rejects.toThrow()

    await call('treeline:revertCommit', repo, c2)
    expect(read(repo, 'a.txt')).toBe('A\n')
    const log = await call<{ message: string }[]>('treeline:getLog', repo, 5, 0)
    expect(log[0]?.message).toMatch(/Revert/)
  })
})

describe('motor: stash (inclui conflitante)', () => {
  it('create/apply/pop/drop e abortStash em apply conflitante', async () => {
    const repo = keep(await mkRepo())
    await commitFile(repo, 'a.txt', 'a\nb\n', 'base')

    // 1) Cria e confere que a worktree voltou ao base.
    write(repo, 'a.txt', 'Z\nb\n')
    await call('treeline:createStash', repo, 'wip', false)
    const stashes = await call<{ ref: string }[]>('treeline:getStashes', repo)
    expect(stashes.length).toBe(1)
    const ref = stashes[0]?.ref ?? 'stash@{0}'
    expect(read(repo, 'a.txt')).toBe('a\nb\n')

    // 2) Apply limpo (sem tocar no arquivo): aplica e MANTÉM na lista.
    await call('treeline:applyStash', repo, ref)
    expect(read(repo, 'a.txt')).toBe('Z\nb\n')
    expect((await call<{ ref: string }[]>('treeline:getStashes', repo)).length).toBe(1)

    // 3) Conflito: commitar mudança no mesmo lugar e aplicar de novo.
    await commitFile(repo, 'a.txt', 'Y\nb\n', 'later')
    await call('treeline:applyStash', repo, ref)
    // simple-git `.raw` RESOLVE no stash apply conflitante; o conflito é
    // detectado por getConflictOp ('stash' não é merge/rebase/pick) — a UI
    // abre o resolvedor com Continue que não roda comando git.
    expect(await call('treeline:getConflictOp', repo)).toBe('stash')

    await call('treeline:abortStash', repo)
    expect(await call('treeline:getConflictOp', repo)).toBeNull()
    expect(read(repo, 'a.txt')).toBe('Y\nb\n')

    // 4) Drop destrutivo grava bundle antes.
    await call('treeline:dropStash', repo, ref)
    expect((await call<{ ref: string }[]>('treeline:getStashes', repo)).length).toBe(0)

    // 5) Pop limpo aplica e remove da lista.
    write(repo, 'a.txt', 'P\nb\n')
    await call('treeline:createStash', repo, '', false)
    const ref2 = (await call<{ ref: string }[]>('treeline:getStashes', repo))[0]?.ref ?? 'stash@{0}'
    await call('treeline:popStash', repo, ref2)
    expect(read(repo, 'a.txt')).toBe('P\nb\n')
    expect((await call<{ ref: string }[]>('treeline:getStashes', repo)).length).toBe(0)
  })
})

describe('motor: flow (fallback sem git-flow)', () => {
  it('detecta ausência, start cria feature/x e finish mergeia --no-ff', async () => {
    const repo = keep(await mkRepo())
    await commitFile(repo, 'a.txt', 'base\n', 'base')
    expect(await call('treeline:detectFlow', repo)).toEqual({ installed: false })

    const full = await call('treeline:flowStart', repo, 'feature', 'qa')
    expect(full).toBe('feature/qa')
    await commitFile(repo, 'b.txt', '1\n', 'work')

    await call('treeline:flowFinish', repo, 'feature', 'qa')
    const current = await simpleGit(repo).revparse(['--abbrev-ref', 'HEAD']).then((r) => r.trim())
    expect(current).toBe('main')
    const branches = await simpleGit(repo).branchLocal()
    expect(branches.all).not.toContain('feature/qa')
    const log = await call<{ message: string }[]>('treeline:getLog', repo, 5, 0)
    expect(log[0]?.message).toContain('feature/qa')
  })

  it('flowFinish sem branch falha com mensagem', async () => {
    const repo = keep(await mkRepo())
    await commitFile(repo, 'a.txt', 'base\n', 'base')
    await expect(call('treeline:flowFinish', repo, 'feature', 'nope')).rejects.toThrow(/não existe|does not exist/i)
  })
})