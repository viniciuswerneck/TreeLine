import { useMemo } from 'react'

export default function DiffViewerMock(): React.ReactElement {
  const leftLines = [
    { ln: 1, text: "console.log('v0')" },
    { ln: 2, text: 'home()' },
    { ln: 3, text: 'sobre()' },
    { ln: 4, text: '' }, // hachurado/removed area marker context? represent as removed block
    { ln: 5, text: '' },
    { ln: 6, text: '' }
  ]
  const rightLines = [
    { ln: 1, text: "console.log('v0')" },
    { ln: 2, text: 'home()' },
    { ln: 3, text: 'sobre()' },
    { ln: 4, add: true, text: '' },
    { ln: 5, add: true, text: '' },
    { ln: 6, add: true, text: 'jlkej lkjr lwekjr lerj wlerj eljkt tl jeba', error: true },
    { ln: 7, text: '// ajuste local não commitado' }
  ]
  // simplified mock to match requested visual
  return (
    <div className="diff-mock" role="region" aria-label="Side-by-side diff mock">
      <div className="diff-mock-header">
        <div className="diff-mock-pane-head">
          <span className="diff-mock-file">app.js</span>
          <span className="diff-mock-badge">M</span>
          <span className="diff-mock-sub">(Working Tree)</span>
        </div>
        <div className="diff-mock-pane-head">
          <span className="diff-mock-file">app.js</span>
          <span className="diff-mock-sub">(Modified)</span>
        </div>
      </div>
      <div className="diff-mock-body">
        <div className="diff-mock-pane">
          <div className="diff-mock-gutter">
            <div>1</div><div>2</div><div>3</div><div className="dim"> </div><div className="dim"> </div><div className="dim"> </div>
          </div>
          <div className="diff-mock-code">
            <div>console.log('v0')</div>
            <div>home()</div>
            <div>sobre()</div>
            <div className="diff-mock-removed" />
            <div className="diff-mock-removed" />
            <div className="diff-mock-removed" />
          </div>
        </div>
        <div className="diff-mock-splitter" />
        <div className="diff-mock-pane">
          <div className="diff-mock-gutter">
            <div>1</div><div>2</div><div>3</div><div className="add">4+</div><div className="add">5+</div><div className="add">6+</div><div>7</div>
          </div>
          <div className="diff-mock-code">
            <div>console.log('v0')</div>
            <div>home()</div>
            <div>sobre()</div>
            <div className="diff-mock-added" />
            <div className="diff-mock-added" />
            <div className="diff-mock-added diff-mock-added-text">
              jlkej lkjr lwekjr lerj wlerj eljkt tl jeba
              <span className="diff-mock-error" />
            </div>
            <div>// ajuste local não commitado</div>
          </div>
        </div>
      </div>
      <div className="diff-mock-status">
        <div>Not Committed Yet</div>
        <div>Ln 4, Col 1 | Spaces: 4 | UTF-8 | LF | {'{}'} JavaScript</div>
      </div>
    </div>
  )
}
