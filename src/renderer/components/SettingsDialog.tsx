import { useEffect, useState } from 'react'
import { useStore } from '../store'

/**
 * Dialog Settings: identidade do autor (git user.name/user.email global).
 * Abre com os valores atuais, valida e salva via IPC.
 */
export default function SettingsDialog() {
  const identity = useStore((s) => s.identity)
  const saving = useStore((s) => s.identitySaving)
  const error = useStore((s) => s.identityError)
  const saved = useStore((s) => s.identitySaved)
  const closeSettings = useStore((s) => s.closeSettings)
  const saveIdentity = useStore((s) => s.saveIdentity)

  const [name, setName] = useState(identity.name)
  const [email, setEmail] = useState(identity.email)

  useEffect(() => {
    setName(identity.name)
    setEmail(identity.email)
  }, [identity])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeSettings()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeSettings])

  return (
    <div className="modal-backdrop" onClick={closeSettings}>
      <div className="modal" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <p className="muted">Author identity used on commits (git global config).</p>
        <label className="field">
          <span>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your Name"
            autoFocus
          />
        </label>
        <label className="field">
          <span>Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            inputMode="email"
          />
        </label>
        {error && <div className="error">{error}</div>}
        {saved && <div className="success">Saved — new commits will use this author.</div>}
        <div className="modal-actions">
          <button className="tool-btn" onClick={closeSettings}>
            Close
          </button>
          <button
            className="tool-btn primary"
            disabled={saving}
            onClick={() => void saveIdentity({ name, email })}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
