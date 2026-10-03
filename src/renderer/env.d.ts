import type { TreeLineAPI } from '../shared/types'

declare global {
  interface Window {
    treeline: TreeLineAPI
  }
}

export {}
