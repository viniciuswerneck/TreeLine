import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { ExternalLink, Minimize2, Maximize2, RotateCcw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { dialogOps, useStore } from '../store'

/**
 * Terminal integrado (drawer inferior): shell real via node-pty na pasta
 * do repo, com xterm.js. Expande para tela cheia (botão Maximizar), abre
 * emulador externo (pop-out) ou fecha. Uma sessão por repo.
 */
export default function TerminalPanel() {
  const current = useStore((s) => s.current)
  const closeTerminalDrawer = useStore((s) => s.closeTerminalDrawer)
  const tr = useStore((s) => s.tr)
  const boxRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [dead, setDead] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    const box = boxRef.current
    if (!current || !box) return
    setFailed(null)

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace',
      scrollback: 5000,
      theme: {
        background: '#16161e',
        foreground: '#d5d5dc',
        cursor: '#7b8cff',
        cursorAccent: '#16161e',
        selectionBackground: 'rgba(123, 140, 255, 0.3)',
        black: '#16161e',
        red: '#e5484d',
        green: '#46a758',
        yellow: '#e59400',
        blue: '#1f9cff',
        magenta: '#ec4899',
        cyan: '#06b6d4',
        white: '#d5d5dc'
      }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(box)
    termRef.current = term
    fitRef.current = fit

    let dims = { cols: 80, rows: 24 }
    try {
      fit.fit()
      dims = { cols: term.cols, rows: term.rows }
    } catch {
      /* usa o padrão */
    }
    // Sessão por repo sobrevive à troca de repo: só cria se não houver viva.
    window.treeline
      .termAlive(current)
      .then((alive) => {
        setDead(!alive)
        if (!alive) {
          return window.treeline.termStart(current, dims.cols, dims.rows).catch((e: unknown) => {
            setFailed(e instanceof Error ? e.message : String(e))
          })
        }
      })
      .catch(() => setDead(true))

    const input = term.onData((data) => {
      void window.treeline.termWrite(current, data).catch(() => undefined)
    })
    const offData = window.treeline.onTermData((repo, data) => {
      if (repo === current) term.write(data)
    })
    const offExit = window.treeline.onTermExit((repo) => {
      if (repo === current) setDead(true)
    })
    term.focus()

    return () => {
      input.dispose()
      offData()
      offExit()
      // NÃO mata o pty ao trocar de repo/fechar o drawer: a sessão continua
      // viva e é reanexada ao voltar (botão Restart recria se morreu).
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [current])

  // Refit ao expandir/recolher e ao redimensionar a janela.
  useEffect(() => {
    const doFit = (): void => {
      const term = termRef.current
      const fit = fitRef.current
      if (!term || !fit || !current) return
      window.setTimeout(() => {
        try {
          fit.fit()
          void window.treeline.termResize(current, term.cols, term.rows).catch(() => undefined)
        } catch {
          /* container oculto */
        }
      }, 60)
    }
    doFit()
    window.addEventListener('resize', doFit)
    return () => window.removeEventListener('resize', doFit)
  }, [expanded, current])

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  const restart = (): void => {
    const term = termRef.current
    if (!term || !current) return
    term.clear()
    setDead(false)
    const dims = { cols: term.cols || 80, rows: term.rows || 24 }
    window.treeline.termStart(current, dims.cols, dims.rows).catch((e: unknown) => {
      setFailed(e instanceof Error ? e.message : String(e))
    })
    term.focus()
  }

  return (
    <>
      {expanded && <div className="pane-backdrop" onClick={() => setExpanded(false)} />}
      <div className={`terminal-drawer expandable${expanded ? ' expanded' : ''}`}>
        <div className="terminal-head">
          <span className="terminal-title">{tr('term.title')}</span>
          <span className="muted mono">{current}</span>
          <span className="terminal-actions">
            {dead && (
              <button className="mini-btn" title={tr('term.restart')} onClick={restart}>
                <RotateCcw size={13} /> {tr('term.restart')}
              </button>
            )}
            <button
              className="pane-expand"
              title={expanded ? tr('det.collapse') : tr('det.expand')}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button
              className="pane-expand"
              title={tr('toolbar.terminal')}
              onClick={() => void dialogOps.openTerminal()}
            >
              <ExternalLink size={14} />
            </button>
            <button className="pane-expand" title={tr('dlg.close')} onClick={closeTerminalDrawer}>
              <X size={14} />
            </button>
          </span>
        </div>
        <div className="terminal-body" ref={boxRef} onClick={() => termRef.current?.focus()} />
        {(dead || failed) && (
          <div className="terminal-note">
            {failed ?? tr('term.exited')}
          </div>
        )}
      </div>
    </>
  )
}
