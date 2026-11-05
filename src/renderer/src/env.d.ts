import type { GameIdeaLabApi } from '@shared/ipc'

declare global {
  interface Window {
    /** Electron の preload が公開する。Web 版やテストでは存在しない */
    gameIdeaLab?: GameIdeaLabApi
  }
}

export {}
