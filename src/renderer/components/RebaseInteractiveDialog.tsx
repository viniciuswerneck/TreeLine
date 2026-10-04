import { useState } from 'react'
import { dialogOps, useStore } from '../store'
import Dialog, { useDialogRunner } from './Dialog'
import type { RebasePlanEntry } from '../../shared/types'

const ACTIONS: RebasePlanEntry['action'][] = ['pick', 'reword', 'edit', 'squash', 'fixup', 'drop']

/** Dialog Rebase interativo: carrega o plano sobre a base e edita ação/ordem antes de aplicar. */
export default function RebaseInteractiveDialog() {
  const current = useStore((s) => s.current)
  const tr = useStore((s) => s.tr)
  const { busy, run } = useDialogRunner()

  const [base, setBase] = useState('main')
  const [plan, setPlan] = useState<RebasePlanEntry[] | null>(null)
  const [loadingPlan, setLoadingPlan] = useState(false)
  const [stashFirst, setStashFirst] = useState(false)

  const load = async (): Promise<void> => {
    if (!current || !base.trim() || loadingPlan) return
    setLoadingPlan(true)
    try {
      setPlan(await window.treeline.getRebasePlan(current, base.trim()))
    } catch {
      setPlan([])
    } finally {
      setLoadingPlan(false)
    }
  }

  const setAction = (hash: string, action: RebasePlanEntry['action']): void => {
    setPlan((prev) => prev?.map((e) => (e.hash === hash ? { ...e, action } : e)) ?? null)
  }

  const move = (idx: number, dir: -1 | 1): void => {
    setPlan((prev) => {
      if (!prev) return prev
      const j = idx + dir
      if (j < 0 || j >= prev.length) return prev
      const a = prev[idx]
      const b = prev[j]
      if (!a || !b) return prev
      const next = [...prev]
      next[idx] = b
      next[j] = a
      return next
    })
  }

  const start = (): void => {
    const p = plan
    if (!p || p.length === 0 || !base.trim()) return
    void (async () => {
      if (p.length > 20) {
        const ok = await useStore.getState().confirmAction(
          useStore.getState().tr('rebaseI.bigT'),
          useStore.getState().tr('rebaseI.bigM', { n: p.length }),
          useStore.getState().tr('rebaseI.bigD'),
          useStore.getState().tr('rebaseI.start')
        )
        if (!ok) return
      }
      run(() => (stashFirst ? dialogOps.rebaseInteractiveStash(base.trim(), p) : dialogOps.rebaseInteractive(base.trim(), p)))
    })()
  }

  const count = plan?.length ?? 0

  return (
    <Dialog title={tr('rebaseI.title')} wide>
      <div className="field-row">
        <label className="field">
          <span>Base</span>
          <input value={base} onChange={(e) => setBase(e.target.value)} placeholder="main" />
        </label>
        <button className="mini-btn" disabled={loadingPlan || !current || !base.trim()} onClick={() => void load()}>
          {loadingPlan ? tr('dlg.working') : 'Load'}
        </button>
      </div>

      {plan !== null && plan.length === 0 && <p className="muted">{tr('rebaseI.empty')}</p>}
      {plan !== null && plan.length > 0 && (
        <div className="dlg-list">
          {plan.map((e, i) => (
            <div key={e.hash} className="dlg-row">
              <select
                value={e.action}
                disabled={busy}
                onChange={(ev) => setAction(e.hash, ev.target.value as RebasePlanEntry['action'])}
              >
                {ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <span className="grow">
                <span className="mono">{e.hash.slice(0, 7)}</span> <span>{e.message}</span>
              </span>
              <span className="dlg-actions">
                <button className="mini-btn" disabled={busy || i === 0} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button className="mini-btn" disabled={busy || i === count - 1} onClick={() => move(i, 1)}>
                  ↓
                </button>
                <button className="mini-btn" disabled={busy} onClick={() => setAction(e.hash, 'drop')}>
                  ✕
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="muted">{tr('rebaseI.hint')}</p>
      <label className="check-row" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={stashFirst} onChange={(e) => setStashFirst(e.target.checked)} />
        <span className="grow">{tr('rebase.autostash')}</span>
      </label>
      <div className="modal-actions">
        <button className="tool-btn primary" disabled={busy || count === 0 || !base.trim()} onClick={start}>
          {busy ? tr('dlg.working') : tr('rebaseI.start')}
        </button>
      </div>
    </Dialog>
  )
}
