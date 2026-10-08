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
  prOpened: { en: 'No pull-request URL detected for remote {r} ({u}). Opened the repo URL instead.', pt: 'Nenhuma URL de pull-request detectada para o remoto {r} ({u}). Abri a URL do repo.', es: 'Ninguna URL de pull-request detectada para el remoto {r} ({u}). Abrí la URL del repo.' }
}

export function mx(lang: UILang, key: string, vars?: Record<string, string | number>): string {
  let s: string = STR[key]?.[lang] ?? STR[key]?.['en'] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
  }
  return s
}
