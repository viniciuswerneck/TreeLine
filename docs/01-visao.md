# TreeLine — Visão do Produto

> Git GUI para Linux com experiência familiar para quem vem do SourceTree.
> Inspirado no fluxo do SourceTree. Não é afiliado à Atlassian. Nome, logo, ícones e textos são originais.

## 1. Problema

Não existe versão oficial do SourceTree para Linux. Quem migra do Mac/Windows perde o fluxo visual e volta para o terminal ou para clientes com UX diferente.

## 2. Público

1. Usuário de SourceTree migrando para Ubuntu/Debian que quer usar sem reaprender.
2. Dev que usa terminal mas quer visualizar grafo, stage por hunk e resolver merge com calma.
3. Times que padronizam fluxo Git-flow / PR.

## 3. Princípio norteador: familiaridade intuitiva

Se a pessoa sabe usar SourceTree, sabe usar TreeLine sem tutorial.

Regras:
- Mesma divisão de tela e mesma terminologia em inglês do Git (Commit, Push, Pull, Fetch, Branch, Merge, Stash, Cherry-Pick, Rebase, Tag) como no SourceTree.
- Mesma ordem de ações na barra superior.
- Mesmos nomes de estados: Working Copy, Unstaged / Staged, Uncommitted changes.
- Atalhos e clique-direito equivalentes.
- Não copiar: nome SourceTree, logo, ícones, ilustrações ou textos da Atlassian. Tudo refeito.

## 4. Layout alvo (paridade visual)

Janela principal em 4 regiões, como o usuário do SourceTree espera:

```
+------------------------------------------------------------------+
| TOOLBAR: Commit | Push | Pull | Fetch | Branch | Merge | Stash  |
|          | Tag | Rebase | Cherry-Pick | Terminal | Settings     |
+----------+-------------------------------------------------------+
| SIDEBAR  | HISTORY CENTRAL                                   |
| Bookmarks| [Search commits / filter by branch / file]         |
| ----------------------------------------                  |
| WORKSPACE| Graph | Message | Author | Date | Hash           |
| Working  |  *    | ...     | ...    | ...  | ...            |
| Copy     |  | *  | ...     | ...    | ...  | ...            |
| Branches |                                                |
|  main    | DETAILS INFERIOR (abas)                               |
|  develop | [ File Status | Log | Search ]                        |
| Remotes  |  Unstaged files        | Staged files               |
| Tags     |  file1.ts  [Stage]     | file2.ts [Unstage]         |
| Stashes  | ------------------------------------------------------|
| Submod.  | DIFF VIEWER: unified/split, stage por hunk e por linha|
+----------+-------------------------------------------------------+
| STATUSBAR: repo atual | branch atual | ahead/behind | LFS | erros |
+------------------------------------------------------------------+
```

### 4.1 Sidebar esquerda
- Seção `Bookmarks`: lista de repos locais + Clone/Add/Create.
- Seção `Workspace`: Working Copy Changes, History, Search.
- Seção `Branches`: locais, com badge ahead/behind e menu (Checkout, Merge, Rebase, Rename, Delete).
- Seção `Remotes`: origin/upstream, Fetch/Push por branch.
- Seção `Tags`, `Stashes`, `Submodules` (colapsáveis).
- Comportamento igual ao SourceTree: duplo-clique faz checkout, arrastar branch sobre outra sugere merge, botão direito abre todas as ações.

### 4.2 Toolbar superior
Mesma ordem mental do SourceTree, ícones próprios estilo Lucide:
`Commit | Push | Pull | Fetch | Branch | Merge | Stash | Tag | Rebase | Cherry-Pick | Flow | Terminal | Settings`
Cada botão mostra o mesmo dialog que o usuário espera (ex: Push mostra remotes + branches + force-with-lease, nunca force puro por padrão).

### 4.3 Histórico central
- Grafo multi-lane com curvas, badges de refs (branch, tag, remote, HEAD).
- Colunas: Graph, Message, Author, Date, Hash.
- Filtros: por branch atual / all branches, por arquivo, por autor, busca local.
- Clique em commit mostra detalhes + arquivos + diff. Clique em Working Copy mostra unstaged/staged.

### 4.4 File Status + Diff
- Listas lado a lado: Unstaged <-> Staged, com Stage All / Unstage All / Discard.
- Stage por arquivo, por hunk e por linha (checkbox na gutter do diff).
- Diff unified/split com syntax highlight, número de linha duplo, expandir contexto.
- Commit box em cima do diff: mensagem + descrição, Amend, Push immediately opcional.

## 5. Fluxos principais (cópia de comportamento, não de arte)

1. Abrir repo -> ver Working Copy -> stage hunk -> commit -> push.
2. Criar branch a partir de commit/branch -> codar -> merge com preview.
3. Fetch -> ver behind -> pull (merge/rebase) -> resolver conflito no painel.
4. Stash changes -> trocar branch -> apply/pop.
5. Cherry-pick entre branches, revert, tag, push tag.
6. Clone por URL, init local, add remote.

## 6. Fora de escopo v1

- Mercurial (SourceTree suporta, TreeLine é Git-only).
- Integração Jira/Bitbucket profunda no MVP (só abre URL do remote).
- IA para commit message (fase posterior, desligável).

## 7. Plataforma

- Primeiro: Ubuntu/Debian `.deb` + AppImage. Depois Flatpak.
- Git do sistema (`git --version` >= 2.40), sem git embutido.
- Suporta Git LFS se instalado, Git-flow por comandos padrão.

## 8. Sucesso

Usuário de SourceTree abre o TreeLine e em 5 minutos faz commit/push/branch/merge sem ler docs.
