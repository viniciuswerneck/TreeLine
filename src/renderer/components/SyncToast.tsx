import { CircleCheck, CircleX, LoaderCircle, X } from 'lucide-react'
import { useEffect } from 'react'
import { useStore } from '../store'

const OP_LABEL: Record<string, string> = { push: 'Push', pull: 'Pull', fetch: 'Fetch' }

/**
 * Toast de sincronização: mostra spinner durante Push/Pull/Fetch,
 * resumo do resultado em caso de sucesso e o erro com dismiss manual.
 * Sucesso some sozinho após 5s; erro fica até fechar.
 */
export default function SyncToast() {
  const sync = useStore((s) => s.sync)
  const clearSync = useStore((s) => s.clearSync)

  useEffect(() => {
    if (sync.phase !== 'success') return
    const t = setTimeout(() => clearSync(), 5000)
    return () => clearTimeout(t)
  }, [sync, clearSync])

  if (!sync.op || !sync.phase) return null
  const label = OP_LABEL[sync.op] ?? sync.op

  return (
    <div className={`sync-toast ${sync.phase}`} role="status">
      {sync.phase === 'running' && <LoaderCircle size={16} className="spin" />}
      {sync.phase === 'success' && <CircleCheck size={16} className="ok" />}
      {sync.phase === 'error' && <CircleX size={16} className="fail" />}
      <div className="sync-toast-body">
        <strong>{label}</strong>
        <span>{sync.message}</span>
      </div>
      {sync.phase !== 'running' && (
        <button className="sync-toast-close" title="Dismiss" onClick={clearSync}>
          <X size={14} />
        </button>
      )}
    </div>
  )
}
