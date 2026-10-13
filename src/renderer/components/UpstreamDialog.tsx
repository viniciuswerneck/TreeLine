import { useState } from 'react'
import { dialogOps, useStore } from '../store'
import Dialog, { useDialogRunner } from './Dialog'

/** Dialog Set upstream: substitui o `window.prompt` (inexistente no Electron). */
export default function UpstreamDialog() {
  const tr = useStore((s) => s.tr)
  const branch = useStore((s) => s.upstreamBranch)
  const { busy, run } = useDialogRunner()
  const [up, setUpValue] = useState(`origin/`)

  if (!branch) return null
  return (
    <Dialog title={tr('side.setUpstream')}>
      <p className="dlg-hint">
        {tr('side.setUpstreamHint', { b: branch })}
      </p>
      <input
        className="input"
        value={up}
        autoFocus
        spellCheck={false}
        onChange={(e) => setUpValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && up.trim() && !busy) void run(() => dialogOps.setUpstream(branch, up.trim()))
        }}
        placeholder="origin/main"
      />
      <div className="dlg-actions">
        <button className="btn" disabled={!up.trim() || busy} onClick={() => void run(() => dialogOps.setUpstream(branch, up.trim()))}>
          {tr('dlg.apply')}
        </button>
      </div>
    </Dialog>
  )
}