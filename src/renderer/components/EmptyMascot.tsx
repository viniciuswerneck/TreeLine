// Mascote do estado vazio do histórico: o commit-dot do grafo personificado.
// SVG inline, tema-aware (cores via CSS var), animação barata (só transform/
// opacity), pulo no clique/Enter + mensagens rotativas por contexto. Sem deps.
import { useEffect, useRef, useState } from 'react'
import type { DictKey } from '../i18n'

export type MascotMood = 'empty' | 'dirty' | 'noMatch'

const MESSAGES: Record<MascotMood, DictKey[]> = {
  empty: ['mascot.emptyA', 'mascot.emptyB', 'mascot.emptyC'],
  dirty: ['mascot.dirtyA', 'mascot.dirtyB', 'mascot.dirtyC'],
  noMatch: ['mascot.noMatchA', 'mascot.noMatchB']
}

// Fila da sessão: a próxima mensagem de cada humor avança a cada visita,
// para não repetir na sequência ao pular de contexto.
const cursor: Record<MascotMood, number> = { empty: 0, dirty: 0, noMatch: 0 }

const nextKey = (mood: MascotMood): DictKey => {
  const list = MESSAGES[mood]
  const key = list[cursor[mood] % list.length] as DictKey
  cursor[mood] += 1
  return key
}

interface Props {
  mood: MascotMood
  tr: (key: DictKey) => string
  onClearFilter: () => void
}

export default function EmptyMascot({ mood, tr, onClearFilter }: Props) {
  const [jumping, setJumping] = useState(false)
  const [msgKey, setMsgKey] = useState(() => nextKey(mood))
  const [pokes, setPokes] = useState(0)
  const jumpTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(jumpTimer.current), [])

  const poke = (): void => {
    setPokes((p) => p + 1)
    setMsgKey(nextKey(mood))
    setJumping(true)
    window.clearTimeout(jumpTimer.current)
    jumpTimer.current = window.setTimeout(() => setJumping(false), 650)
  }

  return (
    <div className="mascot-wrap">
      <svg
        className={`mascot mascot-${mood}${jumping ? ' mascot-jump' : ''}`}
        viewBox="0 0 200 180"
        role="button"
        tabIndex={0}
        aria-label={tr('mascot.alt')}
        onClick={poke}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            poke()
          }
        }}
      >
        <title>{pokes > 0 ? `${tr('mascot.alt')} · #${pokes}` : tr('mascot.alt')}</title>
        {/* chão */}
        <line x1="14" y1="158" x2="186" y2="158" stroke="var(--text-2)" strokeOpacity="0.35" strokeDasharray="1 6" strokeLinecap="round" />

        {/* antena: galho em tridente (mini branch de git) */}
        <g className="mascot-antenna" stroke="var(--text-2)" strokeWidth="4" strokeLinecap="round" fill="none">
          <path d="M100 44 V 22" />
          <path d="M100 22 H 108 M108 22 v 5" />
          <path d="M100 22 H 92 M92 22 v 5" />
        </g>

        {mood === 'noMatch' && (
          <g className="mascot-lens">
            <circle cx="150" cy="58" r="17" stroke="var(--accent)" strokeWidth="5" fill="none" />
            <path d="M162 70 l 11 11" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" />
          </g>
        )}
        {mood === 'dirty' && (
          <g className="mascot-sweat">
            <path d="M151 34 q 3 7 0 12 -3 -5 0 -12" fill="var(--accent)" opacity="0.85" />
            <path d="M162 40 q 3 6 0 10 -3 -4 0 -10" fill="var(--accent)" opacity="0.85" />
          </g>
        )}

        {/* corpo: o commit-dot */}
        <circle cx="100" cy="104" r="52" fill="var(--accent)" opacity="0.14" />
        <circle cx="100" cy="100" r="48" fill="var(--accent)" />

        {/* braços */}
        <g stroke="var(--accent)" strokeWidth="9" strokeLinecap="round">
          {mood === 'dirty' ? (
            <>
              <path d="M56 84 Q 42 92 40 102" />
              <path d="M144 84 Q 158 92 160 102" />
            </>
          ) : mood === 'noMatch' ? (
            <>
              <path d="M56 88 Q 40 98 44 108" />
              <path d="M144 88 Q 160 98 156 108" />
            </>
          ) : (
            <>
              <path d="M54 92 Q 40 104 48 116" />
              <path d="M146 92 Q 160 104 152 116" />
            </>
          )}
        </g>

        {/* pés */}
        <g fill="var(--accent)">
          <ellipse cx="76" cy="154" rx="14" ry="8" />
          <ellipse cx="124" cy="154" rx="14" ry="8" />
          {mood === 'dirty' && <ellipse cx="98" cy="166" rx="42" ry="10" className="mascot-dirt" />}
        </g>

        {/* olhos */}
        <g className="mascot-eyes">
          <ellipse cx="82" cy="88" rx="7" ry={mood === 'noMatch' ? 6 : 9} fill="var(--bg-panel)" />
          <ellipse cx="118" cy="88" rx="7" ry={mood === 'noMatch' ? 6 : 9} fill="var(--bg-panel)" />
          <circle cx="84" cy="92" r="3.2" fill="var(--text-1)" />
          <circle cx="120" cy="92" r="3.2" fill="var(--text-1)" />
        </g>

        {/* boca: humor */}
        {mood === 'empty' ? (
          <path d="M88 116 q 12 8 24 0" stroke="var(--bg-panel)" strokeWidth="4" strokeLinecap="round" fill="none" />
        ) : mood === 'dirty' ? (
          <path d="M88 112 q 12 12 24 0" stroke="var(--bg-panel)" strokeWidth="4" strokeLinecap="round" fill="none" />
        ) : (
          <path d="M86 116 q 14 -9 28 -3" stroke="var(--bg-panel)" strokeWidth="4" strokeLinecap="round" fill="none" />
        )}
      </svg>

      <p className="mascot-msg" role="status">
        {tr(msgKey)}
      </p>
      {mood === 'noMatch' && (
        <button className="mascot-action" onClick={onClearFilter}>
          {tr('hist.clearFilter')}
        </button>
      )}
    </div>
  )
}