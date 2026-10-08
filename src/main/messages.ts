export type UILang = 'en' | 'pt' | 'es'

export function asLang(v: unknown): UILang {
  return v === 'en' || v === 'pt' || v === 'es' ? v : 'en'
}

export const STR: Record<string, Record<UILang, string>> = {
  pushUpToDate: {
    en: 'Push done — nothing to update.',
    pt: 'Push concluído — nada para atualizar.',
    es: 'Push completado — nada que actualizar.'
  },
  pushDone: { en: 'Push done: {x}', pt: 'Push concluído: {x}', es: 'Push completado: {x}' },
  pushRejected: {
    en: 'Push rejected ({r}). Possible causes: no upstream set, permission, branch protection, or diverged history.',
    pt: 'Push rejeitado ({r}). Causas possíveis: sem upstream, permissão, proteção de branch, histórico divergente.',
    es: 'Push rechazado ({r}). Causas posibles: sin upstream, permiso, protección de rama, histórico divergente.'
  },
  pullUpToDate: { en: 'Pull done — already up to date.', pt: 'Pull concluído — já atualizado.', es: 'Pull completado — ya actualizado.' },
  pullDone: { en: 'Pull done: {x}', pt: 'Pull concluído: {x}', es: 'Pull completado: {x}' },
  fetchDone: { en: 'Fetch done: {x}', pt: 'Fetch concluído: {x}', es: 'Fetch completado: {x}' },
  fetchRemotePruned: { en: 'Fetch done: {x} (+{p} remotes pruned)', pt: 'Fetch concluído: {x} (+{p} remotos removidos)', es: 'Fetch completado: {x} (+{p} remotos eliminados)' },
  authNeeded: { en: 'Authentication needed ({h}). Check your Git credentials.', pt: 'Autenticação necessária ({h}). Verifique suas credenciais Git.', es: 'Autenticación necesaria ({h}). Verifica tus credenciales Git.' },
  lfsAuth: { en: 'LFS authentication needed ({h}).', pt: 'Autenticação LFS necessária ({h}).', es: 'Autenticación LFS necesaria ({h}).' },
  sshKey: { en: 'SSH key or agent issue. Check your SSH setup.', pt: 'Problema com chave SSH ou agente. Verifique sua configuração SSH.', es: 'Problema con clave SSH o agente. Verifica tu configuración SSH.' },
  noMergeMsg: { en: 'Merge failed: no merge message available. Abort or provide one.', pt: 'Merge falhou: sem mensagem de merge. Faça abort ou informe uma.', es: 'Merge falló: sin mensaje de merge. Aborta o proporciona uno.' },
  mergeUnresolved: { en: 'Cannot continue the merge: {n} file(s) still have conflicts ({f}). Resolve them first.', pt: 'Não dá para continuar o merge: {n} arquivo(s) ainda em conflito ({f}). Resolva antes.', es: 'No se puede continuar el merge: {n} archivo(s) siguen en conflicto ({f}). Resuélvelos primero.' },
  rebaseUnresolved: { en: 'Cannot continue the rebase: {n} file(s) still have conflicts ({f}). Resolve them first.', pt: 'Não dá para continuar o rebase: {n} arquivo(s) ainda em conflito ({f}). Resolva antes.', es: 'No se puede continuar el rebase: {n} archivo(s) siguen en conflicto ({f}). Resuélvelos primero.' },
  pickUnresolved: { en: 'Cannot continue the cherry-pick: {n} file(s) still have conflicts ({f}). Resolve them first.', pt: 'Não dá para continuar o cherry-pick: {n} arquivo(s) ainda em conflito ({f}). Resolva antes.', es: 'No se puede continuar el cherry-pick: {n} archivo(s) siguen en conflicto ({f}). Resuélvelos primero.' },
  revertUnresolved: { en: 'Cannot continue the revert: {n} file(s) still have conflicts ({f}). Resolve them first.', pt: 'Não dá para continuar o revert: {n} arquivo(s) ainda em conflito ({f}). Resolva antes.', es: 'No se puede continuar el revert: {n} arquivo(s) siguen en conflicto ({f}). Resuélvelos primero.' },
  conflictOursLabel: { en: 'ours — {r}', pt: 'nosso — {r}', es: 'nuestro — {r}' },
  conflictTheirsLabel: { en: 'theirs — {r}', pt: 'deles — {r}', es: 'suyo — {r}' },
  conflictNoBothSides: { en: 'Cannot keep both sides of {f}: one side was deleted (no stage 2 or 3).', pt: 'Não dá para manter os dois lados de {f}: um dos lados foi apagado (sem stage 2 ou 3).', es: 'No se pueden mantener ambos lados de {f}: un lado se borró (sin stage 2 ni 3).' },
  resetDone: { en: 'Reset {m} to {r} done (backup bundle kept).', pt: 'Reset {m} para {r} concluído (backup bundle guardado).', es: 'Reset {m} a {r} completado (backup bundle guardado).' },
  pushLeaseDone: { en: 'Force-push with lease done: {x}', pt: 'Force-push com lease concluído: {x}', es: 'Force-push con lease completado: {x}' },
  noUpstream: { en: 'No upstream configured for {b}. Set it first (Sidebar → branch → Set upstream).', pt: 'Sem upstream configurado para {b}. Configure antes (Sidebar → branch → Set upstream).', es: 'Sin upstream configurado para {b}. Configúralo antes (Sidebar → rama → Set upstream).' },
  prOpened: { en: 'No pull-request URL detected for remote {r} ({u}). Opened the repo URL instead.', pt: 'Nenhuma URL de pull-request detectada para o remoto {r} ({u}). Abri a URL do repo.', es: 'Ninguna URL de pull-request detectada para el remoto {r} ({u}). Abrí la URL del repo.' },

  // --- operações de rede: exit code != 0, timeout e cancelamento (runGitCancellable) ---
  opCancelled: { en: '{op} cancelled.', pt: '{op} cancelado.', es: '{op} cancelado.' },
  opTimeout: {
    en: '{op} timed out (2 min) and the process was killed. Check network/remote and try again.',
    pt: '{op} estourou o tempo (2 min) e o processo foi morto. Verifique a rede/remoto e tente de novo.',
    es: '{op} superó el tiempo (2 min) y el proceso fue matado. Revisa la red/remoto e inténtalo de nuevo.'
  },
  opFailed: { en: '{op} failed (exit {c}).', pt: '{op} falhou (exit {c}).', es: '{op} falló (exit {c}).' },
  authFail: {
    en: '{op} failed: authentication required ({d}). Check your Git credentials.',
    pt: '{op} falhou: autenticação necessária ({d}). Verifique suas credenciais Git.',
    es: '{op} falló: autenticación necesaria ({d}). Verifica tus credenciales Git.'
  },
  pullDivergent: {
    en: '{op} failed: local and remote diverged ({d}). Run merge or rebase first, then pull again.',
    pt: '{op} falhou: local e remoto divergiram ({d}). Faça merge ou rebase antes e puxe de novo.',
    es: '{op} falló: local y remoto divergieron ({d}). Haz merge o rebase antes y vuelve a tirar.'
  },
  fetchUpdated: { en: ' ({n} ref(s) updated)', pt: ' ({n} ref(s) atualizadas)', es: ' ({n} ref(s) actualizadas)' },
  lfsPullDone: { en: 'LFS pull done.', pt: 'LFS pull concluído.', es: 'LFS pull completado.' },
  lfsPushDone: { en: 'LFS push done.', pt: 'LFS push concluído.', es: 'LFS push completado.' },

  // --- validação de entrada ---
  cloneInvalidUrl: { en: 'Enter a valid repository URL.', pt: 'Informe uma URL de repositório válida.', es: 'Introduce una URL de repositorio válida.' },
  cloneUnsafeUrl: {
    en: 'That URL is not allowed (local file, loopback or ext:: transport).',
    pt: 'Essa URL não é permitida (arquivo local, loopback ou transporte ext::).',
    es: 'Esa URL no está permitida (archivo local, loopback o transporte ext::).'
  },
  nameEmpty: { en: 'Enter a name.', pt: 'Informe um nome.', es: 'Introduce un nombre.' },
  invalidRef: { en: 'Invalid reference: {n}', pt: 'Referência inválida: {n}', es: 'Referencia inválida: {n}' },
  invalidRefName: { en: 'Invalid branch/tag name: {n}', pt: 'Nome de branch/tag inválido: {n}', es: 'Nombre de rama/tag inválido: {n}' },
  nameInvalid: { en: 'Invalid name: {x}', pt: 'Nome inválido: {x}', es: 'Nombre inválido: {x}' },
  emailInvalid: { en: 'Enter a valid e-mail address.', pt: 'Informe um e-mail válido.', es: 'Introduce un correo válido.' },
  pathOutOfRepo: { en: 'Path outside the repository: {p}', pt: 'Caminho fora do repositório: {p}', es: 'Ruta fuera del repositorio: {p}' },
  unsafeRef: { en: 'Unsafe reference rejected: {x}', pt: 'Referência insegura rejeitada: {x}', es: 'Referencia insegura rechazada: {x}' },
  commitEmpty: { en: 'Nothing to commit — stage some changes first.', pt: 'Nada para commitar — faça stage das mudanças antes.', es: 'Nada que commitear — haz stage de los cambios antes.' },
  nothingStaged: { en: 'Nothing staged to commit.', pt: 'Nada em stage para commitar.', es: 'Nada en stage para commitear.' },
  commitNotFound: { en: 'Commit not found.', pt: 'Commit não encontrado.', es: 'Commit no encontrado.' },
  noTerminal: { en: 'No terminal available on this system.', pt: 'Sem terminal disponível neste sistema.', es: 'Sin terminal disponible en este sistema.' },
  noHunk: {
    en: 'Hunk #{n} not found — the file may have changed. Refresh and try again.',
    pt: 'Hunk nº {n} não encontrado — o arquivo pode ter mudado. Atualize e tente de novo.',
    es: 'Hunk n.º {n} no encontrado — el archivo pudo cambiar. Actualiza e inténtalo de nuevo.'
  },
  noLines: { en: 'No lines selected.', pt: 'Nenhuma linha selecionada.', es: 'Ninguna línea seleccionada.' },
  newBinary: { en: 'Binary file — content not shown.', pt: 'Arquivo binário — conteúdo não exibido.', es: 'Archivo binario — contenido no mostrado.' },
  newTruncated: { en: 'File too large — showing only the beginning.', pt: 'Arquivo grande demais — mostrando só o começo.', es: 'Archivo demasiado grande — mostrando solo el inicio.' },
  diffTruncated: { en: 'Diff too large — showing only the first 1 MB.', pt: 'Diff grande demais — mostrando só o primeiro 1 MB.', es: 'Diff demasiado grande — mostrando solo el primer 1 MB.' },
  revertNothing: { en: 'Nothing to revert.', pt: 'Nada para reverter.', es: 'Nada que revertir.' },

  // --- fluxos / operações em andamento ---
  checkoutDirty: {
    en: 'Cannot switch: local changes would be overwritten ({d}). Commit, stash or discard them first.',
    pt: 'Não dá para trocar: mudanças locais seriam sobrescritas ({d}). Faça commit, stash ou descarte antes.',
    es: 'No se puede cambiar: cambios locales serían sobrescritos ({d}). Haz commit, stash o descártalos antes.'
  },
  continueEmpty: { en: 'The command did not finish the operation: {cmd} ({out}).', pt: 'O comando não concluiu a operação: {cmd} ({out}).', es: 'El comando no terminó la operación: {cmd} ({out}).' },
  continueNextConflict: { en: '{n} file(s) still in conflict ({f}). Resolve them first.', pt: '{n} arquivo(s) ainda em conflito ({f}). Resolva antes.', es: '{n} archivo(s) siguen en conflicto ({f}). Resuélvelos primero.' },
  mergeConflicts: { en: 'Merge stopped on conflicts ({d}). Resolve them and continue.', pt: 'Merge parou em conflitos ({d}). Resolva e continue.', es: 'Merge se detuvo en conflictos ({d}). Resuélvelos y continúa.' },
  rebaseConflicts: { en: 'Rebase stopped on conflicts ({d}). Resolve them and continue.', pt: 'Rebase parou em conflitos ({d}). Resolva e continue.', es: 'Rebase se detuvo en conflictos ({d}). Resuélvelos y continúa.' },
  pickConflicts: { en: 'Cherry-pick stopped on conflicts ({d}). Resolve them and continue.', pt: 'Cherry-pick parou em conflitos ({d}). Resolva e continue.', es: 'Cherry-pick se detuvo en conflictos ({d}). Resuélvelos y continúa.' },
  revertConflicts: { en: 'Revert stopped on conflicts ({d}). Resolve them and continue.', pt: 'Revert parou em conflitos ({d}). Resolva e continue.', es: 'Revert se detuvo en conflictos ({d}). Resuélvelos y continúa.' },
  stashConflicts: { en: 'Applying the stash hit conflicts ({d}). Resolve them first.', pt: 'Aplicar o stash gerou conflitos ({d}). Resolva antes.', es: 'Aplicar el stash generó conflictos ({d}). Resuélvelos primero.' },
  submoduleFail: { en: 'Submodule update failed ({d}).', pt: 'Atualização de submódulo falhou ({d}).', es: 'Actualización de submódulo falló ({d}).' },
  backupRestored: {
    en: 'Backup restored: {n} branch(es) under {x} — rename them to keep.',
    pt: 'Backup restaurado: {n} branch(es) em {x} — renomeie para manter.',
    es: 'Backup restaurado: {n} rama(s) en {x} — renómbralas para conservar.'
  },
  flowMissing: { en: 'Branch {x} does not exist.', pt: 'O branch {x} não existe.', es: 'La rama {x} no existe.' },
  flowNoBase: {
    en: 'No base branch found for {t} (expected {n}). Create it first.',
    pt: 'Sem branch base para {t} (esperado {n}). Crie-a antes.',
    es: 'Sin rama base para {t} (esperado {n}). Créala antes.'
  },
  flowTaken: { en: 'Branch {x} already exists (clashes with {y}).', pt: 'O branch {x} já existe (colide com {y}).', es: 'La rama {x} ya existe (colisiona con {y}).' }
}

export function mx(lang: UILang, key: string, vars?: Record<string, string | number>): string {
  let s: string = STR[key]?.[lang] ?? STR[key]?.['en'] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
  }
  return s
}
