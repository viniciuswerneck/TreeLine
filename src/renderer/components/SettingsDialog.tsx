import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { LANGS, type DictKey, type Lang } from '../i18n'
import { THEMES } from '../themes'
import { SHORTCUT_DEFAULTS, eventShortcut, formatShortcut, type ShortcutAction } from '../shortcuts'

const SHORTCUT_LABELS: Record<ShortcutAction, DictKey> = {
  palette: 'pal.title',
  sidebar: 'side.workspace',
  search: 'side.search',
  refresh: 'common.refresh',
  commit: 'toolbar.commit',
  terminal: 'toolbar.terminal'
}

/** Editor de atalhos: clica, aperta as teclas, salva. */
function ShortcutsEditor() {
  const shortcuts = useStore((s) => s.shortcuts)
  const setShortcut = useStore((s) => s.setShortcut)
  const resetShortcuts = useStore((s) => s.resetShortcuts)
  const tr = useStore((s) => s.tr)
  const [capturing, setCapturing] = useState<ShortcutAction | null>(null)

  useEffect(() => {
    if (!capturing) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return
      setShortcut(capturing, eventShortcut(e))
      setCapturing(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capturing, setShortcut])

  return (
    <>
      <div className="dlg-section">{tr('settings.shortcuts')}</div>
      <div className="dlg-list">
        {(Object.keys(SHORTCUT_DEFAULTS) as ShortcutAction[]).map((a) => (
          <div key={a} className="dlg-row">
            <span className="grow">{tr(SHORTCUT_LABELS[a])}</span>
            <button
              className="mini-btn mono"
              onClick={() => setCapturing(capturing === a ? null : a)}
            >
              {capturing === a ? tr('settings.pressKeys') : formatShortcut(shortcuts[a])}
            </button>
          </div>
        ))}
      </div>
      <div className="modal-actions" style={{ marginBottom: 8 }}>
        <button className="tool-btn" onClick={() => resetShortcuts()}>
          {tr('settings.resetShortcuts')}
        </button>
      </div>
    </>
  )
}

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
  const scope = useStore((s) => s.identityScope)
  const setScope = useStore((s) => s.setIdentityScope)
  const effectiveScope = useStore((s) => s.identityEffectiveScope)
  const lang = useStore((s) => s.lang)
  const setLang = useStore((s) => s.setLang)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const autoFetchMin = useStore((s) => s.autoFetchMin)
  const setAutoFetchMin = useStore((s) => s.setAutoFetchMin)
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
        <div className="modal-head">
          <h2>{tr('settings.title')}</h2>
          <button className="modal-x" title={tr('settings.close')} onClick={closeSettings} aria-label={tr('settings.close')}>
            <X size={16} />
          </button>
        </div>
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
        <p className="muted">
          {tr('settings.effective')}:{' '}
          <strong>
            {identity.name || identity.email
              ? `${identity.name} <${identity.email}>`
              : tr('settings.none')}
          </strong>{' '}
          <span className="sidebar-badge">{tr(effectiveScope === 'local' ? 'settings.scopeLocal' : effectiveScope === 'none' ? 'settings.none' : 'settings.scopeGlobal')}</span>
        </p>
        <div className="field-row" role="radiogroup" aria-label={tr('settings.scope')}>
          <label className="check-row">
            <input
              type="radio"
              name="identity-scope"
              checked={scope === 'global'}
              onChange={() => setScope('global')}
            />
            <span className="grow">{tr('settings.scopeGlobal')}</span>
          </label>
          <label className="check-row">
            <input
              type="radio"
              name="identity-scope"
              checked={scope === 'local'}
              onChange={() => setScope('local')}
            />
            <span className="grow">{tr('settings.scopeLocalRepo')}</span>
          </label>
        </div>
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
        <label className="field">
          <span>{tr('settings.autoFetch')}</span>
          <select value={String(autoFetchMin)} onChange={(e) => setAutoFetchMin(Number(e.target.value))}>
            <option value="0">{tr('settings.autoFetchOff')}</option>
            <option value="5">5 min</option>
            <option value="15">15 min</option>
            <option value="30">30 min</option>
            <option value="60">60 min</option>
          </select>
        </label>
        <ShortcutsEditor />
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
