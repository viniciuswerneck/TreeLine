// Construtores de prompt puros (sem Electron/Node): fáceis de testar e
// reutilizáveis pelo main. As ações git-aware são propose-only — o modelo só
// devolve texto; quem aplica é sempre o usuário na UI.

const LANG_NAME: Record<string, string> = { pt: 'Brazilian Portuguese', es: 'Spanish', en: 'English' }

/** Prompt para gerar a mensagem de commit a partir do diff staged. */
export function commitMessagePrompt(stat: string, diff: string, lang?: string): string {
  const name = LANG_NAME[lang ?? 'en'] ?? 'English'
  return [
    'You write git commit messages in Conventional Commits style.',
    `Write ONLY the commit message, in ${name}. Imperative mood. No code fences, no preamble, no explanation.`,
    'Use one subject line (max 72 chars). Add a blank line and up to 5 short bullet points only if helpful.',
    '',
    'Changed files (shortstat):',
    stat.trim() || '(no stat)',
    '',
    'Staged diff (possibly truncated):',
    diff.trim() || '(no diff)'
  ].join('\n')
}

/** Prompt para explicar/resolver um conflito de merge/rebase. */
export function conflictPrompt(files: string[], lang?: string, content?: string): string {
  const name = LANG_NAME[lang ?? 'en'] ?? 'English'
  const lines = [
    'A git conflict is in progress in this repository.',
    `Explain in ${name} what each side means and suggest how to resolve it, step by step.`,
    'Do NOT modify files or run git commands; only read and advise.',
    '',
    'Conflicted files:',
    ...files.map((f) => `- ${f}`)
  ]
  if (content) {
    lines.push('', 'Content with conflict markers (<<<<<<< ours / ======= / >>>>>>> theirs):', content)
  }
  return lines.join('\n')
}

/** Prompt para revisar as mudanças staged antes do commit. */
export function reviewPrompt(diff: string, lang?: string): string {
  const name = LANG_NAME[lang ?? 'en'] ?? 'English'
  return [
    'Review the staged changes below before commit.',
    `Answer in ${name} with: (1) a short summary, (2) likely bugs or risks, (3) suggestions.`,
    'Do NOT modify files or run git commands; only advise.',
    '',
    'Staged diff (possibly truncated):',
    diff.trim() || '(no diff)'
  ].join('\n')
}
