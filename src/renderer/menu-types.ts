// Tipo do item de menu de contexto, em módulo próprio para quebrar o ciclo
// store.ts -> ContextMenu.tsx (o store importa só o tipo; o componente importa
// o store). Tipo puro, sem dependências.
export interface MenuItem {
  label: string
  danger?: boolean
  disabled?: boolean
  onClick?: () => void
  sepBefore?: boolean
}
