# Manual do TreeLine — Git explicado para iniciantes

**TreeLine 0.6.4** · Git GUI para Ubuntu/Debian · prints em português

Este manual ensina **duas coisas ao mesmo tempo**: o que é o Git (do zero, sem
jargão solto) e como fazer cada coisa no TreeLine. Cada capítulo mostra o
passo a passo na tela **e** o comando equivalente no terminal, para que você
entenda o que a ferramenta está fazendo por baixo.

> Os prints foram tirados de um repositório de demonstração chamado
> `meu-projeto` (11 commits, branches `main`/`develop`/`feature/novo-layout`,
> tag `v1.0.0`, um stash e alterações pendentes). O seu projeto vai ter a
> mesma cara, com os seus arquivos.

## Capítulos

| # | Capítulo | O que você aprende |
|---|---|---|
| 1 | [Introdução e instalação](01-introducao.md) | O que é Git, instalar o TreeLine, abrir o primeiro repositório |
| 2 | [Conceitos de Git](02-conceitos-git.md) | Working tree, stage, commit, branch, remoto, stash, reflog (com diagramas) |
| 3 | [Tour pela janela](03-tour-pela-janela.md) | As 5 regiões da tela: toolbar, sidebar, histórico, file status, statusbar |
| 4 | [Stage e Commit](04-stage-e-commit.md) | Alterar arquivos, dar stage, ver o diff e commitar |
| 5 | [Histórico e grafo](05-historico-e-grafo.md) | Ler o grafo, buscar commits, combo de branches, detalhe, blame |
| 6 | [Branches, merge e rebase](06-branches-merge-rebase.md) | Criar/trocar branches, merge, rebase, cherry-pick, revert, tag |
| 7 | [Stash](07-stash.md) | Guardar trabalho pela metade numa “gaveta” e recuperar depois |
| 8 | [Remotos: push, pull e fetch](08-remotos.md) | GitHub/GitLab, sincronizar, ahead/behind, credenciais |
| 9 | [Conflitos](09-conflitos.md) | Por que nascem conflitos e como resolvê-los no resolvedor 3 vias |
| 10 | [Recuperação e reflog](10-recuperacao-e-reflog.md) | Desfazer commits, reset, revert, backups automáticos |
| 11 | [Atalhos e ferramentas](11-atalhos-e-ferramentas.md) | Paleta Ctrl+K, terminal, abas, Settings, temas, LFS |
| 12 | [Glossário e erros comuns](12-glossario-e-erros.md) | Termos A–Z, tabela terminal ↔ TreeLine, erros e como sair deles |

## Dicas de leitura

- **Novo no Git?** Leia na ordem: 1 → 2 → 3 → 4. Depois pule para o que
  precisa (branches, remotos, conflitos).
- **Já usa terminal?** Vá direto para 3 (a tela) e use as tabelas de
  equivalência de cada capítulo para achar onde fica cada comando.
- **Toda operação destrutiva** (reset hard, drop, delete, force) pede
  confirmação no TreeLine e, quando pode, grava um backup `git bundle` em
  `.git/treeline-backups/` antes de executar.
- O TreeLine usa o **git instalado no seu sistema**. Se algo sair do
  caminho no app, o mesmo comando no terminal resolve — e vice-versa.

## Requisitos

- Ubuntu/Debian (testado em Ubuntu 26.04) — `.deb` ou AppImage na página
  de [Releases](https://github.com/viniciuswerneck/TreeLine/releases)
- `git >= 2.40` (`git --version`)
- Opcional: `git-lfs` (arquivos grandes) e `git-flow` (fluxo de release)

---

*TreeLine — Werneck Lab. MIT. Sem afiliação com a Atlassian/SourceTree.*
