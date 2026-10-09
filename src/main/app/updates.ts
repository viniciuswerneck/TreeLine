// Check de atualização: compara a versão do pacote com o último release no
// GitHub. Sem telemetria out-bound — 1 request GET quando pedido explicitamente.

import { app, ipcMain } from 'electron'

ipcMain.handle('treeline:checkUpdates', async () => {
  const current = app.getVersion()
  try {
    const res = await fetch('https://api.github.com/repos/viniciuswerneck/TreeLine/releases/latest', {
      headers: { 'User-Agent': `treeline/${current}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10_000)
    })
    if (!res.ok) return { current, latest: null, url: '' }
    const json = (await res.json()) as { tag_name?: string; html_url?: string }
    return { current, latest: json.tag_name?.replace(/^v/, '') ?? null, url: json.html_url ?? '' }
  } catch {
    return { current, latest: null, url: '' }
  }
})