import { useState } from 'react'
import type { ResetMode } from '../../shared/types'
import { dialogOps, useStore } from '../store'
import Dialog, { useDialogRunner } from './Dialog'

const MODES: ResetMode[] = ['soft', 'mixed', 'hard']

/** Dialog Reset: ref manual (default: commit selecionado ou HEAD) + modo soft/mixed/hard. */
export default function ResetDialog() {
  const selectedCommit = useStore((s) => s.selectedCommit)
  const tr = useStore((s) => s.tr)
  const { busy, run } = useDialogRunner()

  const [ref, setRef] = useState(selectedCommit ?? 'HEAD')
  const [mode, setMode] = useState<ResetMode>('mixed')

  return (
    <Dialog title={tr('reset.title')}>
      <p className="dlg-hint">{tr('reset.detail')}</p>
      <label className="field">
        <input value={ref} onChange={(e) => setRef(e.target.value)} autoFocus />
      </label>
      <div className="field-row">
        {MODES.map((m) => (
          <button
            key={m}
            className={mode === m ? 'tool-btn primary' : 'tool-btn'}
            onClick={() => setMode(m)}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="modal-actions">
        <button
          className="tool-btn primary"
          disabled={busy}
          onClick={() => void run(() => dialogOps.resetTo(ref.trim() || 'HEAD', mode))}
        >
          {busy ? tr('dlg.working') : tr('dlg.undo')}
        </button>
      </div>
    </Dialog>
  )
}
