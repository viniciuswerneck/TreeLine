# TreeLine — Plano de ação (pente-fino para virar premium)

> Criado em 2026-10-06 a partir da revisão geral do programa.
> Linguagem simples, pensada para decidir **o que fazer primeiro**.
> Cada item tem: o que é, por que importa, onde fica e o esforço.
>
> **Esforço:** 🟢 pequeno (até 1 dia) · 🟡 médio (2-4 dias) · 🔴 grande (1 semana ou mais)

## Como usar este documento

1. Trabalhe **de cima para baixo** dentro de cada parte.
2. Só comece uma parte nova quando a anterior estiver com os itens 🔴 resolvidos.
3. Marque `[x]` ao concluir.
4. Ao fim de cada parte, rodar a validação (ver fim do documento).

## Legenda de prioridade

| Símbolo | Significado |
|---|---|
| 🔴 | Urgente — risco de perder trabalho, fazer besteira ou falha de segurança |
| 🟠 | Importante — atrapalha o uso no dia a dia |
| 🟡 | Polimento — deixa o produto mais bonito/agradável |
| 🔵 | Futuro — recurso novo, pode esperar |

---

## Parte 1 — Confiança nos avisos (o mais urgente)

**Objetivo:** nunca apagar algo sem o usuário confirmar, e nunca confirmar sem querer.

| # | O que fazer | Por que importa | Onde | Esforço | Feito |
|---|---|---|---|---|---|
| 1.1 | Fazer o Enter só confirmar quando o foco estiver **dentro** da janelinha de confirmação | Hoje Enter de qualquer lugar aciona "OK" e pode forçar push/reset | `ConfirmDialog.tsx:16` | 🟢 | [x] |
| 1.2 | Abrir o aviso com o foco no botão **Cancelar**, não no destrutivo | Padrão seguro; evita confirmar por reflexo | `ConfirmDialog.tsx:37` | 🟢 | [x] |
| 1.3 | Reset precisa de confirmação (e deixar claro que é irreversível) | Hoje o Reset dispara direto; o botão diz "Undo" mas apaga | `ResetDialog.tsx:38` | 🟢 | [x] |
| 1.4 | Renomear botão do Reset de "Undo" para "Reset" (ou "Fazer reset") | Rótulo mentiroso confunde | `ResetDialog.tsx:40` | 🟢 | [x] |
| 1.5 | Trocar o aviso nativo do "descartar arquivo" pelo aviso interno do app | Hoje é o único que usa janela do sistema; quebra visual e tema | `main/index.ts:2874` | 🟡 | [x] |
| 1.6 | Padronizar: toda ação que apaga passa pelo mesmo `confirmAction` | Regra única, sem exceções | vários | 🟡 | [x] |
| 1.7 | Botão de "forçar delete" de branch pedir confirmação também | Hoje o fluxo normal pede, o forçado não | `BranchDialog.tsx:127` | 🟢 | [x] |
| 1.8 | Corrigir rótulos errados (Editar URL aparecendo como "Rename"; fechar LFS com texto errado) | Parece descuido | `RemotesDialog.tsx`, `LfsDialog.tsx` | 🟢 | [x] |

**Feito em 2026-10-06.** Detalhes: remoção do Enter global do `ConfirmDialog` (Enter agora age só via botão focado; Esc continua global) e foco inicial no Cancelar. Reset abrir `ConfirmDialog` reutilizando `reset.title/msg/detail` + botão renomeado para `dlg.reset`. Discard de arquivo migrado para o `confirmAction` interno (novas chaves `file.discardT/M/TrackedD/UntrackedD`, `dlg.discard`) e dialog nativo + strings `mx` removidos do main. Abort de merge/cherry-pick/rebase (e o do resolver de conflitos) agora confirma antes (chaves `abort.confirmT/M/D`). Force-delete de branch sempre confirma (chave `branch.delSafeD` para o caminho normal). Rótulos: salvar URL usa `dlg.save` (novo) e fechamento do LFS usa `dlg.close` (novo sinal: `dlg.save` nas 3 línguas). Validação: `tsc --noEmit` limpo, Vitest 78/78, `npm run build` ok.

**Resultado esperado:** nenhuma ação destrutiva sem confirmação clara, e impossível confirmar sem querer.

---

## Parte 2 — Segurança interna (blindar a porta de comandos)

**Objetivo:** mesmo que a tela mande algo estranho, o "motor" do Git recusa.

| # | O que fazer | Por que importa | Onde | Esforço | Feito |
|---|---|---|---|---|---|
| 2.1 | Validar todo nome de branch/tag/hash/ref antes de usar | Nomes com `-` viram opções perigosas do Git | `main/index.ts` (vários handlers) | 🟡 | [x] |
| 2.2 | Validar o conteúdo do rebase interativo (não confiar nos `action`/`hash` da tela) | Poderiam injetar comandos de sistema no rebase | `main/index.ts:2803` | 🟢 | [x] |
| 2.3 | Impedir leitura de arquivo por caminho absoluto no diff de arquivo novo | Poderia ler qualquer arquivo do computador | `main/index.ts:1534` | 🟢 | [x] |
| 2.4 | Bloquear caminhos com `../` (sair da pasta do projeto) ao resolver conflito/discard | Poderia escrever/apagar fora do projeto | `main/index.ts:2593,2615,2881` | 🟢 | [x] |
| 2.5 | Validar URL de clone (não aceitar começar com `-` nem esquemas perigosos) | Evita comandos escondidos no clone | `main/index.ts:1151` | 🟡 | [x] |
| 2.6 | Só abrir no navegador URLs `http/https` | Evita abrir esquemas estranhos | `main/index.ts:2855` | 🟢 | [x] |
| 2.7 | Push sempre com o nome do branch (nunca "empurrar tudo") | Evita reescrever branches sem querer | `main/index.ts:1657,2656` | 🟢 | [x] |
| 2.8 | Não deixar token de acesso aparecer no comando de clone | Token não deve aparecer em lista de processos | `main/index.ts:1151` | 🟡 | [x] |

**Feito em 2026-10-06.** Detalhes: helpers novos no main — `assertSafeRef` (rejeita valor começando com `-` e metacaracteres; reflog `HEAD@{2}` continua válido), `relPathSafe` (nenhum caminho absoluto nem `..`), `assertRebasePlan` (whitelist de actions `pick/reword/edit/squash/fixup/drop` + hash hex 7-40; nada de `x/exec`/`merge` cru) e `assertCloneUrl` (nada de `-` inicial, `ext::`, whitespace; esquemas só `http/https/ssh/git/file/ftp/ftps`). Aplicado em: merge, rebase onto, cherry-pick, revert, reset, tag (create/push/delete), checkout remote, undo reflog, blame, compare, rebase interativo (base + plano, mensagens higienizadas), diff de untracked, resolver de conflito (`resolveSideRaw`), apply de conflito (agora recebe `lang`) e discard. Push e force-push com refspec explícito `cur:upstreamBranch` (protege detached HEAD; `--force-with-lease` mantido). Clone: URL com senha é higienizada do argv e do `origin.url`; a senha vai por `GIT_ASKPASS` (script temporário 0600, removido no fim); `openPR` só abre http/https. Validação: `npm run typecheck` limpo (2 tsconfigs), Vitest 78/78, `npm run build` ok.

**Resultado esperado:** o "motor" valida tudo; uma tela comprometida não vira acesso ao computador.

---

## Parte 3 — Estabilidade ao trocar de repositório e sincronizar

**Objetivo:** trocar de aba rápido nunca mistura dados de repositórios diferentes.

| # | O que fazer | Por que importa | Onde | Esforço | Feito |
|---|---|---|---|---|---|
| 3.1 | Criar uma regra: "só aplico resultado se ainda estou no mesmo repositório" | Hoje resposta atrasada do repo A invade o repo B | `store.ts` (`refresh`, `loadMoreCommits`, `selectFile`…) | 🔴 | [x] |
| 3.2 | Corrigir "carregar mais commits" para não substituir a lista inteira por uma cópia velha | Pode apagar commits da tela | `store.ts:333` | 🟡 | [x] |
| 3.3 | Fazer a caixinha de confirmação não travar quando duas aparecem juntas | Hoje a primeira pergunta pode "sumir" e travar | `store.ts:1219` | 🟡 | [x] |
| 3.4 | Guardar o repositório "alvo" da ação no momento da confirmação | Force-push/reset não devem cair no repo errado | `store.ts:603` | 🟡 | [x] |
| 3.5 | Sincronização (push/pull/fetch) por repositório, não global | Operação no repo A não deve travar o repo B | `store.ts:355` | 🟡 | [x] |
| 3.6 | Ao trocar de repo, limpar também filtros, overlay de conflito, menu e confirmação | Hoje alguns estados "vazam" para o próximo repo | `store.ts:384` | 🟡 | [x] |
| 3.7 | Não deixar leituras concorrerem com escrita no arquivo de índice | Evita travar/corromper (`index.lock`) | `main/index.ts:391` | 🟡 | [x] |
| 3.8 | Corrigir o editor de todo do rebase para não ser global | Dois rebases ao mesmo tempo podem se atropelar | `main/index.ts:2805` | 🟢 | [x] |
| 3.9 | Tratar erro do Git como "tem conflito" em vez de ignorar | Hoje um erro pode ser lido como "sem conflito" | `main/index.ts:684` | 🟢 | [x] |
| 3.10 | Adicionar "Pular" (`--skip`) nos conflitos | Não ficar preso quando o Git não avança | `main/index.ts` | 🟢 | [x] |

**Feito em 2026-10-06.** Detalhes: guarda "mesmo repositório" no `refresh`, `loadMoreCommits` e `selectFile` (resposta atrasada do repo A é descartada nunca pintando no repo B); `loadMoreCommits` agora dedupe/annex pela lista ATUAL, não uma cópia capturada (não perde commits se um refresh recarregou a página 0 no meio). `confirmAction` virou fila (duas confirmações simultâneas não "somem"; trocar de repo cancela as pendentes). Force-push/publish/reset/revert capturam o repo ANTES da confirmação e passam ao `runOp` (recebe repo opcional) — a ação nunca cai no repo errado se o usuário trocou de aba. Sync (push/pull/fetch) ganhou `syncRepo`: toast e cancelamento são por repo, e sucesso/erro só pintam na aba do repo. Trocar de repo limpa filtros (`filter`, `branchFilter`), overlay de conflito, `confirmState` e sync. Main: `readIndexOp` faz o `getStatus` esperar escritas enfileiradas do repo (evita disputa de `index.lock`; leituras continuam paralelas entre si); editor do rebase interativo já é serializado por `enqueueGlobal` (documentado); `unmergedPaths` não engole mais erro de git (vira "tem conflito" real em vez de "sem conflito"); Skip (`--skip`) novo para rebase/cherry-pick/revert via handlers IPC + botões no `RebaseDialog`, `PickDialog`, `ConflictResolver` e `StatusBar` (chave `cr.skipOp`, 3 línguas). Validação: `npm run typecheck` limpo (2 tsconfigs), Vitest 78/78, `npm run build` ok.

**Resultado esperado:** navegar entre projetos rápido é seguro; nada de dados trocados.

---

## Parte 4 — Feedback: carregando, vazio e erros

**Objetivo:** o usuário sempre sabe se algo está carregando, vazio ou deu erro.

| # | O que fazer | Por que importa | Onde | Esforço | Feito |
|---|---|---|---|---|---|
| 4.1 | Separar "carregando…" de "vazio" no Blame e no Histórico de arquivo | Hoje parece vazio enquanto busca | `store.ts:1004,1017`; dialogs | 🟢 | [ ] |
| 4.2 | Corrigir mensagem do rebase interativo quando dá erro (hoje diz "sem commits") | Mensagem mentirosa confunde | `RebaseInteractiveDialog.tsx:24` | 🟢 | [ ] |
| 4.3 | Busca de arquivo (GoToFile) com estado próprio e texto certo | Hoje usa "nenhum comando" e idioma fixo | `GoToFile.tsx:42,62` | 🟢 | [ ] |
| 4.4 | Mostrar progresso e permitir cancelar o clone | Repo grande parece congelado | `store.ts:1246` | 🟡 | [ ] |
| 4.5 | Indicador de carregamento em stage/unstage/commit todas as listas | Evita duplo clique e "travou?" | `store.ts` vários | 🟡 | [ ] |
| 4.6 | Erros de hooks (pre-commit) explicados, não genéricos | Ajuda a entender o bloqueio | `store.ts:1232` | 🟡 | [ ] |
| 4.7 | Erro com `aria-live` para leitor de tela | Acessibilidade | `StatusBar.tsx:109` | 🟢 | [ ] |
| 4.8 | Não zerar toast de sincronização quando o cancelar falha | Hoje diz "cancelado" mas continua | `store.ts:591` | 🟢 | [ ] |

**Resultado esperado:** nunca mais "acho que travou".

---

## Parte 5 — Acessibilidade e navegação por teclado

**Objetivo:** usar o TreeLine inteiro sem mouse.

| # | O que fazer | Por que importa | Onde | Esforço | Feito |
|---|---|---|---|---|---|
| 5.1 | Prender o foco dentro das janelinhas (Tab não sai para trás) | Padrão de modal | `Dialog.tsx`, `ConfirmDialog.tsx`, `SettingsDialog.tsx`, `ConflictResolver.tsx` | 🟡 | [ ] |
| 5.2 | Devolver o foco ao botão que abriu, ao fechar | Não se perder com teclado | mesmos acima | 🟢 | [ ] |
| 5.3 | Setas para navegar em menus, abas e lista de branches | Hoje só Tab | `ContextMenu.tsx`, `TabBar.tsx`, `BranchCombo.tsx` | 🟡 | [ ] |
| 5.4 | Tornar linhas do histórico e dos arquivos navegáveis por teclado | Hoje são "div" sem foco | `HistoryGraph.tsx`, `DetailsPanel.tsx` | 🟡 | [ ] |
| 5.5 | Permitir abrir/recolher seções da lateral pelo teclado | Hoje só clique | `Sidebar.tsx:9` | 🟢 | [ ] |
| 5.6 | Estado visual de foco em todos os botões | Não dá para ver onde está o teclado | `styles.css` | 🟡 | [ ] |
| 5.7 | Não usar só cor para indicar estado (status, conflito, comparação) | Daltônicos e leitores de tela | `StatusBar.tsx`, `styles.css` | 🟢 | [ ] |

**Resultado esperado:** fluxo completo (abrir → stage → commit → push) só no teclado.

---

## Parte 6 — Tradução e textos fixos

**Objetivo:** 100% dos textos na língua escolhida.

| # | O que fazer | Por que importa | Onde | Esforço | Feito |
|---|---|---|---|---|---|
| 6.1 | Traduzir a paleta de comandos (ctrl+K) | Toda a lista está em inglês fixo | `CommandPalette.tsx:59-84` | 🟢 | [ ] |
| 6.2 | Traduzir rótulos do resolvedor de conflito | Inglês fixo visível | `ConflictResolver.tsx:21-37` | 🟢 | [ ] |
| 6.3 | Traduzir rebase interativo ("Base", "Load", "main") | Mistura de idiomas | `RebaseInteractiveDialog.tsx:73-77` | 🟢 | [ ] |
| 6.4 | Traduzir Histórico de arquivo e "Ver alteração" | Português fixo quebra EN/ES | `FileHistoryDialog.tsx:74-77` | 🟢 | [ ] |
| 6.5 | Traduzir busca de arquivo e rótulo "Commit" | Fixos | `GoToFile.tsx:42`, `DetailsPanel.tsx:238` | 🟢 | [ ] |
| 6.6 | Versão do app dinâmica (não fixa no rodapé) | Evita ficar desatualizada | `StatusBar.tsx:117` | 🟢 | [ ] |
| 6.7 | Apagar as ~22 traduções não usadas | Faxina, evita confusão | `i18n.ts` | 🟢 | [ ] |
| 6.8 | Melhorar plurais ("1 arquivo(s)" → "1 arquivo") | Gramática em PT/ES | `i18n.ts` | 🟡 | [ ] |

**Resultado esperado:** nenhum texto "solto" em idioma errado.

---

## Parte 7 — Visual e polimento (design system)

**Objetivo:** cara de produto caro, seguindo o padrão de `docs/06-design-system.md`.

| # | O que fazer | Por que importa | Onde | Esforço | Feito |
|---|---|---|---|---|---|
| 7.1 | Padronizar cantos (8px botões, 12px modais) | Desalinhamento sutil | `styles.css:304,351` | 🟢 | [ ] |
| 7.2 | Estado de botão desabilitado (mais apagado e sem hover) | Hoje parece clicável quando não está | `styles.css:349` | 🟢 | [ ] |
| 7.3 | Cores de diff/status adaptadas a cada tema | Baixo contraste em temas claros | `styles.css` | 🟡 | [ ] |
| 7.4 | Animação só em posição/opacidade | Regra do design system | `styles.css` (vários) | 🟡 | [ ] |
| 7.5 | Aumentar área de clique dos botões pequenos | WCAG / dedo/mouse | `styles.css` | 🟢 | [ ] |
| 7.6 | Ver mudanças em árvore de pastas | Projetos grandes ficam difíceis | `DetailsPanel.tsx` | 🟡 | [ ] |
| 7.7 | Layout das colunas de arquivos flexível (não largura fixa 240px) | Transborda em janela estreita | `styles.css:340` | 🟡 | [ ] |
| 7.8 | Barra do topo com dica de rolagem quando não cabe | Botões "somem" sem aviso | `styles.css:139` | 🟢 | [ ] |

**Resultado esperado:** consistência visual e uso confortável em qualquer tamanho de janela.

---

## Parte 8 — Recursos que faltam (paridade SourceTree)

**Objetivo:** cobrir o que usuários avançados esperam.

| # | O que fazer | Para quê | Esforço | Feito |
|---|---|---|---|---|
| 8.1 | Busca por conteúdo no código (pickaxe) | Achar onde um texto mudou | 🟡 | [ ] |
| 8.2 | Configurações de diff/merge no Settings | Ajustar contexto, espaço, ferramenta | 🟡 | [ ] |
| 8.3 | Worktrees (várias pastas/branches) | Trabalhar em paralelo | 🔴 | [ ] |
| 8.4 | Bisect | Achar commit que quebrou | 🔴 | [ ] |
| 8.5 | Assinar commits (GPG) e verificar | Times que exigem | 🔴 | [ ] |
| 8.6 | Opções de commit (signoff, no-verify, autor, allow-empty) | Casos especiais | 🟡 | [ ] |
| 8.7 | Merge com squash/no-commit/estratégias | Fluxos de PR | 🟡 | [ ] |
| 8.8 | Cherry-pick em faixa e com `-x` | Portar vários commits | 🟡 | [ ] |
| 8.9 | Submódulos: adicionar/remover/sincronizar | Além do "update" atual | 🟡 | [ ] |
| 8.10 | Editar `.gitignore` pelo app | Evitar terminal | 🟢 | [ ] |
| 8.11 | Blame na lateral do código (inline) | Ver autoria sem modal | 🟡 | [ ] |
| 8.12 | Abas no detalhe do commit (Resumo/Arquivos/Diff/Blame) | Organização estilo SourceTree | 🟡 | [ ] |
| 8.13 | Feedback de hooks (pre-commit) | Entender bloqueios | 🟡 | [ ] |
| 8.14 | Apagar branch remota | Limpeza de remoto | 🟢 | [ ] |

**Resultado esperado:** paridade real com SourceTree para trabalho avançado.

---

## Parte 9 — Ideias premium (diferencial de mercado)

**Objetivo:** fazer o TreeLine ser desejado, não só equivalente.

| # | Ideia | Ganho | Esforço | Feito |
|---|---|---|---|---|
| 9.1 | "Desfazer" global de operação (usando backups existentes) | Segurança e confiança | 🟡 | [ ] |
| 9.2 | Arrastar commits no grafo (squash/reordenar) | Fluxo visual poderoso | 🔴 | [ ] |
| 9.3 | Paleta estilo VS Code (busca inteligente + atalhos visíveis) | Produtividade | 🟡 | [ ] |
| 9.4 | Painel do repositório (ahead/behind, PRs, CI) | Visão geral | 🔴 | [ ] |
| 9.5 | Integração GitHub/GitLab (criar PR/issue, checkout de PR) | Menos ir ao navegador | 🔴 | [ ] |
| 9.6 | Tela de boas-vindas com recentes + clone + tutorial | Onboarding premium | 🟡 | [ ] |
| 9.7 | Mensagem de commit assistida (opt-in) | Conveniência | 🟡 | [ ] |
| 9.8 | Layouts/workspaces salvos, modo foco | Times diferentes | 🟡 | [ ] |
| 9.9 | Busca global (código + histórico + comandos) | Navegação única | 🔴 | [ ] |

**Resultado esperado:** identidade própria; não é só "clone do SourceTree".

---

## Ordem recomendada (cronograma)

| Sprint | Foco | Partes | Resultado |
|---|---|---|---|
| 1 | Confiança e segurança | Parte 1 ✅ + Parte 2 ✅ | Nada perigoso acontece sem querer |
| 2 | Estabilidade | Parte 3 ✅ | Trocar de repo e sincronizar sem sustos |
| 3 | Feedback e clareza | Parte 4 + Parte 6 | Sem "travou?" e sem texto errado |
| 4 | Acessibilidade e visual | Parte 5 + Parte 7 | Usável por teclado, cara de premium |
| 5 | Paridade | Parte 8 | Recursos avançados |
| 6 | Diferencial | Parte 9 | Marca própria |

---

## Como validar (ao fim de cada parte)

Rodar na ordem:

1. `npm run typecheck` — checagem de tipos.
2. `npm test` — testes automáticos (esperado 78/78+).
3. `npm run build` — build sem erros.
4. Harnesses de interface (precisam do app aberto com `--remote-debugging-port=9222`):
   - `npm run test:ui` (37/37)
   - `npm run test:ui:new` (40/40)
   - harnesses de conflito/merge/painéis em `/tmp/opencode/*.mjs`
5. Teste manual do fluxo: abrir repo → stage → commit → push.
6. Atualizar `docs/05-estado.md` (data, feito, próximo) e `docs/02-roadmap.md`.

## Registro de progresso

| Data | Parte | O que foi feito |
|---|---|---|
| 2026-10-06 | Parte 1 (Sprint 1) | Confiança nos avisos completa: Enter só no modal, foco no Cancelar, reset/discard/abort/force-delete padronizados no `confirmAction`, rótulos corrigidos. Validação: tsc limpo, Vitest 78/78, build ok. Commit `55a43d6` pushado. |
| 2026-10-06 | Parte 2 (Sprint 1) | Segurança interna: validação de refs/hashes/paths/URLs no main, rebase-i com whitelist, push com refspec explícito, token do clone fora do argv (GIT_ASKPASS), openPR só http/https. Validação: typecheck (2 configs), Vitest 78/78, build ok. |
| 2026-10-06 | Parte 3 (Sprint 1) | Estabilidade: guarda "mesmo repo" em refresh/loadMore/selectFile, confirmAction em fila, repo capturado antes de confirmar (push/reset), sync por repo, limpeza total ao trocar de aba, `readIndexOp` (status não briga com index.lock), erro de git vira conflito real, Skip (--skip) em rebase/pick/revert. Validação: typecheck (2 configs), Vitest 78/78, build ok. |

---

*TreeLine — Werneck Lab. Documento vivo; atualizar conforme os itens forem concluídos.*
