import { useState } from 'react'
import type { FlowType } from '../../shared/types'
import { dialogOps, useStore } from '../store'
import Dialog, { useDialogRunner } from './Dialog'

const FLOW_TYPES: FlowType[] = ['feature', 'release', 'hotfix']

/** Dialog Git-flow: start/finish de feature/release/hotfix (git flow ou convenção). */
export default function FlowDialog() {
  const branches = useStore((s) => s.branches)
  const flowInstalled = useStore((s) => s.flowInstalled)
  const tr = useStore((s) => s.tr)
  const { busy, run } = useDialogRunner()

  const [type, setType] = useState<FlowType>('feature')
  const [name, setName] = useState('')

  const active = branches.filter((b) => FLOW_TYPES.some((t) => b.name.startsWith(`${t}/`)))

  const splitFlow = (branch: string): { type: FlowType; short: string } => {
    const t = FLOW_TYPES.find((x) => branch.startsWith(`${x}/`)) ?? 'feature'
    return { type: t, short: branch.slice(t.length + 1) }
  }

  return (
    <Dialog title={tr('flow.title')} wide>
      <p className="dlg-hint">{flowInstalled ? tr('flow.installed') : tr('flow.conventional')}</p>
      <div className="field-row">
        <label className="field">
          <span>{tr('flow.type')}</span>
          <select value={type} onChange={(e) => setType(e.target.value as FlowType)}>
            {FLOW_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{tr('flow.name')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('flow.namePh')} autoFocus />
        </label>
      </div>
      <p className="dlg-hint">{tr('flow.hint', { t: type })}</p>
      <div className="modal-actions">
        <button
          className="tool-btn primary"
          disabled={busy || !name.trim()}
          onClick={() => void run(() => dialogOps.flowStart(type, name.trim()))}
        >
          {busy ? tr('dlg.working') : tr('dlg.start')}
        </button>
      </div>

      <div className="dlg-section">{tr('flow.active', { t: '' }).trim()}</div>
      {active.length === 0 && <p className="muted">{tr('flow.none')}</p>}
      <div className="dlg-list">
        {active.map((b) => {
          const f = splitFlow(b.name)
          return (
            <div key={b.name} className="dlg-row">
              <span className="grow">
                <span className="mono">{b.name}</span>{' '}
                {b.current && <span className="sub">({tr('branch.current')})</span>}
              </span>
              <span className="dlg-actions">
                <button
                  className="mini-btn"
                  disabled={busy}
                  onClick={() => void run(() => dialogOps.flowFinish(f.type, f.short))}
                >
                  {tr('dlg.finish')}
                </button>
              </span>
            </div>
          )
        })}
      </div>
    </Dialog>
  )
}
