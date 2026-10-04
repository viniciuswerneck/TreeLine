import { useEffect, useState } from 'react'
import { useStore } from '../store'
import Dialog from './Dialog'

/** Dialog Sobre: versão, descrição, licença MIT e créditos. */
export default function AboutDialog() {
  const tr = useStore((s) => s.tr)
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.treeline.getVersion().then(setVersion).catch(() => setVersion(''))
  }, [])

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
    </Dialog>
  )
}
