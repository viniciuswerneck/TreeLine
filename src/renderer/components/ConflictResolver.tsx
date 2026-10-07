import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronUp, GitMerge, RefreshCw, SkipForward, X } from 'lucide-react'
import { useStore } from '../store'
import type { ConflictSide as Side, ConflictStages } from '../../shared/types'
import {
  applyChoices,
  conflictRegions,
  endsWithNewline,
  hasMarkers,
  missingSideRegion,
  parseRegions,
  setChoice,
  stepConflict,
  toLines,
  type ConflictChoice,
  type ConflictRegion
} from '../lib/conflict3'
import CodeMirrorPane from './CodeMirrorPane'

/** Rótulo da operação em pt/en/es para o subtítulo do header. */
const OP_LABEL: Record<string, string> = {
  merge: 'merge',
  rebase: 'rebase',
  'cherry-pick': 'cherry-pick',
  revert: 'revert',
  stash: 'stash'
}

/** Tipo de conflito como o Git descreve, para o subtítulo do arquivo. */
const KIND_LABEL: Record<string, string> = {
  'both-modified': 'both modified',
  'both-added': 'added on both sides',
  'deleted-by-them': 'deleted by them, modified by us',
  'deleted-by-us': 'deleted by us, modified by them',
  'both-deleted': 'deleted on both sides',
  binary: 'binary'
}

/** Checkbox A ligado: a escolha inclui o lado A. */
const sideA = (c: ConflictChoice | null): boolean => c === 'ours' || c === 'both' || c === 'both-reversed'
/** Checkbox B ligado: a escolha inclui o lado B. */
const sideB = (c: ConflictChoice | null): boolean => c === 'theirs' || c === 'both' || c === 'both-reversed'

export default function ConflictResolver() {
  const files = useStore((s) => s.conflictFiles)
  const index = useStore((s) => s.conflictIndex)
  const op = useStore((s) => s.conflictOp)
  const open = useStore((s) => s.resolverOpen)
  const loading = useStore((s) => s.conflictLoading)
  const epoch = useStore((s) => s.conflictEpoch)
  const rerere = useStore((s) => s.rerere)
  const repo = useStore((s) => s.current)
  const tr = useStore((s) => s.tr)
  const gotoFile = useStore((s) => s.gotoConflictFile)
  const close = useStore((s) => s.closeResolver)
  const resolveBySide = useStore((s) => s.resolveConflictBySide)
  const saveResult = useStore((s) => s.saveConflictResult)
  const resolveAll = useStore((s) => s.resolveAllRemaining)
  const setRerere = useStore((s) => s.toggleRerere)
  const abortOp = useStore((s) => s.abortCurrentOp)
  const continueOp = useStore((s) => s.continueCurrentOp)
  const confirmAction = useStore((s) => s.confirmAction)

  const file = files[index] ?? null
  const [stages, setStages] = useState<ConflictStages | null>(null)
  const [regions, setRegions] = useState<ConflictRegion[]>([])
  const [regionIdx, setRegionIdx] = useState(0)
  const [result, setResult] = useState('')
  /**
   * `true` quando o usuário digitou no Result. Nesse caso o `result` é a
   * resposta FINAL e não pode ser recomposto a partir das escolhas: antes a
   * UI gravava o texto inteiro como `custom` de TODAS as regiões e o
   * `applyChoices` despejava o arquivo completo em cada uma (duplicação).
   */
  const [edited, setEdited] = useState(false)
  const [localBusy, setLocalBusy] = useState(false)
  /**
   * Coluna do Resultado visível (padrão WinMerge: dá pra olhar só A|B). O
   * toggle mora na toolbar porque o layout de 3 colunas é a tela inteira —
   * sem ele não existe jeito de ver os dois lados com altura cheia.
   */
  const [showResult, setShowResult] = useState(() => localStorage.getItem('treeline-resolver-result') !== '0')
  const toggleResult = useCallback(() => {
    setShowResult((v) => {
      localStorage.setItem('treeline-resolver-result', v ? '0' : '1')
      return !v
    })
  }, [])
  const setLoading = (v: boolean): void => useStore.setState({ conflictLoading: v })
  const busy = localBusy || loading
  const [error, setError] = useState<string | null>(null)
  const loadedFor = useRef<string | null>(null)

  const conflicts = useMemo(() => conflictRegions(regions), [regions])

  // Um delete/modify não tem marcadores no worktree: o git só deixa stages
  // 1+2 ou 1+3. O renderer monta a região única a partir dos lados crus
  // (contrato 4 do conflict3), senão a UI abriria vazia.
  const build = useCallback(
    (s: ConflictStages): ConflictRegion[] => {
      if (s.kind === 'binary') return []
      if (s.kind === 'deleted-by-them' || s.kind === 'deleted-by-us' || s.kind === 'both-deleted') {
        return [
          missingSideRegion(toLines(s.ours ?? s.theirs ?? ''), (s.ours ?? null) !== null, {
            oursMissing: (s.ours ?? null) === null,
            theirsMissing: (s.theirs ?? null) === null
          })
        ]
      }
      return parseRegions(s.marked)
    },
    []
  )

  /** Recarrega os estágios do arquivo atual e monta as regiões. */
  const load = useCallback(
    async (path: string) => {
      if (!repo) return
      setLoading(true)
      setError(null)
      try {
        const s = await window.treeline.getConflictStages(repo, path)
        setStages(s)
        const r = build(s)
        setRegions(r)
        setRegionIdx(0)
        setResult(applyChoices(r, endsWithNewline(s.marked)).text)
        setEdited(false)
        loadedFor.current = path
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setStages(null)
      } finally {
        setLoading(false)
      }
    },
    [repo, build]
  )

  // Epoch novo invalida o cache "já carreguei este caminho": acontece ao
  // reabrir o overlay e quando o `continue` avança e o rebase reconflita o
  // MESMO arquivo com conteúdo diferente (rebase multi-commit). Precisa vir
  // antes do efeito de load.
  useEffect(() => {
    loadedFor.current = null
  }, [epoch])

  // Sem arquivo selecionado (tudo resolvido / lista vazia): não deixa o último
  // arquivo congelado no meio da tela enquanto o usuário vai dar Continue.
  useEffect(() => {
    if (file) return
    setStages(null)
    setRegions([])
    setRegionIdx(0)
    setResult('')
    setEdited(false)
    setError(null)
  }, [file])

  useEffect(() => {
    if (!open || !file) return
    if (loadedFor.current === file.path && stages?.path === file.path) return
    void load(file.path)
  }, [open, file, stages?.path, load])

  const patch = useCallback(
    (next: ConflictRegion[]) => {
      setRegions(next)
      setResult(applyChoices(next, endsWithNewline(stages?.marked ?? '')).text)
      setEdited(false)
    },
    [stages?.marked]
  )

  /** Marca/desmarca UMA região — o motor por trás dos checkboxes A/B. */
  const setRegionChoice = useCallback(
    (ci: number, choice: ConflictChoice) => {
      const r = conflicts[ci]
      if (!r) return
      const real = regions.findIndex((x) => x === r)
      if (real < 0) return
      patch(regions.map((x, i) => (i === real ? setChoice(x, choice) : x)))
      setRegionIdx(ci)
    },
    [conflicts, regions, patch]
  )

  /**
   * Semântica do VS Code Merge Editor:
   *   só A → `ours`   só B → `theirs`   os dois → `both`   nenhum → `base`
   * Desmarcar os dois é uma ESCOLHA (base), não "ainda pendente" — por isso
   * o estado `null` fica com checkbox vazado e o contador seguindo contando.
   */
  const toggleSide = useCallback(
    (ci: number, side: 'ours' | 'theirs') => {
      const r = conflicts[ci]
      if (!r) return
      const a = sideA(r.choice)
      const b = sideB(r.choice)
      if (side === 'ours') {
        const on = !a
        setRegionChoice(ci, on ? (b ? 'both' : 'ours') : b ? 'theirs' : 'base')
      } else {
        const on = !b
        setRegionChoice(ci, on ? (a ? 'both' : 'theirs') : a ? 'ours' : 'base')
      }
    },
    [conflicts, setRegionChoice]
  )

  /** Checkbox do cabeçalho do painel: decide todas as regiões de uma vez. */
  const setAll = useCallback(
    (choice: ConflictChoice) => {
      patch(regions.map((r) => (r.kind === 'conflict' ? setChoice(r, choice) : r)))
      setRegionIdx(0)
    },
    [regions, patch]
  )

  /**
   * Seletor de 4 estados do conflito ativo (toolbar, no lugar das setinhas de
   * "copiar lado"): só A → `ours`, só B → `theirs`, ambos → `both`, nenhum →
   * `base`. Clicar no segmento já ativo volta para o pendente (`null`) — é o
   * "desfazer" do seletor, já que ele não tem estado vazio por definição.
   */
  const chooseSeg = useCallback(
    (choice: ConflictChoice | null) => {
      const r = conflicts[regionIdx]
      if (!r) return
      const real = regions.findIndex((x) => x === r)
      if (real < 0) return
      patch(regions.map((x, i) => (i === real ? { ...x, choice } : x)))
    },
    [conflicts, regions, regionIdx, patch]
  )

  /** "Keep both" num delete/modify apaga o arquivo — precisa de confirmação. */
  const apply = useCallback(async () => {
    if (!file || busy) return
    // Guarda de estágio: só grava o arquivo cujos stages estão carregados.
    // Sem ela, um clique no meio da troca de arquivo manda o resultado do
    // arquivo ANTERIOR para o novo (num binário isso apaga o arquivo).
    if (!stages || stages.path !== file.path) return
    // Binário não tem resultado textual — só "Usar A"/"Usar B".
    if (stages.binary) return
    const composed = applyChoices(regions, endsWithNewline(stages.marked))
    // Texto digitado à mão: ele é o resultado final e prevalece sobre as
    // escolhas por região (nunca recompor — ver comentário em `edited`).
    const text = edited ? result : composed.text
    const deletes = edited ? false : composed.deletes
    setLocalBusy(true)
    setError(null)
    try {
      if (deletes) {
        const ok = await confirmAction(tr('cr.deleteBoth'), `${file.path}`, tr('cr.deleteKeepTheirs'), tr('cr.apply'))
        if (!ok) {
          setLocalBusy(false)
          return
        }
      }
      await saveResult(file.path, text, deletes)
      setLocalBusy(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setLocalBusy(false)
    }
  }, [file, regions, stages, edited, result, busy, saveResult, confirmAction, tr])

  const useSide = useCallback(
    async (side: Side) => {
      if (!file || busy) return
      setLocalBusy(true)
      setError(null)
      try {
        await resolveBySide(file.path, side)
        loadedFor.current = null
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLocalBusy(false)
      }
    },
    [file, busy, resolveBySide]
  )

  const step = useCallback(
    (delta: number) => {
      const next = stepConflict(regions, regionIdx, delta)
      if (next >= 0) setRegionIdx(next)
    },
    [regions, regionIdx]
  )

  // Escape fecha mesmo de dentro do editor; `a`/`b`/`n`/`p` só fora dele —
  // dentro do CodeMirror são texto (a guarda é `isContentEditable`, não o
  // tagName: o conteúdo do CM é um div). Mod+Enter continua valendo dentro.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }
      const t = e.target as HTMLElement | null
      const inEditor = !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
      if (inEditor && !((e.metaKey || e.ctrlKey) && e.key === 'Enter')) return
      if (e.key === 'n' || e.key === 'j') step(1)
      else if (e.key === 'p' || e.key === 'k') step(-1)
      // `a`/`b` batem com os rótulos A/B das colunas e decidem a região ativa
      // (o mesmo que clicar no checkbox); `o`/`t` ficam como alias. `x` = A+B,
      // `0` = nenhum (base) — os outros dois estados do seletor da toolbar.
      else if (e.key === 'a' || e.key === 'o') setRegionChoice(regionIdx, 'ours')
      else if (e.key === 'b' || e.key === 't') setRegionChoice(regionIdx, 'theirs')
      else if (e.key === 'x') setRegionChoice(regionIdx, 'both')
      else if (e.key === '0') setRegionChoice(regionIdx, 'base')
      else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void apply()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, step, setRegionChoice, regionIdx, apply, close])

  // Navegação estilo WinMerge: pular conflito leva a coluna até ele (os dois
  // lados, no mesmo passo — senão A e B se desalinham na rolagem).
  useEffect(() => {
    if (!open) return
    const els = document.querySelectorAll('.cr-block.active')
    els.forEach((el) => el.scrollIntoView({ block: 'nearest' }))
  }, [open, regionIdx, file?.path])

  if (!open) return null

  const s = stages
  const kind = file?.kind ?? 'both-modified'
  const isDelete = kind === 'deleted-by-them' || kind === 'deleted-by-us' || kind === 'both-deleted'
  const unresolved = edited ? 0 : conflicts.filter((r) => r.choice === null).length
  const allA = conflicts.length > 0 && conflicts.every((r) => sideA(r.choice))
  const allB = conflicts.length > 0 && conflicts.every((r) => sideB(r.choice))
  // Stages ainda do arquivo anterior (ou ainda carregando): nenhum número
  // desta tela é confiável — o pill e o rodapé mostram '…' em vez de "0/0".
  const stagesReady = !!file && !!s && s.path === file.path
  /**
   * Estado do seletor de 4 posições para o conflito ATIVO. `both-reversed`
   * (chip "Combinação") é A+B em ordem trocada: cai em "Ambos" para o
   * seletor não aparecer vazio, e o clique seguinte normaliza para `both`.
   */
  const curChoice = conflicts[regionIdx]?.choice ?? null
  const segValue: 'ours' | 'theirs' | 'both' | 'base' | null =
    curChoice === 'ours' || curChoice === 'theirs' || curChoice === 'base'
      ? curChoice
      : curChoice === 'both' || curChoice === 'both-reversed'
        ? 'both'
        : null

  /** Um bloco de conflito dentro do painel A ou B, com o checkbox do lado. */
  const block = (r: ConflictRegion, ci: number, side: 'ours' | 'theirs'): React.ReactNode => {
    const missing = side === 'ours' ? r.oursMissing === true : r.theirsMissing === true
    const lines = side === 'ours' ? r.ours : r.theirs
    const active = ci === regionIdx
    const label = side === 'ours' ? tr('cr.takeOurs') : tr('cr.takeTheirs')
    return (
      <div
        key={`${side}-${ci}`}
        className={`cr-block${active ? ' active' : ''}${r.choice === null ? ' pending' : ''}`}
        onClick={() => setRegionIdx(ci)}
      >
        <div className="cr-block-head">
          <input
            type="checkbox"
            className="cr-cb"
            checked={side === 'ours' ? sideA(r.choice) : sideB(r.choice)}
            disabled={missing}
            title={missing ? tr('cr.deletedSide') : label}
            aria-label={label}
            onChange={() => toggleSide(ci, side)}
            onClick={(e) => e.stopPropagation()}
          />
          <span className="cr-block-n">{tr('cr.region', { i: ci + 1, n: conflicts.length })}</span>
          {missing && <span className="cr-block-flag">{tr('cr.deletedSide')}</span>}
          {active && side === 'ours' && (
            <div className="cr-block-chips" onClick={(e) => e.stopPropagation()}>
              <button
                className="cr-chip"
                onClick={() => setRegionChoice(ci, 'both-reversed')}
                title={tr('cr.bothReversed')}
              >
                {tr('cr.combination')}
              </button>
              <button className="cr-chip ghost" onClick={() => setRegionChoice(ci, 'base')} title={tr('cr.takeBase')}>
                {tr('cr.takeBase')}
              </button>
            </div>
          )}
        </div>
        <pre className="cr-block-body">{missing ? tr('cr.deletedSide') : lines.join('\n')}</pre>
        {r.base.length > 0 && (
          <details className="cr-block-base">
            <summary>{tr('cr.base')}</summary>
            <pre>{r.base.join('\n')}</pre>
          </details>
        )}
      </div>
    )
  }

  const panel = (side: 'ours' | 'theirs'): React.ReactNode => (
    <aside className="cr-panel" data-side={side}>
      <div className="cr-panel-head">
        <input
          type="checkbox"
          className="cr-cb"
          checked={side === 'ours' ? allA : allB}
          disabled={conflicts.length === 0}
          title={side === 'ours' ? tr('cr.takeOurs') : tr('cr.takeTheirs')}
          onChange={(e) => setAll(e.target.checked ? (side === 'ours' ? 'ours' : 'theirs') : 'base')}
        />
        <span className="cr-panel-tag">{side === 'ours' ? 'A' : 'B'}</span>
        <span className="cr-panel-name">{side === 'ours' ? tr('cr.current') : tr('cr.incoming')}</span>
        <span className="cr-panel-ref">{side === 'ours' ? (s?.oursLabel ?? file?.oursLabel) : (s?.theirsLabel ?? file?.theirsLabel)}</span>
      </div>
      <div className="cr-panel-body">
        {conflicts.map((r, ci) => block(r, ci, side))}
        {conflicts.length === 0 && <p className="cr-panel-empty">{tr('cr.noConflict')}</p>}
      </div>
    </aside>
  )

  return (
    <div className="cr-overlay" role="dialog" aria-modal="true" aria-label={tr('cr.title')}>
      <header className="cr-header">
        <GitMerge size={18} />
        <h2>{tr('cr.title')}</h2>
        <span className="cr-sub">
          {tr('cr.subtitle', { n: files.length, op: OP_LABEL[op ?? 'merge'] ?? op ?? 'merge' })}
        </span>
        <div className="cr-spacer" />
        <label className="cr-rerere" title={tr('cr.rerereHint')}>
          <input type="checkbox" checked={rerere} onChange={(e) => void setRerere(e.target.checked)} />
          {tr('cr.rerere')}
          <span className="cr-rerere-state">{rerere ? tr('cr.rerereOn') : tr('cr.rerereOff')}</span>
        </label>
        <button className="cr-icon" title={tr('common.refresh')} onClick={() => file && void load(file.path)}>
          <RefreshCw size={15} />
        </button>
        <button className="cr-icon" title={tr('dlg.close')} onClick={close}>
          <X size={16} />
        </button>
      </header>

      <nav className="cr-files">
        {files.map((f, i) => (
          <button key={f.path} className={`cr-file${i === index ? ' active' : ''}`} onClick={() => void gotoFile(i)} title={f.path}>
            <span className="cr-file-path">{f.path}</span>
            <span className="cr-file-kind">{KIND_LABEL[f.kind] ?? f.xy}</span>
          </button>
        ))}
        {files.length === 0 && <span className="cr-none">{tr('cr.noFiles')}</span>}
      </nav>

      {error && (
        <div className="cr-error">
          <AlertTriangle size={15} />
          <span>{error}</span>
        </div>
      )}

      {/* Toolbar do resolvedor (WinMerge): ▲▼ pulam de conflito e o seletor
          A/B/Ambos/Nenhum decide o conflito ativo. Fica FORA do painel
          Result porque tem que existir também com a coluna do resultado
          oculta e com arquivo binário (contador + pill valem sempre). */}
      {file && (
        <div className="cr-toolbar">
          <div className="cr-region-nav">
            <button
              className="cr-icon"
              title={`${tr('cr.prevConflict')} (p)`}
              onClick={() => step(-1)}
              disabled={conflicts.length === 0}
            >
              <ChevronUp size={15} />
            </button>
            <button
              className="cr-icon"
              title={`${tr('cr.nextConflict')} (n)`}
              onClick={() => step(1)}
              disabled={conflicts.length === 0}
            >
              <ChevronDown size={15} />
            </button>
            <span className="cr-counter">
              {stagesReady && conflicts.length > 0 ? tr('cr.region', { i: regionIdx + 1, n: conflicts.length }) : '…'}
            </span>
          </div>

          {!s?.binary && conflicts.length > 0 && (
            <div className="cr-seg" role="radiogroup" aria-label={tr('cr.choose')}>
              {(
                [
                  ['ours', 'A', tr('cr.takeOurs'), 'a'],
                  ['theirs', 'B', tr('cr.takeTheirs'), 'b'],
                  ['both', tr('cr.both'), tr('cr.takeBoth'), 'x'],
                  ['base', tr('cr.none'), tr('cr.takeBase'), '0']
                ] as const
              ).map(([key, text, hint, hot]) => (
                <button
                  key={key}
                  className={`cr-seg-btn${segValue === key ? ' on' : ''}`}
                  role="radio"
                  aria-checked={segValue === key}
                  title={`${hint} (${hot})`}
                  onClick={() => chooseSeg(curChoice === key ? null : key)}
                >
                  {text}
                </button>
              ))}
            </div>
          )}

          <span className={`cr-pill${stagesReady && unresolved > 0 ? ' warn' : ''}`}>
            {stagesReady ? tr('cr.unresolved', { n: unresolved }) : '…'}
          </span>

          <div className="cr-spacer" />

          {isDelete && (
            <button className="cr-btn danger" onClick={() => void useSide('both-deleted')} disabled={busy}>
              {tr('cr.deleteBoth')}
            </button>
          )}
          <button
            className="cr-chip ghost"
            aria-pressed={showResult}
            onClick={toggleResult}
            title={showResult ? tr('cr.hideResult') : tr('cr.showResult')}
          >
            {tr('cr.result')}
          </button>
          {/* Binário não tem resultado textual: a resolução é só por
              "Usar A"/"Usar B", então o Concluir nem aparece. O `path`
              protege a janela em que os stages ainda são do arquivo
              anterior (troca de arquivo no meio do render). */}
          {s?.path === file.path && !s.binary && (
            <button
              className="cr-btn primary"
              disabled={busy || unresolved > 0 || hasMarkers(result)}
              onClick={() => void apply()}
              title={unresolved > 0 || hasMarkers(result) ? tr('cr.completeMergeWait') : tr('cr.completeMergeHint')}
            >
              <Check size={14} />
              {tr('cr.completeMerge')}
            </button>
          )}
        </div>
      )}

      <div className={`cr-main${showResult ? '' : ' no-result'}`}>
        {/* Tudo resolvido: o overlay FICA aberto — é aqui que mora o
            Continue da operação (no Revert não existe outro ponto de saída). */}
        {!file ? (
          <div className="cr-done">
            <Check size={30} />
            <p className="cr-done-title">{tr('cr.allResolved')}</p>
            <p className="cr-done-hint">{tr('cr.allResolvedHint')}</p>
          </div>
        ) : (
          <>
            {panel('ours')}

            <section className="cr-result">
              <div className="cr-result-head">
                <span className="cr-result-title">{tr('cr.result')}</span>
                {edited && (
                  <button className="cr-btn ghost" onClick={() => patch(regions)} title={tr('cr.recomposeHint')}>
                    {tr('cr.recompose')}
                  </button>
                )}
                <div className="cr-spacer" />
                <span className="cr-result-file">{file.path}</span>
              </div>

              {s?.binary ? (
                <div className="cr-binary">
                  <p>{tr('cr.binary')}</p>
                  <div className="cr-binary-actions">
                    <button className="cr-btn" onClick={() => void useSide('ours')}>
                      {tr('cr.binaryOurs')}
                    </button>
                    <button className="cr-btn" onClick={() => void useSide('theirs')}>
                      {tr('cr.binaryTheirs')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <CodeMirrorPane
                    className="cr-cm"
                    value={result}
                    onChange={(next) => {
                      // Só o texto: o editor É o resultado final. Nada de gravar
                      // o conteúdo inteiro em cada região (duplicava o arquivo).
                      setResult(next)
                      setEdited(true)
                    }}
                    path={file.path}
                    ariaLabel={tr('cr.result')}
                  />
                  <p className="cr-hint">
                    {kind === 'both-added' && tr('cr.addAdded')}
                    {hasMarkers(result) && tr('cr.markerLeft')}
                  </p>
                </>
              )}
            </section>

            {panel('theirs')}
          </>
        )}
      </div>

      <footer className="cr-footer">
        <span className="cr-status">
          {files.length === 0
            ? tr('cr.allResolved')
            : !stagesReady || loading
              ? '…'
              : conflicts.length === 0
                ? s?.binary
                  ? tr('cr.binary')
                  : tr('cr.noConflict')
                : `${conflicts.length - unresolved}/${conflicts.length}`}
        </span>
        <div className="cr-spacer" />
        <div className="cr-all">
          <span>{tr('cr.resolveAll')}</span>
          <button className="cr-btn ghost" onClick={() => void resolveAll('ours')}>
            {tr('cr.allOurs')}
          </button>
          <button className="cr-btn ghost" onClick={() => void resolveAll('theirs')}>
            {tr('cr.allTheirs')}
          </button>
          <button className="cr-btn ghost" onClick={() => void resolveAll('both')}>
            {tr('cr.allBoth')}
          </button>
        </div>
        <button className="cr-btn" onClick={() => file && void gotoFile(index + 1)} disabled={index >= files.length - 1}>
          <SkipForward size={14} />
          {tr('cr.skip')}
        </button>
        <button
          className="cr-btn danger"
          onClick={() =>
            void (async () => {
              const ok = await confirmAction(
                tr('abort.confirmT'),
                tr('abort.confirmM'),
                tr('abort.confirmD'),
                tr('dlg.abort')
              )
              if (ok) await abortOp()
            })()
          }
          disabled={!op}
          title={op ? (op === 'stash' ? 'git reset --merge' : `git ${op} --abort`) : undefined}
        >
          {tr('cr.abort')}
        </button>
        {/* Só habilita com TODOS os conflitos decididos: o main rejeita
            qualquer Continue com unmerged no index, e assim o botão explica
            o porquê em vez de falhar com erro. */}
        <button
          className="cr-btn primary"
          onClick={() => void continueOp()}
          disabled={!op || files.length > 0 || unresolved > 0 || busy}
          title={
            op
              ? op === 'stash'
                ? tr('cr.stashFinish')
                : `git ${op} --continue`
              : tr('cr.noFiles')
          }
        >
          <Check size={14} />
          {tr('dlg.continue')}
        </button>
      </footer>
    </div>
  )
}
