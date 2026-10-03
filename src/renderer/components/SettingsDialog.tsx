import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { LANGS, type Lang } from '../i18n'
import { THEMES } from '../themes'

/**
 * Dialog Settings: idioma + identidade do autor (git user.name/user.email).
 * Abre com os valores atuais, valida e salva via IPC.
 */
export default function SettingsDialog() {
  const identity = useStore((s) => s.identity)
  const saving = useStore((s) => s.identitySaving)
  const error = useStore((s) => s.identityError)
  const saved = useStore((s) => s.identitySaved)
  const closeSettings = useStore((s) => s.closeSettings)
  const saveIdentity = useStore((s) => s.saveIdentity)
  const lang = useStore((s) => s.lang)
  const setLang = useStore((s) => s.setLang)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const tr = useStore((s) => s.tr)

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
        <h2>{tr('settings.title')}</h2>
        <label className="field">
          <span>{tr('settings.language')}</span>
          <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            {LANGS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{tr('toolbar.theme')}</span>
          <select value={theme} onChange={(e) => setTheme(e.target.value)}>
            <optgroup label={tr('theme.system')}>
              <option value="system">{tr('theme.system')}</option>
            </optgroup>
            <optgroup label={tr('theme.light')}>
              {THEMES.filter((t) => t.mode === 'light').map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
            <optgroup label={tr('theme.dark')}>
              {THEMES.filter((t) => t.mode === 'dark').map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <p className="muted">{tr('settings.identityHint')}</p>
        <label className="field">
          <span>{tr('settings.name')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tr('settings.namePh')}
            autoFocus
          />
        </label>
        <label className="field">
          <span>{tr('settings.email')}</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            inputMode="email"
          />
        </label>
        {error && <div className="error">{error}</div>}
        {saved && <div className="success">{tr('settings.saved')}</div>}
        <div className="modal-actions">
          <button className="tool-btn" onClick={closeSettings}>
            {tr('settings.close')}
          </button>
          <button
            className="tool-btn primary"
            disabled={saving}
            onClick={() => void saveIdentity({ name, email })}
          >
            {saving ? tr('settings.saving') : tr('settings.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
