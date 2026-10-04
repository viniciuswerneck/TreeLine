import { useEffect, useState } from 'react'
import type { ActionResult, CustomAction } from '../../shared/types'
import { useStore } from '../store'
import Dialog, { useDialogRunner } from './Dialog'

/** Dialog Custom Actions: lista, executa (mostra saída), adiciona/remove. */
export default function CustomActionsDialog() {
  const current = useStore((s) => s.current)
  const tr = useStore((s) => s.tr)
  const { busy, run } = useDialogRunner()

  const [list, setList] = useState<CustomAction[]>([])
  const [name, setName] = useState('')
  const [cmd, setCmd] = useState('')
  const [result, setResult] = useState<ActionResult | null>(null)
  const [running, setRunning] = useState<string | null>(null)

  const reload = (): void => {
    window.treeline.getCustomActions().then(setList).catch(() => setList([]))
  }
  useEffect(reload, [])

  const doRun = (id: string): void => {
    if (!current || running) return
    setRunning(id)
    setResult(null)
    window.treeline
      .runCustomAction(current, id)
      .then((r) => setResult(r))
      .catch((e: unknown) => setResult({ code: 1, output: e instanceof Error ? e.message : String(e) }))
      .finally(() => setRunning(null))
  }

  const doSave = (): Promise<void> =>
    run(async () => {
      if (!name.trim() || !cmd.trim()) return false
      const next = await window.treeline.saveCustomAction({ name: name.trim(), cmd: cmd.trim() }).catch(() => null)
      if (!next) return false
      setList(next)
      setName('')
      setCmd('')
      return false // mantém aberto para adicionar mais
    })

  const doDelete = (id: string): void => {
    void window.treeline.deleteCustomAction(id).then(setList).catch(() => undefined)
  }

  return (
    <Dialog title={tr('custom.title')} wide>
      <p className="dlg-hint">{tr('custom.hint')}</p>
      {list.length === 0 && <p className="muted">{tr('custom.empty')}</p>}
      <div className="dlg-list">
        {list.map((a) => (
          <div key={a.id} className="dlg-row">
            <span className="grow">
              <span>{a.name}</span> <span className="sub mono">{a.cmd}</span>
            </span>
            <span className="dlg-actions">
              <button className="mini-btn" disabled={busy || running !== null || !current} onClick={() => doRun(a.id)}>
                {running === a.id ? tr('dlg.working') : tr('custom.run')}
              </button>
              <button className="mini-btn" disabled={busy} onClick={() => doDelete(a.id)}>
                {tr('dlg.delete')}
              </button>
            </span>
          </div>
        ))}
      </div>
      {result && (
        <div className="dlg-section">
          {tr('custom.output')} ({result.code ?? '?'})
          <pre className="about-license">{result.output || '—'}</pre>
        </div>
      )}
      <div className="dlg-section">{tr('custom.add')}</div>
      <div className="field-row">
        <label className="field">
          <span>{tr('custom.name')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lint" />
        </label>
        <label className="field">
          <span>{tr('custom.cmd')}</span>
          <input value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="npm run lint" />
        </label>
      </div>
      <div className="modal-actions">
        <button className="tool-btn primary" disabled={busy || !name.trim() || !cmd.trim()} onClick={() => void doSave()}>
          {busy ? tr('dlg.working') : tr('dlg.add')}
        </button>
      </div>
    </Dialog>
  )
}
