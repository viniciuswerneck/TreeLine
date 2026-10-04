import { useEffect, useState } from 'react'
import { useStore } from '../store'
import Dialog from './Dialog'

/** Dialog Sobre: versão, descrição, licença MIT e créditos. */
export default function AboutDialog() {
  const tr = useStore((s) => s.tr)
  const [version, setVersion] = useState('')
  const [update, setUpdate] = useState<string | null>(null)

  useEffect(() => {
    window.treeline.getVersion().then(setVersion).catch(() => setVersion(''))
  }, [])

  const checkUpdates = (): void => {
    setUpdate(tr('about.checking'))
    void window.treeline
      .checkUpdates()
      .then((r) => {
        if (!r.latest) {
          setUpdate(tr('about.updateError'))
          return
        }
        setUpdate(
          r.latest === r.current
            ? tr('about.upToDate', { v: r.current })
            : `${tr('about.newVersion', { v: r.latest })} ${r.url}`
        )
      })
      .catch(() => setUpdate(tr('about.updateError')))
  }

  return (
    <Dialog title={tr('about.title')}>
      <div className="about-head">
        <span className="about-logo" aria-hidden="true">
          ≋
        </span>
        <div>
          <div className="about-name">TreeLine{version ? ` ${version}` : ''}</div>
          <div className="muted">{tr('app.title')}</div>
        </div>
      </div>
      <p className="dlg-hint">{tr('about.desc')}</p>
      <div className="dlg-section">{tr('about.license')}</div>
      <pre className="about-license">{tr('about.licenseText')}</pre>
      <p className="muted">{tr('about.credit')}</p>
      <div className="modal-actions">
        <button className="tool-btn" onClick={checkUpdates}>
          {tr('about.checkUpdates')}
        </button>
      </div>
      {update && <p className="muted" style={{ wordBreak: 'break-word' }}>{update}</p>}
    </Dialog>
  )
}
