import { describe, expect, it } from 'vitest'
import { conflictPrompt, commitMessagePrompt, reviewPrompt } from './prompt'

describe('prompt (git-aware, propose-only)', () => {
  it('commitMessagePrompt inclui stat, diff e idioma', () => {
    const p = commitMessagePrompt('1 file changed', 'diff --git a/x b/x', 'pt')
    expect(p).toContain('Brazilian Portuguese')
    expect(p).toContain('1 file changed')
    expect(p).toContain('diff --git a/x b/x')
    expect(p).toContain('Conventional Commits')
    expect(p).toContain('ONLY the commit message')
  })

  it('commitMessagePrompt usa English por padrão e placeholders vazios', () => {
    const p = commitMessagePrompt('', '', undefined)
    expect(p).toContain('English')
    expect(p).toContain('(no stat)')
    expect(p).toContain('(no diff)')
  })

  it('reviewPrompt pede resumo, riscos e sugestões', () => {
    const p = reviewPrompt('diff', 'es')
    expect(p).toContain('Spanish')
    expect(p).toContain('(1) a short summary')
    expect(p).toContain('Do NOT modify files')
  })

  it('conflictPrompt lista os arquivos', () => {
    const p = conflictPrompt(['a.txt', 'b.txt'], 'en')
    expect(p).toContain('- a.txt')
    expect(p).toContain('- b.txt')
    expect(p).not.toContain('conflict markers')
  })

  it('conflictPrompt anexa o conteúdo com marcadores quando fornecido', () => {
    const p = conflictPrompt(['a.txt'], 'en', '<<<<<<< ours\nA\n=======\nB\n>>>>>>> theirs')
    expect(p).toContain('conflict markers')
    expect(p).toContain('<<<<<<< ours')
    expect(p).toContain('>>>>>>> theirs')
  })
})
