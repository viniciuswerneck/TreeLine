# 12. Glossário e erros comuns

## 12.1 Glossário A–Z

| Termo | Significado |
|---|---|
| **Amend** | Substituir o último commit por um novo (mensagem/arquivos corrigidos) |
| **Ahead / Behind** | `↑` commits locais não publicados / `↓` commits remotos não baixados |
| **Base (comum)** | O ancestral compartilhado de dois branches — o ponto onde eles divergiram |
| **Blame** | Quem escreveu cada linha de um arquivo (`git blame`) |
| **Branch** | Apontador móvel para um commit; “linha do tempo” |
| **Bundle** | Arquivo compacto com parte do histórico (backup do TreeLine) |
| **Checkout** | Trocar o HEAD (e os arquivos) para outra branch/commit |
| **Cherry-pick** | Copiar um commit específico para o branch atual |
| **Commit** | Foto imutável do repositório, com hash, autor e mensagem |
| **Conflict** | Ponto em que o Git precisa da sua escolha (capítulo 9) |
| **Credential helper** | Onde o Git guarda usuário/senha/token (`store`, keyring, cache) |
| **Detached HEAD** | HEAD apontando para um commit sem branch (perigoso se você commitar) |
| **Diff** | Comparação entre dois estados (disponível no painel lateral) |
| **Discard** | Voltar um arquivo ao estado do último commit |
| **Fast-forward (ff)** | Avançar o ponteiro sem criar commit de merge |
| **Fetch** | Baixar o estado do remoto **sem** mexer nos seus arquivos |
| **Force-with-lease** | Force push com rede de segurança (recusa se alguém empurrou) |
| **Git-flow** | Convenção `feature/`, `release/`, `hotfix/` + comandos |
| **Grafo** | O desenho de linhas/curvas do histórico |
| **HEAD** | “Onde você está agora” (aponta para o commit atual) |
| **Index / Stage** | Área de preparação da próxima foto (`git add`) |
| **Init** | Criar um repositório novo (`git init`) |
| **LFS** | Git Large File Storage — arquivos grandes fora do histórico normal |
| **Merge** | Juntar duas linhas (cria commit com dois pais) |
| **Origin** | Nome padrão do remoto principal |
| **Pull** | Fetch + aplicar no seu branch (aqui: `--ff-only`) |
| **Push** | Enviar commits para o remoto |
| **Reflog** | Registro de movimentações do HEAD (segunda chance) |
| **Rebase** | Reaplicar commits sobre outro ponto (deixa linear) |
| **Remote** | Outra cópia do repositório (GitHub, GitLab, servidor) |
| **Revert** | Anular um commit com um commit novo |
| **Rerere** | “Reuse recorded resolution” — reaplica resoluções de conflito |
| **Reset** | Mover o ponteiro do branch (soft/mixed/hard) |
| **Shallow / clone** | Cópia de um repositório remoto para a sua máquina |
| **Soft / Mixed / Hard** | Modos do reset: mantém stage / mantém arquivos / apaga |
| **Stash** | Gaveta temporária de mudanças |
| **Stage** | Selecionar arquivos para o próximo commit |
| **Status** | O que mudou (coluna File Status) |
| **Tag** | Marcador nomeado, ex.: `v1.0.0` |
| **Tracking / Upstream** | Par `local ↔ remoto` (ex.: `main ↔ origin/main`) |
| **Untracked** | Arquivo novo que o Git ainda não conhece (`?`) |
| **Working tree** | Os arquivos visíveis da pasta do projeto |

## 12.2 Tabela: terminal ↔ TreeLine

| No terminal | No TreeLine |
|---|---|
| `git status` | Painel **File Status** + statusbar |
| `git add <f>` / `git add -p` | **Stage** por linha / **Stage do hunk** / **Stage All** |
| `git commit -m` | Campo de mensagem + **Commit** (`Ctrl+Enter`) |
| `git diff` / `git diff --staged` | Painel de diff (Unified / Lado a lado) |
| `git log --graph` | Painel de histórico (grafo) |
| `git branch` / `git switch` | Sidebar (duplo clique) e diálogo **Branch** |
| `git merge` | Diálogo **Merge** (com preview) |
| `git rebase` / `-i` | Diálogo **Rebase** / **Rebase interativo** |
| `git cherry-pick` | Toolbar **Cherry-Pick** |
| `git revert` / `git reset` | Clique direito no commit |
| `git stash push/pop/drop` | Diálogo **Stash** + sidebar **Stashes** |
| `git push` / `pull` / `fetch` | Toolbar **Push / Pull / Fetch** |
| `git remote -v` / `add` | **Status de sync** |
| `git reflog` | **Histórico / Reflog** (+ Undo com backup) |
| `git tag` | Diálogo **Tag** |
| `git blame` | Clique direito no arquivo → **Blame** |
| `git config user.name/email` | Settings → **Identidade do autor** |
| `git flow …` | Toolbar **Git-flow** |
| `git lfs …` | Diálogo **Git LFS** |
| `git clean` | Clique direito → Discard (arquivo novo) |

## 12.3 Erros comuns e a saída

| Erro / sintoma | Causa provável | Saída |
|---|---|---|
| “Nada em stage — dê stage primeiro” | Commit sem `git add` | Dê stage nos arquivos (coluna Unstaged) |
| “working tree suja” ao trocar de branch | Mudanças não commitadas | **Stash + checkout** (o app oferece) ou commit primeiro |
| Push rejeitado (`non-fast-forward`) | Remoto adiantou | **Pull** → push |
| Push rejeitado (permissão/URL) | Credencial/URL errada | Settings do remoto → editar URL; `git remote -v`; SSH: `ssh -T git@github.com` |
| `Please tell me who you are` | Sem autor configurado | Settings → **Identidade do autor** |
| `Another git process seems to be running` (`index.lock`) | Operação anterior travou | Feche a outra op; sobrando lock, `rm .git/index.lock` |
| Conflito em `pull` | Capítulo 9 | Resolver no resolvedor → **Concluir merge** |
| Commits “sumiram” do grafo | Filtro ativo (combo de branches ou “só branch atual”) | Combo → **Todas as branches**; desligue o filtro da sidebar |
| Branch some ao criar | Nome com caracteres inválidos | Use `feature/xyz` (sem espaços/acentos) |
| `Permission denied (publickey)` | SSH sem chave | `ssh-keygen` + adicionar a chave no GitHub |
| LFS: “git-lfs not found” | Pacote ausente | `sudo apt install git-lfs` |
| App “travou” no splash | Janela não apareceu | Feche e abra de novo (`treeline-git-gui`) |
| ERRO ao empacotar/instalar pacote | Já existe outra versão | `sudo apt install ./treeline-git-gui_<ver>_amd64.deb` |

## 12.4 Cheatsheet de 10 linhas

```bash
git status                        # o que mudou
git add arquivo                   # escolher para a foto
git commit -m "feat: ..."         # tirar a foto
git log --oneline --graph --all   # ver o histórico
git switch -c feature/x           # nova linha do tempo
git pull --ff-only                # atualizar do remoto
git push                          # publicar
git stash push -u                 # guardar trabalho
git reflog                        # onde eu estive?
git restore arquivo               # voltar ao último commit
```

---

**Fim do manual.** Volte ao [índice](README.md).

TreeLine 0.6.4 — Werneck Lab · MIT ·
[Releases](https://github.com/viniciuswerneck/TreeLine/releases) ·
[Documentação do projeto](../docs/)
