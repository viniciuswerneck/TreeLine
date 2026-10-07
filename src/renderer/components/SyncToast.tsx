import { CircleCheck, CircleX, LoaderCircle, X } from 'lucide-react'
import { useEffect } from 'react'
import { useStore } from '../store'

/**
 * Toast de sincronização: mostra spinner durante Push/Pull/Fetch,
 * resumo do resultado em caso de sucesso e o erro com dismiss manual.
 * Sucesso some sozinho após 5s; erro fica até fechar.
 */
export default function SyncToast() {
  const sync = useStore((s) => s.sync)
  const clearSync = useStore((s) => s.clearSync)
  const cancelSync = useStore((s) => s.cancelSync)
  const doPushForce = useStore((s) => s.doPushForce)
  const doPushPublish = useStore((s) => s.doPushPublish)
  const tr = useStore((s) => s.tr)

  useEffect(() => {
    if (sync.phase !== 'success') return
    const t = setTimeout(() => clearSync(), 5000)
    return () => clearTimeout(t)
  }, [sync, clearSync])

  if (!sync.op || !sync.phase) return null
  const label = sync.op === 'push' ? tr('toolbar.push') : sync.op === 'pull' ? tr('toolbar.pull') : sync.op === 'clone' ? tr('toolbar.clone') : tr('toolbar.fetch')

  return (
    <div className={`sync-toast ${sync.phase}`} role="status">
      {sync.phase === 'running' && <LoaderCircle size={16} className="spin" />}
      {sync.phase === 'success' && <CircleCheck size={16} className="ok" />}
      {sync.phase === 'error' && <CircleX size={16} className="fail" />}
      <div className="sync-toast-body">
        <strong>{label}</strong>
        <span>{sync.message}</span>
        {sync.phase === 'error' && sync.retryLease && (
          <button
            className="mini-btn"
            title={tr('pushLease.detail')}
            onClick={() => {
              clearSync()
              void doPushForce()
            }}
          >
            {tr('sync.retryLease')}
          </button>
        )}
        {sync.phase === 'error' && sync.retryPublish && (
          <button
            className="mini-btn"
            title={tr('pushPublish.detail')}
            onClick={() => {
              clearSync()
              void doPushPublish()
            }}
          >
            {tr('sync.retryPublish')}
          </button>
        )}
      </div>
      {sync.phase !== 'running' && (
        <button className="sync-toast-close" title={tr('sync.dismiss')} onClick={clearSync}>
          <X size={14} />
        </button>
      )}
      {sync.phase === 'running' && (
        <button className="sync-toast-close" title={tr('sync.cancel')} onClick={() => void cancelSync()}>
          <X size={14} />
        </button>
      )}
    </div>
  )
}
