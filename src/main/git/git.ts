// Wrapper central do `simple-git` (camada única de execução git do main).
//
// Por que existe: a partir do simple-git v4 há um "environment guard" que
// REMOVE do processo filho toda variável de ambiente `git_*` herdada que não
// esteja numa allowlist — inclusive as que o próprio app define em
// `src/main/index.ts` para rodar sem TTY:
//   - GIT_TERMINAL_PROMPT=0  (sem isso o git pode pedir senha e travar o main)
//   - GIT_EDITOR=true        (sem isso `rebase --continue` abre um editor)
//   - GIT_SEQUENCE_EDITOR    (rebase interativo via arquivo de plano)
// Sem repassar `allowEnvironment`, esses vars somem e o app volta a travar.
//
// Todo `src/main/**` deve importar `simpleGit` daqui, não de 'simple-git'.
import { simpleGit as baseSimpleGit, type SimpleGit, type SimpleGitOptions } from 'simple-git'

/** Vars git que o app controla e precisa preservar nos filhos. */
export const GIT_ENV_ALLOW = [
  'GIT_TERMINAL_PROMPT',
  'GIT_EDITOR',
  'GIT_SEQUENCE_EDITOR',
  'GIT_SSH_COMMAND'
]

type BaseDir = string | undefined
type OptionsOrBaseDir = Partial<SimpleGitOptions> | BaseDir

/**
 * Igual ao `simpleGit` original, mas com `allowEnvironment` já embutido.
 * Aceita as duas formas: `simpleGit(dir, opts?)` e `simpleGit(opts)`.
 */
export function simpleGit(
  options?: OptionsOrBaseDir,
  extra?: Partial<SimpleGitOptions>
): SimpleGit {
  if (typeof options === 'string' || options === undefined) {
    return baseSimpleGit({ baseDir: options, allowEnvironment: GIT_ENV_ALLOW, ...extra })
  }
  return baseSimpleGit({ allowEnvironment: GIT_ENV_ALLOW, ...options })
}

export type { SimpleGit, SimpleGitOptions }
