# 2. Conceitos de Git

Este capítulo é a base de tudo o que vem depois. Cada conceito vem com (a) a
explicação em português, (b) o diagrama e (c) o comando do terminal — para
você reconhecer o que o TreeLine faz quando clica num botão.

## 2.1 As três áreas

Todo arquivo de um projeto repositório está sempre em **um destes estados**:

```
   você edita o arquivo           git add                    git commit
  ───────────────────────►  Unstaged  ──────────►  Staged/Índice  ─────────►  Histórico
   (no seu disco)          "mudou, ainda         "selecionado para   (foto
                            não entra na foto"     a próxima foto"    salva)
```

| Estado | Como aparece no TreeLine | Comando |
|---|---|---|
| Mudou, mas não escolhido | Coluna **Unstaged** (M = modificado, D = deletado, ? = novo) | — |
| Escolhido para o commit | Coluna **Staged** (+ = novo, M = modificado) | `git add arquivo` |
| Já commitado | **Histórico** (linhas no grafo) | `git commit -m "..."` |

**A regra de ouro:** nada entra num commit por acidente. Você escolhe os
arquivos (stage) e depois confirma (commit).

## 2.2 Repositório, `.git` e working tree

- **Repositório**: a pasta do projeto + a subpasta oculta `.git/`, onde
  mora todo o histórico (banco de dados do Git).
- **Working tree** (árvore de trabalho): os arquivos visíveis que você edita.
- O **statusbar** (embaixo) mostra o caminho real da working tree quando você
  passa o mouse sobre ele.

```bash
git init                    # cria um repositório novo na pasta atual
git status                  # o que mudou (equivalente à coluna File Status)
git status --porcelain      # versão compacta, para scripts
```

## 2.3 Commit e hash

Um **commit** é uma foto imutável: lista de arquivos + mensagem + autor +
data + referência para o commit anterior. Cada um ganha um **hash** de 40
caracteres (no TreeLine aparecem os 7 primeiros, ex.: `3d3bee8`).

```bash
git log --oneline --graph --all   # lista visual (parecido com o grafo do app)
git show 3d3bee8                  # detalhe de um commit
```

Mensagem de commit boa: imperativo e curto (“adiciona validação de e-mail”).
Conventional Commits (`feat:`, `fix:`, `docs:`) são comuns e valem a pena.

## 2.4 HEAD, branch e checkout

- **HEAD** é “onde você está agora” — normalmente aponta para o último
  commit do branch atual. No grafo ele aparece como badge `HEAD -> main`.
- **Branch** é um apontador móvel para um commit. Criar branch = criar um
  marcador barato; commitar nela move o marcador.
- **Checkout** é mudar de linha do tempo: seus arquivos são atualizados para
  o estado da branch escolhida.

```bash
git branch                   # lista branches
git switch -c feature/x      # cria e entra
git switch main              # volta para a main
git log main..feature/x      # o que existe só na feature
```

## 2.5 Remoto, origin e upstream

O **remoto** é outra cópia do repositório (GitHub, GitLab, servidor da
empresa). O nome padrão é **`origin`**.

```bash
git remote -v                          # quais remotos existem
git push -u origin main                # envia e cria o upstream (rastro)
git fetch --all --prune                # baixa o estado dos remotos
git pull --ff-only                     # busca + fast-forward (sem merge escondido)
```

**Ahead/behind** (no TreeLine: setas `↑ 2 ↓ 0` na statusbar e badges na
sidebar):

- `↑ 2` (*ahead*) → você tem 2 commits que **o remoto ainda não tem** →
  precisa de **push**.
- `↓ 1` (*behind*) → o remoto tem 1 commit que **você ainda não tem** →
  precisa de **pull** (ou fetch + merge).

**Upstream** é o “par” do seu branch no remoto (`main` ↔ `origin/main`). Ele
faz o `git push` e o `git pull` puro funcionarem sem argumentos.

## 2.6 Stash: a gaveta temporária

Guardar o trabalho pela metade **sem commitar**, para trocar de branch ou
limpar a mesa, e tirar de volta depois:

```bash
git stash push -u -m "wip"     # guarda (com arquivos novos, -u)
git stash list                 # lista
git stash pop                  # devolve e apaga da gaveta
git stash drop                 # descarta
```

Detalhe: o stash são commits de verdade, guardados fora de um branch — por
isso ele aparece no reflog e pode ser recuperado (capítulo 10).

## 2.7 Merge, rebase, cherry-pick e revert

| Operação | Ideia | Quando usar |
|---|---|---|
| **Merge** | Junta duas linhas, criando um commit com dois pais | Compartilhar trabalho pronto; preserva o histórico real |
| **Rebase** | Reescreve seus commits por cima do alvo, deixando tudo linear | Limpar histórico antes de publicar (não reescreva o que já foi pushado) |
| **Cherry-pick** | Copia **um** commit para o branch atual | Puxar só aquele fix para outra linha |
| **Revert** | Cria um commit **novo** que anula um anterior | Desfazer algo que já foi publicado, sem reescrever história |
| **Reset** | Move o ponteiro do branch (soft/mixed/hard) | Arrumar a ponta do branch local; hard apaga mudanças |

```bash
git merge feature/x            # junta
git rebase main                # reaplica seus commits sobre a main
git cherry-pick abc1234        # copia um commit
git revert abc1234             # anula com commit novo
git reset --soft HEAD~1        # desfaz commit mantendo tudo staged
```

## 2.8 Tag, reflog e bundle

- **Tag**: marcador nomeado para uma release (`v1.0.0`). Pode ser simples
  (aponta) ou *annotated* (tem mensagem e autor).
- **Reflog**: o “GPS” do Git — registra para onde o HEAD foi nos últimos
  meses. É o que salva quando você faz checkout/reset errado.
- **Bundle**: um arquivo com parte do histórico; o TreeLine gera um antes de
  operações destrutivas (`.git/treeline-backups/`).

```bash
git reflog                     # o que aconteceu com o HEAD
git tag -a v1.0.0 -m "release" # tag com mensagem
```

## 2.9 Mapa rápido: botão do TreeLine ↔ comando

| Botão / área | O que roda por baixo |
|---|---|
| Stage (arquivo) | `git add <arquivo>` |
| Unstage | `git restore --staged <arquivo>` |
| Commit | `git commit -m "..."` |
| Push | `git push` (e `git push --force-with-lease` sob demanda) |
| Pull | `git pull --ff-only` |
| Fetch | `git fetch --all --prune` |
| Merge | `git merge <branch>` (com preview) |
| Stash | `git stash push -u` / `pop` / `drop` |
| Reflog + Undo | `git reflog` + `git reset` com `git bundle` antes |
| Discard (arquivo) | `git restore <arquivo>` (novo não rastreado → lixeira) |

→ Continue em [3. Tour pela janela](03-tour-pela-janela.md)
