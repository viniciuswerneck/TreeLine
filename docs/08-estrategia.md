# TreeLine — Estratégia de produto

> Documento vivo. Define o **nicho**, as **camadas** de execução e os **critérios** de "melhor da categoria".
> As táticas dia-a-dia vivem em `docs/07-plano-de-acao.md`; este doc é a estrela polar.

## Nicho (a categoria que queremos ser o melhor)

> **O Git GUI Linux `local-first`, imbatível em merge/rebase/conflito e em segurança — familiar a quem vem do SourceTree. Sem conta, sem nuvem, sem surpresa.**

Por que esse espaço está vago:

| Concorrente | Onde está | O que ele NÃO é |
|---|---|---|
| GitKraken | pago + cloud | não é local-first, não é grátis |
| GitButler | startup, PR-stack, AI | não é familiar ao SourceTree, novo a cada semana |
| lazygit | terminal | não é GUI desktop |
| VS Code git | embutido | não é um cidadão de GUI dedicado |

Meta: o **default install** do ex-usuário de SourceTree no Ubuntu/Debian — abre,
compreende o repositório, resolve o conflito e **nunca** destrói trabalho sem aviso.

## Camadas

### Camada 0 — Pagar a dívida (congelamento de features)
Destrava a executabilidade. Nenhuma feature divertida até fechar.

1. **Parte 10 completa** (`docs/07`) — 10.4 main por domínio → 10.5 infra `app/*` → 10.6 slices do store → **10.7 guardrail** (`check:structure`: `madge --circular` + tamanhos) → 10.8 docs de arquitetura. Regra "move, não muda"; 1 commit revisável por passo; bateria de validação completa antes/depois.
2. **Testes de integração do motor** — handlers como funções puras `(ctx, repo, args)`; Vitest contra repos `/tmp` descartáveis. Alvo: **cobertura ≥ 60% em `src/main/git/*`**.
3. **i18n sem mochila morta** — script no CI que falha em chaves sem uso estático; limpar as ~40 ×3 idiomas.
4. **Fixes descobertos na auditoria** — bookmark com diretório sumido vira erro claro (nunca "vazio"); runner mata a árvore do processo; **profiling local opt-in** (`~/.config/TreeLine`, sem nuvem).
5. **A11y/visual residual** — itens 7.3/7.6/7.8 e foco em diálogos.

**Regra:** zero feature nova até a Camada 0 fechar.

### Camada 1 — Ganhar o nicho (3 pilares mensuráveis)

**P1 · Cinema de merge/rebase/conflito (a marca)**
- 9.2 (arrastar commits no grafo) + **preview do novo grafo em dry-run** antes de executar.
- Resolvedor: "resolver restantes deste lado", **snapshot da resolução** (o que escolhi e por quê → histórico), estado persistente de continuar/abortar.
- Rebase visual interativo e declarativo, com backup garantido.

**P2 · Local-first / Undo universal / Nunca destrói**
- **Time machine**: linha do tempo dos bundles/undo por operação + "ver onde estava" (diff) + restore com confirmação e novo backup.
- **Preview antes do destrutivo**: o diff que será perdido no discard; impacto do reset.
- **Proteções por branch** configuráveis por repo.

**P3 · Velocidade e escala (prova pública)**
- Repo de **100k commits abre ≤ 2s**; status ≤ 50ms; grafo 60fps@100k.
- **Migração assistida do SourceTree** (bookmarks/layout).

### Camada 2 — Distribuição e prova (depois do produto)
- Flatpak + AUR; **CI smoke-testa o artefato** (xvfb) — "instala em 1 comando e abre".
- **Benchmarks públicos no README** (tempos, memória, crash-free).
- **Playbook de produto**: persona explícita + lista do que não fazemos (ex.: não virar app de PR/cloud).

## Critérios de "melhor da categoria" (aceitos por medição)

- Abre repo de 100k commits ≤ 2s.
- Status ≤ 50ms.
- Grafo a 60fps com 100k commits.
- Cobertura de teste de `src/main/git/*` ≥ 60%.
- CI roda o artefato (smoke) com zero erro.
- WCAG AA nos diálogos e navegação principal.
- 7 dias de uso real sem crash e sem "destruiu sem avisar".

## Não-fazemos (guarda-corpo)

- Não coletamos dados do usuário (profiling é local e opt-in).
- Não virar cliente de PR/cloud (isso é GitButler/GitHub Desktop).
- Sem senha/token fora do git do sistema (credenciais via `credential.helper`/ssh-agent).
- Pendências de performance só migram p/ Rust/Tauri com fato novo medido (ADR-001).

---

*TreeLine — Werneck Lab. Estratégia acima de tática; `docs/07` acima da linha de código.*