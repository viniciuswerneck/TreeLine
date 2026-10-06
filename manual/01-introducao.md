# 1. Introdução e instalação

## O que é o Git (em 1 minuto)

O Git é um **controle de versões**: ele guarda o histórico dos arquivos de um
projeto. Toda vez que você pede um *commit*, o Git tira uma “foto” daquele
momento e guarda quem mudou o quê, quando e por quê. Você pode voltar para
qualquer foto, comparar duas, criar uma linha paralela de desenvolvimento e
juntar tudo depois.

Três ideias resolvem 90% da confusão de quem está começando:

1. **Arquivos vivem em 3 estados** — no seu disco (o que você edita), no
   *stage* (o que você escolheu para a próxima foto) e no *histórico* (fotos
   já tiradas). Dar “stage” é montar a foto; commitar é revelar.
2. **Branch é uma linha do tempo.** `main` é a linha principal; uma branch
   `feature/x` é uma linha paralela que depois se junta (merge).
3. **Nada se perde fácil.** Commit, branch, stash e reflog são botões de
   voltar. Errou? Dá para desfazer quase tudo (capítulo 10).

O [capítulo 2](02-conceitos-git.md) detalha cada ideia com diagramas.

## Por que o TreeLine

O TreeLine é um **Git GUI** (interface gráfica) com o fluxo familiar de quem
usava o SourceTree no Windows: toolbar de operações na frente, sidebar com
branches/remotos/stashes, histórico em grafo e painel de arquivos embaixo.
Ele não inventa uma linguagem própria: usa o `git` do sistema, então
*hooks*, LFS, credential helpers e SSH funcionam igual ao terminal.

## Instalação

```bash
# 1. confira a versão do git (precisa >= 2.40)
git --version

# 2. baixe o .deb na página de Releases e instale
sudo apt install ./treeline-git-gui_0.6.4_amd64.deb
```

Também existe o **AppImage** (`TreeLine-0.6.4.AppImage`) — para usá-lo:

```bash
chmod +x TreeLine-0.6.4.AppImage
./TreeLine-0.6.4.AppImage
```

> Nome do pacote: `treeline-git-gui` (não confunda com o pacote `treeline`
> do Ubuntu, que é outra coisa). O binário no PATH é `treeline-git-gui`.

Opcional, se você trabalha com arquivos grandes ou fluxo de release:

```bash
sudo apt install git-lfs git-flow
```

## Primeira abertura

Ao abrir, aparece a tela de splash e depois a janela principal. Na primeira
vez não há repositório aberto: a área do histórico mostra a mensagem de
boas-vindas e a sidebar traz a linha **“Abrir repositório…”**.

Para abrir um projeto:

1. Clique em **Abrir repositório…** na sidebar (ícone de pasta) e escolha a
   pasta do projeto (a que contém a subpasta `.git`).
2. O projeto entra na lista de **Bookmarks** (o “favorito” do TreeLine) e
   passa a abrir automaticamente da próxima vez.
3. Para trocar de projeto depois, é só clicar no outro bookmark — ou usar
   as abas no topo para ter **vários repositórios abertos ao mesmo tempo**
   (arraste as abas para reordenar).

Tudo o que o TreeLine guarda de configuração fica em `~/.config/TreeLine/`
(bookmarks, tema, idioma, atalhos, logs). **Nenhum dado é enviado para a
internet** — sem telemetria. Credenciais continuam no credential helper do
seu sistema (`~/.git-credentials`, GNOME Keyring, ssh-agent), nunca dentro
do app.

## Idioma e tema

Área → **Settings** (engrenagem, canto superior direito, ou `Ctrl+K` →
digite “Settings”):

- **Geral → Idioma**: English, Português, Español (o app detecta o idioma do
  sistema na primeira execução).
- **Geral → Tema**: 10 temas (5 claros + 5 escuros) + **System**, que segue o
  `prefers-color-scheme` do Ubuntu.

No próximo capítulo: os conceitos de Git que a interface vai representar.

→ Continue em [2. Conceitos de Git](02-conceitos-git.md)
