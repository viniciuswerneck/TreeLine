import { useEffect, useRef } from 'react'
import { EditorView, drawSelection, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  HighlightStyle,
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  StreamLanguage,
  syntaxHighlighting
} from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { css as langCss } from '@codemirror/lang-css'
import { html as langHtml } from '@codemirror/lang-html'
import { javascript as langJs } from '@codemirror/lang-javascript'
import { json as langJson } from '@codemirror/lang-json'
import { markdown as langMarkdown } from '@codemirror/lang-markdown'
import { c as cLang, cpp, csharp, dart, java, kotlin, scala } from '@codemirror/legacy-modes/mode/clike'
import { diff } from '@codemirror/legacy-modes/mode/diff'
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile'
import { go } from '@codemirror/legacy-modes/mode/go'
import { haskell } from '@codemirror/legacy-modes/mode/haskell'
import { lua } from '@codemirror/legacy-modes/mode/lua'
import { less, sCSS } from '@codemirror/legacy-modes/mode/css'
import { perl } from '@codemirror/legacy-modes/mode/perl'
import { powerShell } from '@codemirror/legacy-modes/mode/powershell'
import { python } from '@codemirror/legacy-modes/mode/python'
import { r } from '@codemirror/legacy-modes/mode/r'
import { ruby } from '@codemirror/legacy-modes/mode/ruby'
import { rust } from '@codemirror/legacy-modes/mode/rust'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { standardSQL } from '@codemirror/legacy-modes/mode/sql'
import { swift } from '@codemirror/legacy-modes/mode/swift'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { xml } from '@codemirror/legacy-modes/mode/xml'
import { yaml } from '@codemirror/legacy-modes/mode/yaml'

/**
 * Cores de sintaxe derivadas dos tokens do Design System. Dois estilos — um
 * para painel claro e outro para escuro — porque o app tem 10 temas e um
 * conjunto fixo de hex não sobrevive a todos.
 */
const lightSyntax = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword, tags.operatorKeyword], class: 'cm-t-kw' },
  { tag: [tags.name, tags.standard(tags.name)], class: 'cm-t-fn' },
  { tag: [tags.definition(tags.name), tags.function(tags.variableName), tags.function(tags.propertyName)], class: 'cm-t-fn' },
  { tag: [tags.typeName, tags.className, tags.namespace], class: 'cm-t-type' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], class: 'cm-t-str' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], class: 'cm-t-num' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment], class: 'cm-t-com' },
  { tag: [tags.propertyName, tags.attributeName], class: 'cm-t-prop' },
  { tag: [tags.tagName, tags.labelName], class: 'cm-t-tag' },
  { tag: [tags.meta, tags.processingInstruction, tags.documentMeta], class: 'cm-t-meta' },
  { tag: [tags.link, tags.url], class: 'cm-t-link' },
  { tag: tags.invalid, class: 'cm-t-invalid' }
])

const darkSyntax = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword, tags.operatorKeyword], class: 'cm-t-kw d' },
  { tag: [tags.name, tags.standard(tags.name)], class: 'cm-t-fn d' },
  { tag: [tags.definition(tags.name), tags.function(tags.variableName), tags.function(tags.propertyName)], class: 'cm-t-fn d' },
  { tag: [tags.typeName, tags.className, tags.namespace], class: 'cm-t-type d' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], class: 'cm-t-str d' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], class: 'cm-t-num d' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment], class: 'cm-t-com d' },
  { tag: [tags.propertyName, tags.attributeName], class: 'cm-t-prop d' },
  { tag: [tags.tagName, tags.labelName], class: 'cm-t-tag d' },
  { tag: [tags.meta, tags.processingInstruction, tags.documentMeta], class: 'cm-t-meta d' },
  { tag: [tags.link, tags.url], class: 'cm-t-link d' },
  { tag: tags.invalid, class: 'cm-t-invalid d' }
])

const cmTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--bg-panel)', color: 'var(--text-1)' },
  '.cm-scroller': {
    fontFamily: '"Cascadia Mono", "JetBrains Mono", ui-monospace, "DejaVu Sans Mono", monospace',
    fontSize: '12px',
    lineHeight: '1.55'
  },
  '.cm-content': { caretColor: 'var(--accent)', paddingBottom: '40px' },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-panel)',
    color: 'var(--text-2)',
    borderRight: '1px solid var(--border-line)'
  },
  '.cm-activeLineGutter': { backgroundColor: 'var(--bg-hover)', color: 'var(--text-1)' },
  '.cm-activeLine': { backgroundColor: 'var(--bg-hover)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground, ::selection': { backgroundColor: 'color-mix(in srgb, var(--accent) 30%, transparent)' },
  '&.cm-focused .cm-selectionBackground': { backgroundColor: 'color-mix(in srgb, var(--accent) 38%, transparent)' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
  '.cm-foldGutter span': { color: 'var(--text-2)' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 24%, transparent)',
    outline: 'none'
  },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--bg-hover)', color: 'var(--text-2)', border: '1px solid var(--border-line)' }
})

/** Extensão de arquivo → linguagem. Só os modos realmente usados entram no bundle. */
const LANG_BY_EXT: Record<string, () => Extension> = {
  js: () => langJs(),
  mjs: () => langJs(),
  cjs: () => langJs(),
  jsx: () => langJs({ jsx: true }),
  ts: () => langJs({ typescript: true }),
  mts: () => langJs({ typescript: true }),
  cts: () => langJs({ typescript: true }),
  tsx: () => langJs({ typescript: true, jsx: true }),
  json: () => langJson(),
  jsonc: () => langJson(),
  css: () => langCss(),
  scss: () => StreamLanguage.define(sCSS),
  less: () => StreamLanguage.define(less),
  html: () => langHtml({ selfClosingTags: true }),
  htm: () => langHtml({ selfClosingTags: true }),
  vue: () => langHtml({ selfClosingTags: true }),
  svg: () => StreamLanguage.define(xml),
  xml: () => StreamLanguage.define(xml),
  md: () => langMarkdown(),
  markdown: () => langMarkdown(),
  py: () => StreamLanguage.define(python),
  pyw: () => StreamLanguage.define(python),
  sh: () => StreamLanguage.define(shell),
  bash: () => StreamLanguage.define(shell),
  zsh: () => StreamLanguage.define(shell),
  fish: () => StreamLanguage.define(shell),
  c: () => StreamLanguage.define(cLang),
  h: () => StreamLanguage.define(cLang),
  cc: () => StreamLanguage.define(cpp),
  cpp: () => StreamLanguage.define(cpp),
  hpp: () => StreamLanguage.define(cpp),
  cs: () => StreamLanguage.define(csharp),
  java: () => StreamLanguage.define(java),
  kt: () => StreamLanguage.define(kotlin),
  scala: () => StreamLanguage.define(scala),
  dart: () => StreamLanguage.define(dart),
  go: () => StreamLanguage.define(go),
  rs: () => StreamLanguage.define(rust),
  rb: () => StreamLanguage.define(ruby),
  lua: () => StreamLanguage.define(lua),
  pl: () => StreamLanguage.define(perl),
  pm: () => StreamLanguage.define(perl),
  ps1: () => StreamLanguage.define(powerShell),
  r: () => StreamLanguage.define(r),
  R: () => StreamLanguage.define(r),
  hs: () => StreamLanguage.define(haskell),
  swift: () => StreamLanguage.define(swift),
  sql: () => StreamLanguage.define(standardSQL),
  yaml: () => StreamLanguage.define(yaml),
  yml: () => StreamLanguage.define(yaml),
  toml: () => StreamLanguage.define(toml),
  ini: () => StreamLanguage.define(toml),
  dockerfile: () => StreamLanguage.define(dockerFile),
  diff: () => StreamLanguage.define(diff),
  patch: () => StreamLanguage.define(diff)
}

export function languageForPath(path: string): Extension[] {
  const name = path.split('/').pop() ?? ''
  if (name === 'Dockerfile') return [StreamLanguage.define(dockerFile)]
  if (name === 'Makefile') return []
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  const make = LANG_BY_EXT[ext]
  return make ? [make()] : []
}

/** Detecta se o painel está num tema escuro a partir dos tokens computados. */
function panelIsDark(): boolean {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--bg-panel').trim()
  const hex = /^#([0-9a-f]{3,8})$/i.exec(raw)
  if (!hex) return false
  let h = hex[1]!
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255)
  const lin = (v: number): number => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const lum = 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!)
  return lum < 0.45
}

export interface CodeMirrorPaneProps {
  value: string
  onChange?: (next: string) => void
  path?: string
  ariaLabel?: string
  className?: string
}

/**
 * Editor CodeMirror 6 do resultado: highlighting por arquivo, line numbers,
 * fold e histórico de desfazer.
 *
 * O documento só é reescrito quando `value` difere do que está no editor —
 * digitação dispara `onChange`, o pai devolve o MESMO texto e o efeito não
 * mexe no cursor. Recompor escolhas muda `value` de verdade e aí o doc é
 * substituído (é o momento em que o caret deve ir para o fim).
 */
export default function CodeMirrorPane({ value, onChange, path, ariaLabel, className }: CodeMirrorPaneProps) {
  const host = useRef<HTMLDivElement | null>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const syncing = useRef(false)
  const langComp = useRef(new Compartment())
  const syntaxComp = useRef(new Compartment())

  useEffect(() => {
    const el = host.current
    if (!el) return
    const v = new EditorView({
      parent: el,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          foldGutter(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          highlightActiveLine(),
          // Sem binding de Mod-Enter aqui: o handler global do overlay fecha
          // o arquivo e o CM deixa a tecla borbulhar (a guarda dele é por
          // isContentEditable, não por "ignora tudo dentro do editor").
          keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
          EditorState.tabSize.of(4),
          cmTheme,
          syntaxComp.current.of(syntaxHighlighting(panelIsDark() ? darkSyntax : lightSyntax, { fallback: true })),
          langComp.current.of(languageForPath(path ?? '')),
          EditorView.updateListener.of((u) => {
            // Recomposição vinda de FORA (escolhas → resultado) não é digitação:
            // sem essa trava o pai marcava `edited` sozinho toda vez que o
            // motor recompostava o texto e o pill de "por decidir" virava 0.
            if (u.docChanged && !syncing.current) onChangeRef.current?.(u.state.doc.toString())
          }),
          EditorView.contentAttributes.of({ 'aria-label': ariaLabel ?? '' })
        ]
      })
    })
    view.current = v

    // Troca de tema no meio do overlay (tema claro→escuro é só recolorir).
    const syncTheme = (): void => {
      v.dispatch({ effects: syntaxComp.current.reconfigure(syntaxHighlighting(panelIsDark() ? darkSyntax : lightSyntax, { fallback: true })) })
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const mo = new MutationObserver(syncTheme)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    mq.addEventListener('change', syncTheme)

    return () => {
      mq.removeEventListener('change', syncTheme)
      mo.disconnect()
      v.destroy()
      view.current = null
    }
    // Cria uma vez: valor/língua/tema têm efeito próprio abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Linguagem muda de arquivo para arquivo sem recriar o editor.
  useEffect(() => {
    view.current?.dispatch({ effects: langComp.current.reconfigure(languageForPath(path ?? '')) })
  }, [path])

  // Texto vindo de fora (recompor escolhas / trocar de arquivo).
  useEffect(() => {
    const v = view.current
    if (!v) return
    const cur = v.state.doc.toString()
    if (cur === value) return
    syncing.current = true
    try {
      v.dispatch({
        changes: { from: 0, to: cur.length, insert: value },
        selection: { anchor: Math.min(v.state.selection.main.anchor, value.length) },
        scrollIntoView: true
      })
    } finally {
      // `dispatch` é síncrono: o updateListener já rodou dentro do try.
      syncing.current = false
    }
  }, [value])

  return <div ref={host} className={`cm-host ${className ?? ''}`} />
}
