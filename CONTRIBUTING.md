# Contribuindo com o TreeLine

Obrigado pelo interesse. Antes de abrir uma issue ou PR, veja o contexto do
projeto em `docs/00-referencia-assistente.md` (fonte da verdade) e
`docs/05-estado.md` (estado real do código).

## Ambiente

- Node 22 e `git >= 2.40`.
- `npm ci` para instalar.
- `npm run dev` para rodar em modo desenvolvimento.

## Antes de abrir um PR

Rode os mesmos gates do CI e deixe tudo verde:

```bash
npm run typecheck       # TS main + renderer
npm run lint            # ESLint (flat config)
npm run check:structure # madge (ciclos) + teto de 800 linhas/arquivo
npm run coverage        # Vitest + piso de cobertura de src/main/git
npm run build           # electron-vite
```

## Regras de código

- Escritas no Git **sempre** via CLI (hooks, LFS, flow, credential helpers).
  Nunca libgit2 para escrita.
- Todo acesso a `git` no main passa pelo wrapper `src/main/git/git.ts`
  (importe `simpleGit` de lá, não de `simple-git`).
- O renderer não usa `child_process`; fala com o main por IPC tipado
  (`src/main/ipc.ts` / `src/preload/api.ts`).
- Nada de senha/token em `argv`, `config.json` ou log. Use
  `credential.helper`/`ssh-agent`.
- Destrutivos: `push` usa `--force-with-lease`; reset hard/rebase exigem
  confirmação + bundle de backup.
- Sem comentários supérfluos; siga o estilo dos arquivos vizinhos.
- Novos arquivos: mantenha abaixo de 800 linhas e sem dependências circulares.

## Commits e PRs

- Mensagens concisas, no imperativo, descrevendo o "porquê".
- Um PR por assunto. Descreva o problema, a solução e como validou.
- Atualize `CHANGELOG.md` na seção `Unreleased` quando a mudança for visível.
- Ao finalizar um marco, atualize também `docs/05-estado.md` e a tabela de
  paridade em `docs/02-roadmap.md`.

## Dúvidas de segurança

Não abra issue pública: siga `SECURITY.md`.

## Proteção da branch `main`

Configuração recomendada (aplicar em *Settings → Branches → Branch protection
rules* para `main`; requer admin):

- Exigir pull request antes do merge (sem pushes diretos).
- Exigir que os status checks passem: **CI** (`typecheck`, `lint`,
  `check:structure`, `coverage`, `build`, `audit`).
- Exigir branch atualizada antes do merge e histórico linear (squash/rebase).
- Exigir resolução de conversas e, se houver mais de um mantenedor, 1 review.
- Não permitir bypass das regras (nem para administradores).

Com `gh` instalado e autenticado, dá para aplicar via API:

```bash
gh api -X PUT repos/:owner/:repo/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["CI"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 1 },
  "restrictions": null
}
JSON
```
