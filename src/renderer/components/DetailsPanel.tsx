import { ArrowLeft, Maximize2, Minimize2, RefreshCw } from 'lucide-react'
import { forwardRef, useEffect, useState } from 'react'
import { useStore } from '../store'
import type { DictKey } from '../i18n'
import DiffViewer, { loadDiffMode, saveDiffMode, type DiffMode } from './DiffViewer'
import { RefBadge, visibleRefs } from './HistoryGraph'

/**
 * Painel inferior estilo SourceTree: listas Unstaged | Staged lado a lado,
 * diff ao lado e commit box sempre visível embaixo (stage → mensagem → Commit
 * na mesma tela, sem trocar de aba).
 */

/** Colunas que maximizam JUNTAS: Unstaged e Staged são os dois lados do mesmo quadro. */
const PAIRED = new Set(['unstaged', 'staged'])


function FileRow({
  path,
  staged,
  active,
  code,
  busy,
  roving,
  tr,
  isConflict = false,
  marked = false,
  markTitle,
  onSelect,
  onContextMenu,
  onStage,
  onUnstage,
  onToggleMark
}: {
  path: string
  staged: boolean
  active: boolean
  code: string
  busy: boolean
  roving: boolean
  tr: (key: DictKey, vars?: Record<string, string | number>) => string
  isConflict?: boolean
  marked?: boolean
  markTitle?: string
  onSelect: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onStage?: () => void
  onUnstage?: () => void
  onToggleMark?: () => void
}): React.ReactElement {
  return (
    <div
      className={`file-row${isConflict ? ' conflict-row' : ''}`}
      tabIndex={roving ? 0 : -1}
      aria-selected={active}
      title={isConflict ? tr('det.conflictTitle') : undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      onContextMenu={onContextMenu}
    >
      {onToggleMark && (
        <input
          type="checkbox"
          className="mark-box"
          checked={marked}
          title={markTitle}
          aria-label={markTitle}
          onClick={(e) => e.stopPropagation()}
          onChange={onToggleMark}
        />
      )}
      <span className={isConflict ? 'code conflict-code' : 'code'}>{code || (staged ? '+' : '?')}</span>
      <span className="grow">{path}</span>
      {!isConflict && staged && onUnstage && (
        <button
          className="mini-btn"
          title={tr('det.unstageFile')}
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation()
            onUnstage()
          }}
        >
          {tr('det.unstage')}
        </button>
      )}
      {!isConflict && !staged && onStage && (
        <button
          className="mini-btn"
          title={tr('det.stageFile')}
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation()
            onStage()
          }}
        >
          {tr('det.stage')}
        </button>
      )}
      {isConflict && (
        <button
          className="mini-btn primary"
          title={tr('det.resolve')}
          onClick={(e) => {
            e.stopPropagation()
            onSelect()
          }}
        >
          {tr('det.resolve')}
        </button>
      )}
    </div>
  )
}
const DetailsPanel = forwardRef<HTMLTextAreaElement>(function DetailsPanel(_, commitRef) {
  const status = useStore((s) => s.status)
  const selectedFile = useStore((s) => s.selectedFile)
  const diff = useStore((s) => s.diff)
  const hunks = useStore((s) => s.hunks)
  const message = useStore((s) => s.message)
  const amend = useStore((s) => s.amend)
  const error = useStore((s) => s.error)
  const selectFile = useStore((s) => s.selectFile)
  const stageSelected = useStore((s) => s.stageSelected)
  const unstageSelected = useStore((s) => s.unstageSelected)
  const stageAll = useStore((s) => s.stageAll)
  const unstageAll = useStore((s) => s.unstageAll)
  const setMessage = useStore((s) => s.setMessage)
  const setAmend = useStore((s) => s.setAmend)
  const fileFilter = useStore((s) => s.fileFilter)
  const setFileFilter = useStore((s) => s.setFileFilter)
  const marked = useStore((s) => s.marked)
  const toggleMark = useStore((s) => s.toggleMark)
  const stageMarked = useStore((s) => s.stageMarked)
  const unstageMarked = useStore((s) => s.unstageMarked)
  const doCommit = useStore((s) => s.doCommit)
  const resolveOurs = useStore((s) => s.resolveOurs)
  const openResolver = useStore((s) => s.openResolver)
  const resolveTheirs = useStore((s) => s.resolveTheirs)

  const allUnstaged = status?.unstaged ?? []
  const allStaged = status?.staged ?? []
  const allUntracked = status?.untracked ?? []
  const allConflicted = status?.conflicted ?? []
  // Filtro textual (path) aplicado às listas visíveis; as contagens seguem o
  // que está na tela. A seleção/commit continuam sobre o status completo.
  const q = fileFilter.trim().toLowerCase()
  const keep = (p: string): boolean => !q || p.toLowerCase().includes(q)
  const unstaged = allUnstaged.filter((f) => keep(f.path))
  const staged = allStaged.filter((f) => keep(f.path))
  const untracked = allUntracked.filter((p) => keep(p))
  const conflicted = allConflicted.filter((p) => keep(p))
  const markedU = marked.filter((k) => k.startsWith('u:')).length
  const markedS = marked.filter((k) => k.startsWith('s:')).length
  // Sem nada em stage (e sem Amend), Commit não tem o que fazer:
  // desabilita em vez de deixar estourar erro.
  const canCommit = message.trim().length > 0 && (allStaged.length > 0 || amend)

  const selectedCommit = useStore((s) => s.selectedCommit)
  const commitDetail = useStore((s) => s.commitDetail)
  const commitDiff = useStore((s) => s.commitDiff)
  const selectCommit = useStore((s) => s.selectCommit)
  const selectCommitFile = useStore((s) => s.selectCommitFile)
  const tr = useStore((s) => s.tr)
  const openMenu = useStore((s) => s.openMenu)
  const copyText = useStore((s) => s.copyText)
  const revealRepoFile = useStore((s) => s.revealRepoFile)
  const discardFile = useStore((s) => s.discardFile)
  const refresh = useStore((s) => s.refresh)
  const loading = useStore((s) => s.loading)
  const busy = useStore((s) => s.busy)
  const matchShortcut = useStore((s) => s.matchShortcut)
  const loadBlame = useStore((s) => s.loadBlame)
  const loadFileHistory = useStore((s) => s.loadFileHistory)
  const openDlg = useStore((s) => s.openDlg)
  const [commitFile, setCommitFile] = useState<string | null>(null)
  // Painel expandido (tela cheia): um por vez; Esc recolhe.
  const [expanded, setExpanded] = useState<string | null>(null)
  const [diffMode, setDiffMode] = useState<DiffMode>(() => loadDiffMode())

  const switchMode = (m: DiffMode): void => {
    setDiffMode(m)
    saveDiffMode(m)
  }

  const modeToggle = (): React.ReactNode => (
    <span className="diff-mode" role="group" aria-label="Diff mode">
      <button
        className={`mini-btn${diffMode === 'unified' ? ' active' : ''}`}
        title={tr('diff.unified')}
        onClick={(e) => {
          e.stopPropagation()
          switchMode('unified')
        }}
      >
        {tr('diff.unified')}
      </button>
      <button
        className={`mini-btn${diffMode === 'split' ? ' active' : ''}`}
        title={tr('diff.split')}
        onClick={(e) => {
          e.stopPropagation()
          switchMode('split')
        }}
      >
        {tr('diff.split')}
      </button>
    </span>
  )

  useEffect(() => {
    setCommitFile(null)
    // Troca de vista limpa o overlay, mas mantém o par de ARQUIVOS do commit
    // aberto ao navegar entre commits (só fecha ao voltar pra Working Copy).
    setExpanded((prev) => (selectedCommit && prev === 'cfiles' ? prev : null))
  }, [selectedCommit])

  // Detalhe do commit espelha o par da Working Copy: expandir Arquivos abre
  // 2 linhas (lista em cima, diff embaixo) com o primeiro arquivo selecionado.
  const commitPairOpen = expanded === 'cfiles'
  useEffect(() => {
    if (!commitPairOpen || commitFile || !commitDetail) return
    const first = (commitDetail.files ?? [])[0]
    if (first) {
      setCommitFile(first)
      void selectCommitFile(first)
    }
  }, [commitPairOpen, commitFile, commitDetail])

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setExpanded(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  // Um id do par `files` maximiza as DUAS colunas de arquivo ao mesmo tempo,
  // lado a lado, e o diff entra como segunda linha do overlay (clique em
  // qualquer arquivo mostra o diff embaixo). Diff/conflicted continuam
  // Maximizando sozinhos.
  const isOpen = (id: string): boolean => (PAIRED.has(id) ? expanded === 'files' : expanded === id)

  const expandBtn = (id: string): React.ReactNode => {
    const open = isOpen(id)
    return (
      <button
        className="pane-expand"
        title={open ? tr('det.collapse') : tr('det.expand')}
        onClick={(e) => {
          e.stopPropagation()
          setExpanded(open ? null : PAIRED.has(id) ? 'files' : id)
        }}
      >
        {open ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      </button>
    )
  }
  const expandedClass = (id: string): string => {
    const open = isOpen(id)
    return `expandable${open ? ' expanded' : ''}${open && PAIRED.has(id) ? ` pair-${id}` : ''}`
  }

  const fileMenu = (e: React.MouseEvent, path: string, staged: boolean, tracked: boolean): void => {
    e.preventDefault()
    const toggle = staged ? unstageSelected : stageSelected
    const conflicted = (status?.conflicted ?? []).includes(path)
    void selectFile({ path, staged }).then(() => {
      openMenu(e.clientX, e.clientY, [
        // Em unmerged, `stage`/`unstage` não resolvem nada (o `git add` sozinho
        // até grava os marcadores) e `discard` perderia um dos lados. Então o
        // stage some e o discard vira "resolver por um lado".
        ...(conflicted
          ? []
          : [{ label: staged ? tr('menu.unstageFile') : tr('menu.stageFile'), onClick: () => void toggle() }]),
        ...(conflicted
          ? [
              { label: tr('cr.title'), onClick: () => void openResolver() },
              { label: tr('menu.ours'), onClick: () => void resolveOurs(path) },
              { label: tr('menu.theirs'), onClick: () => void resolveTheirs(path) }
            ]
          : []),
        { label: tr('menu.copyPath'), onClick: () => void copyText(path) },
        { label: tr('menu.reveal'), onClick: () => void revealRepoFile(path) },
        { label: tr('menu.blame'), onClick: () => { void loadBlame(path); openDlg('blame') } },
        { label: tr('menu.fileHistory'), onClick: () => { void loadFileHistory(path); openDlg('fileHistory') } },
        ...(conflicted
          ? []
          : [
              {
                label: tr('menu.discard'),
                danger: true,
                onClick: () => void discardFile(path, tracked)
              }
            ])
      ])
    })
  }

  const commitFileMenu = (e: React.MouseEvent, path: string): void => {
    e.preventDefault()
    openMenu(e.clientX, e.clientY, [
      { label: tr('menu.copyPath'), onClick: () => void copyText(path) },
      { label: tr('menu.reveal'), onClick: () => void revealRepoFile(path) }
    ])
  }

  // Linhas de arquivo navegáveis por teclado: Enter/Space ativa (seleciona),
  // setas movem dentro da mesma coluna (roving tabindex — só uma linha por
  // coluna fica na ordem de Tab).
  const rowKeyDown = (e: React.KeyboardEvent, activate: () => void): void => {
    const key = e.key
    if (key === 'Enter' || key === ' ') {
      e.preventDefault()
      activate()
      return
    }
    if (key !== 'ArrowDown' && key !== 'ArrowUp') return
    e.preventDefault()
    const col = (e.currentTarget as HTMLElement).closest('.file-col')
    if (!col) return
    const rowsEl = Array.from(col.querySelectorAll<HTMLElement>('.file-row'))
    const i = rowsEl.indexOf(e.currentTarget as HTMLElement)
    rowsEl[i + (key === 'ArrowDown' ? 1 : -1)]?.focus()
  }

  const isConflicted = selectedFile ? (status?.conflicted ?? []).includes(selectedFile.path) : false
  // Par maximizado = 2 linhas: listas Unstaged|Staged em cima, diff embaixo.
  const pairOpen = expanded === 'files'

  // Ao maximizar Stage|Staged juntos, exibe o diff em modo split (2 colunas)
  // igual ao VS Code — sem alterar o layout de arquivos.
  useEffect(() => {
    if (pairOpen && !selectedCommit) {
      setDiffMode('split')
    }
  }, [pairOpen, selectedCommit])

  // Roving tabindex por coluna (uma linha clicável por coluna na ordem de Tab).
  const unstagedPaths = [...unstaged.map((f) => f.path), ...untracked]
  const unstagedSel = !!selectedFile && !selectedFile.staged && unstagedPaths.includes(selectedFile.path)
  const unstagedRoving = unstagedSel ? (selectedFile?.path as string | undefined) : unstagedPaths[0]
  const stagedSel = !!selectedFile && selectedFile.staged
  const stagedRoving = stagedSel ? (selectedFile?.path as string | undefined) : staged[0]?.path
  const conflictedSel = !!selectedFile && conflicted.includes(selectedFile.path)
  const conflictedRoving = conflictedSel ? (selectedFile?.path as string | undefined) : conflicted[0]

  // Ao abrir o par sem seleção, pega o primeiro arquivo: a linha de baixo
  // existe para revisar o código antes de commitar, não para ficar vazia
  // esperando um clique. Ordem = ordem visual das colunas.
  useEffect(() => {
    if (!pairOpen || selectedFile || selectedCommit) return
    const f = (status?.unstaged ?? [])[0] ?? null
    const u = (status?.untracked ?? [])[0] ?? null
    const s = (status?.staged ?? [])[0] ?? null
    if (f) void selectFile({ path: f.path, staged: false })
    else if (u) void selectFile({ path: u, staged: false })
    else if (s) void selectFile({ path: s.path, staged: true })
  }, [pairOpen, selectedFile, selectedCommit, status])

  // Vista de commit selecionado no histórico: meta + arquivos + diff.
  if (selectedCommit) {
    const files = commitDetail?.files ?? []
    return (
      <div className="details">
        {expanded && <div className="pane-backdrop" onClick={() => setExpanded(null)} />}
        <div className="details-title commit-title">
          <button className="mini-btn" title={tr('det.backWcTitle')} onClick={() => void selectCommit(null)}>
            <ArrowLeft size={13} /> {tr('det.backWc')}
          </button>
          <span className="mono muted">{selectedCommit.slice(0, 7)}</span>
        </div>
        <div className="commit-meta">
          {commitDetail ? (
            <>
              <div className="msg">
                {visibleRefs(commitDetail.refs).map((r) => (
                  <RefBadge key={r} name={r} />
                ))}
                {commitDetail.message}
              </div>
              <div className="meta-grid">
                <span className="muted">{tr('det.author')}</span>
                <span>{commitDetail.author}</span>
                <span className="muted">{tr('det.committer')}</span>
                <span>{commitDetail.committer}</span>
                <span className="muted">{tr('det.date')}</span>
                <span>{commitDetail.date.slice(0, 16).replace('T', ' ')}</span>
                <span className="muted">Commit</span>
                <span className="mono">{commitDetail.hash}</span>
                {commitDetail.parents.length > 0 && (
                  <>
                    <span className="muted">{tr('det.parents')}</span>
                    <span className="mono">{commitDetail.parents.map((p) => p.slice(0, 7)).join(' ')}</span>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="muted">{tr('det.loadingCommit')}</div>
          )}
        </div>
        <div className="details-body">
          <div className={`file-col ${commitPairOpen ? 'expandable expanded pair-cfiles' : expandedClass('cfiles')}`}>
            <div className="file-col-head">
              <h4>{tr('det.files', { n: files.length })}</h4>
              {expandBtn('cfiles')}
            </div>
            {files.map((p) => {
              const st = commitDetail?.stats.find((s) => s.path === p)
              const commitRoving = commitFile ?? files[0]
              return (
                <div
                  key={p}
                  className="file-row"
                  tabIndex={p === commitRoving ? 0 : -1}
                  aria-selected={commitFile === p}
                  onClick={() => {
                    setCommitFile(p)
                    void selectCommitFile(p)
                  }}
                  onKeyDown={(e) =>
                    rowKeyDown(e, () => {
                      setCommitFile(p)
                      void selectCommitFile(p)
                    })
                  }
                  onContextMenu={(e) => commitFileMenu(e, p)}
                >
                  <span className="grow">{p}</span>
                  {st && (
                    <span className="mono muted">
                      (<span className="stat-add">+{st.added}</span> <span className="stat-del">−{st.deleted}</span>)
                    </span>
                  )}
                </div>
              )
            })}
            {commitDetail && files.length === 0 && <div className="file-empty">{tr('det.noFiles')}</div>}
          </div>
          <div
            className={`diff-pane ${commitPairOpen ? 'expandable expanded pair-diff' : expandedClass('cdiff')}`}
          >
            {commitPairOpen ? (
              // No par, o diff é a linha de baixo do overlay: o botão recolhe tudo.
              <button
                className="pane-expand"
                title={tr('det.collapse')}
                onClick={(e) => {
                  e.stopPropagation()
                  setExpanded(null)
                }}
              >
                <Minimize2 size={14} />
              </button>
            ) : (
              expandBtn('cdiff')
            )}
            {commitDiff ? <DiffViewer text={commitDiff} /> : tr('det.selectFile')}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="details">
      {expanded && <div className="pane-backdrop" onClick={() => setExpanded(null)} />}
      <div className="details-title">
        {tr('det.fileStatus')}
        <input
          className="file-filter"
          value={fileFilter}
          onChange={(e) => setFileFilter(e.target.value)}
          placeholder={tr('det.filterPh')}
          aria-label={tr('det.filterPh')}
          spellCheck={false}
        />
        <button className="mini-btn" title={`${tr('common.refresh')} (F5)`} onClick={() => void refresh()}>
          <RefreshCw size={12} className={loading ? 'spin' : undefined} /> {tr('common.refresh')}
        </button>
      </div>
      <div className="details-body">
        {conflicted.length > 0 && (
          <div className={`file-col conflict-col ${expandedClass('conflicted')}`}>
            <div className="file-col-head">
              <h4>{tr('det.conflicted', { n: conflicted.length })}</h4>
              {expandBtn('conflicted')}
            </div>
            {conflicted.map((p) => (
              <FileRow
                key={`!!${p}`}
                path={p}
                staged={false}
                active={selectedFile?.path === p}
                code="!"
                busy={busy}
                roving={p === conflictedRoving}
                tr={tr}
                isConflict
                onSelect={() => {
                  const i = conflicted.indexOf(p)
                  void openResolver().then(() => (i >= 0 ? useStore.getState().gotoConflictFile(i) : undefined))
                }}
                onContextMenu={(e) => fileMenu(e, p, false, true)}
              />
            ))}
          </div>
        )}
        <div className={`file-col ${expandedClass('unstaged')}`}>
          <div className="file-col-head">
            <h4>{tr('det.unstaged', { n: unstaged.length + untracked.length })}</h4>
            {(unstaged.length > 0 || untracked.length > 0) && (
              <button
                className={`mini-btn${markedU > 0 ? ' primary' : ''}`}
                title={markedU > 0 ? tr('det.stageMarked', { n: markedU }) : tr('det.stageAllTitle')}
                disabled={busy}
                onClick={() => void (markedU > 0 ? stageMarked() : stageAll())}
              >
                {markedU > 0 ? tr('det.stageMarked', { n: markedU }) : tr('det.stageAll')}
              </button>
            )}
            {expandBtn('unstaged')}
          </div>
          {unstaged.map((f) => (
            <FileRow
              key={f.path}
              path={f.path}
              staged={false}
              active={selectedFile?.path === f.path && !selectedFile.staged}
              code={f.code.trim()}
              busy={busy}
              roving={f.path === unstagedRoving}
              tr={tr}
              marked={marked.includes(`u:${f.path}`)}
              markTitle={tr('det.mark')}
              onToggleMark={() => toggleMark(`u:${f.path}`)}
              onSelect={() => void selectFile({ path: f.path, staged: false })}
              onContextMenu={(e) => fileMenu(e, f.path, false, true)}
              onStage={() => void selectFile({ path: f.path, staged: false }).then(() => stageSelected())}
            />
          ))}
          {untracked.map((p) => (
            <div
              key={`??${p}`}
              className="file-row"
              tabIndex={p === unstagedRoving ? 0 : -1}
              aria-selected={selectedFile?.path === p && !selectedFile.staged}
              onClick={() => void selectFile({ path: p, staged: false })}
              onKeyDown={(e) => rowKeyDown(e, () => void selectFile({ path: p, staged: false }))}
              onContextMenu={(e) => fileMenu(e, p, false, false)}
            >
              <input
                type="checkbox"
                className="mark-box"
                checked={marked.includes(`u:${p}`)}
                title={tr('det.mark')}
                aria-label={tr('det.mark')}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggleMark(`u:${p}`)}
              />
              <span className="code">?</span>
              <span className="grow">{p}</span>
              <button
                className="mini-btn"
                title={tr('det.stageFile')}
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation()
                  void selectFile({ path: p, staged: false }).then(() => stageSelected())
                }}
              >
                {tr('det.stage')}
              </button>
            </div>
          ))}
          {unstaged.length === 0 && untracked.length === 0 && (
            <div className="file-empty">{tr('det.noUnstaged')}</div>
          )}
        </div>
        <div className={`file-col ${expandedClass('staged')}`}>
          <div className="file-col-head">
            <h4>{tr('det.staged', { n: staged.length })}</h4>
            {staged.length > 0 && (
              <button
                className={`mini-btn${markedS > 0 ? ' primary' : ''}`}
                title={markedS > 0 ? tr('det.unstageMarked', { n: markedS }) : tr('det.unstageAllTitle')}
                disabled={busy}
                onClick={() => void (markedS > 0 ? unstageMarked() : unstageAll())}
              >
                {markedS > 0 ? tr('det.unstageMarked', { n: markedS }) : tr('det.unstageAll')}
              </button>
            )}
            {expandBtn('staged')}
          </div>
          {staged.map((f) => (
            <FileRow
              key={f.path}
              path={f.path}
              staged={true}
              active={selectedFile?.path === f.path && selectedFile.staged}
              code={f.code.trim()}
              busy={busy}
              roving={f.path === stagedRoving}
              tr={tr}
              marked={marked.includes(`s:${f.path}`)}
              markTitle={tr('det.mark')}
              onToggleMark={() => toggleMark(`s:${f.path}`)}
              onSelect={() => void selectFile({ path: f.path, staged: true })}
              onContextMenu={(e) => fileMenu(e, f.path, true, true)}
              onUnstage={() => void selectFile({ path: f.path, staged: true }).then(() => unstageSelected())}
            />
          ))}
          {staged.length === 0 && <div className="file-empty">{tr('det.noStaged')}</div>}
        </div>
        <div
          className={`diff-pane ${pairOpen ? 'expandable expanded pair-diff' : expandedClass('diff')}`}
        >
          {pairOpen ? (
            // No par, o diff é a linha de baixo do overlay: o botão recolhe tudo.
            <button
              className="pane-expand"
              title={tr('det.collapse')}
              onClick={(e) => {
                e.stopPropagation()
                setExpanded(null)
              }}
            >
              <Minimize2 size={14} />
            </button>
          ) : (
            expandBtn('diff')
          )}
          {isConflicted && (
            <div className="conflict-bar" title={tr('conflict.hint')}>
              <span>{tr('conflict.hint')}</span>
              <button
                className="mini-btn primary"
                title={tr('cr.title')}
                onClick={() => {
                  const i = conflicted.indexOf(selectedFile?.path ?? '')
                  void useStore
                    .getState()
                    .openResolver()
                    .then(() => (i >= 0 ? useStore.getState().gotoConflictFile(i) : undefined))
                }}
              >
                {tr('cr.editBoth')}
              </button>
              <button className="mini-btn" onClick={() => selectedFile && void resolveOurs(selectedFile.path)}>
                {tr('conflict.ours')}
              </button>
              <button className="mini-btn" onClick={() => selectedFile && void resolveTheirs(selectedFile.path)}>
                {tr('conflict.theirs')}
              </button>
            </div>
          )}
          {diff ? (
            <>
              {/* Split exige hunks: em diff sintético (untracked) não há stage
                  por hunk, então o toggle só poluiria. */}
              {hunks.length > 0 && (
                <div className="diff-toolbar">
                  {modeToggle()}
                </div>
              )}
              <DiffViewer
                text={diff}
                file={selectedFile?.path}
                staged={selectedFile?.staged ?? false}
                hunks={hunks}
                interactive
                mode={diffMode}
              />
            </>
          ) : (
            tr('det.selectFile')
          )}
        </div>
      </div>
      <div className="commit-bar">
        <textarea
          ref={commitRef}
          placeholder={`${tr('det.commitMsgPh')} — ${tr('det.templateHint')}`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (matchShortcut('commit', e) && canCommit) {
              e.preventDefault()
              void doCommit()
            }
          }}
        />
        <div className="commit-row">
          <label>
            <input type="checkbox" checked={amend} onChange={(e) => setAmend(e.target.checked)} /> {tr('det.amend')}
          </label>
          <button
            className="tool-btn primary"
            onClick={() => void doCommit()}
            disabled={!canCommit || busy}
            title={!canCommit ? tr('det.commitHint') : `${tr('toolbar.commitStaged')} (${tr('det.ctrlEnter')})`}
          >
            {busy ? tr('dlg.loading') : tr('det.commit')}{allStaged.length > 0 && !amend ? ` (${allStaged.length})` : ''}
          </button>
          {error && <span className="error">{error}</span>}
        </div>
      </div>
    </div>
  )
})

export default DetailsPanel
