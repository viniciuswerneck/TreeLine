# Política de Segurança

## Como reportar

Reporte vulnerabilidades de forma **privada** pelo recurso
[Security Advisories](https://github.com/viniciuswerneck/TreeLine/security/advisories/new)
do GitHub (aba *Security* → *Report a vulnerability*). Não abra issue pública
para falhas de segurança.

Inclua, se possível: versão afetada, passos de reprodução, impacto e uma
sugestão de correção. Trabalhamos para responder em até 7 dias.

## Escopo

O TreeLine é um cliente Git para Linux (Electron). Áreas de interesse:

- Vazamento de credenciais (`argv`, `config.json`, logs em
  `~/.config/TreeLine/logs`, `remote.origin.url`).
- Execução de comando a partir de conteúdo controlado pelo repositório
  (nomes de ref/branch caminhos maliciosos).
- Injeção via URLs de clone/remote, submódulos e `protocol.*`.
- Isolamento de processo (`contextIsolation`, `nodeIntegration`, CSP).

## Fora de escopo

- Repositórios já comprometidos ou comandos que o usuário escolhe rodar
  conscientemente (Custom Actions e terminal integrado executam comandos por
  design — são equivalentes a rodar no seu próprio shell).
- Vulnerabilidades em dependências **de desenvolvimento** que não entram no
  binário distribuído (ex.: `electron-builder`).

## Boas práticas do projeto

- Escritas no Git via CLI do sistema; sem senha/token em `argv`.
- Clone com token via `GIT_ASKPASS` (arquivo temporário `0600`, removido ao
  fim), nunca na linha de comando.
- `push` com `--force-with-lease`; `reset --hard`/`rebase` com confirmação e
  backup (`git bundle`).
- Auditoria de dependências de runtime no CI
  (`npm audit --omit=dev --audit-level=high`).
