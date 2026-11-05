// main・preload・renderer が共有する IPC の契約。
// renderer へ公開する機能はここに型として列挙し、preload はこの型どおりにだけ橋渡しする。

export const IpcChannel = {
  appInfo: 'app:info'
} as const

export type AppInfo = {
  name: string
  version: string
  platform: string
}

/** preload が window.gameIdeaLab として公開する API */
export type GameIdeaLabApi = {
  getAppInfo: () => Promise<AppInfo>
}
