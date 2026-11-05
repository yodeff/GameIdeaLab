import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, type GameIdeaLabApi } from '@shared/ipc'

// renderer に渡すのは GameIdeaLabApi の関数だけ。ipcRenderer 自体は公開しない
const api: GameIdeaLabApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannel.appInfo)
}

contextBridge.exposeInMainWorld('gameIdeaLab', api)
