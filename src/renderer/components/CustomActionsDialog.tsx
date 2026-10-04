import { useEffect, useMemo, useState } from 'react'
import type { ActionResult, CustomAction } from '../../shared/types'
import { useStore } from '../store'
import { ansiToHtml } from '../lib/ansi'
import Dialog, { useDialogRunner } from './Dialog'

/** Dialog Custom Actions: lista, executa (saída colorida), args, adiciona/remove. */
export default function CustomActionsDialog() {
  const current = useStore((s) => s.current)
  const status = useStore((s) => s.status)
  const selectedFile = useStore((s) => s.selectedFile)
  const selectedCommit = useStore((s) => s.selectedCommit)
  const tr = useStore((s) => s.tr)
  const { busy, run } = useDialogRunner()

  const [list, setList] = useState<CustomAction[]>([])
  const [name, setName] = useState('')
  const [cmd, setCmd] = useState('')
  const [args, setArgs] = useState('')
  const [result, setResult] = useState<ActionResult | null>(null)
  const [running, setRunning] = useState<string | null>(null)

  const reload = (): void => {
    window.treeline.getCustomActions().then(setList).catch(() => setList([]))
  }
  useEffect(reload, [])

  const ctx = useMemo(
    () => ({
      repo: current ?? undefined,
      branch: status?.branch || undefined,
      file: selectedFile?.path || undefined,
      commit: selectedCommit || undefined
    }),
    [current, status?.branch, selectedFile?.path, selectedCommit]
  )

  const outputHtml = useMemo(() => (result ? ansiToHtml(result.output) : ''), [result])

  const doRun = (id: string): void => {
    if (!current || running) return
    setRunning(id)
    setResult(null)
    window.treeline
      .runCustomAction(current, id, ctx)
      .then((r) => setResult(r))
      .catch((e: unknown) => setResult({ code: 1, output: e instanceof Error ? e.message : String(e) }))
      .finally(() => setRunning(null))
  }

  const doSave = (): Promise<void> =>
    run(async () => {
      if (!name.trim() || !cmd.trim()) return false
      const parsed = args.split(/\s+/).filter(Boolean)
      const next = await window.treeline
        .saveCustomAction({ name: name.trim(), cmd: cmd.trim(), args: parsed })
        .catch(() => null)
      if (!next) return false
      setList(next)
      setName('')
      setCmd('')
      setArgs('')
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
              {a.args.length > 0 && <span className="sub mono"> {a.args.join(' ')}</span>}
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
          <pre className="about-license" dangerouslySetInnerHTML={{ __html: outputHtml || '—' }} />
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
          <input value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="npm run" />
        </label>
      </div>
      <label className="field">
        <span>{tr('custom.args')}</span>
        <input
          value={args}
          onChange={(e) => setArgs(e.target.value)}
          placeholder="lint --fix {{file}}"
        />
      </label>
      <p className="dlg-hint">{tr('custom.tokens')}</p>
      <div className="modal-actions">
        <button className="tool-btn primary" disabled={busy || !name.trim() || !cmd.trim()} onClick={() => void doSave()}>
          {busy ? tr('dlg.working') : tr('dlg.add')}
        </button>
      </div>
    </Dialog>
  )
}