import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, type GameIdeaLabApi } from '@shared/ipc'

// renderer に渡すのは GameIdeaLabApi の関数だけ。ipcRenderer 自体は公開しない
const api: GameIdeaLabApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannel.appInfo),
  loadWorkspace: () => ipcRenderer.invoke(IpcChannel.workspaceLoad),
  saveWorkspace: (workspace) => ipcRenderer.invoke(IpcChannel.workspaceSave, workspace),
  getSettings: () => ipcRenderer.invoke(IpcChannel.settingsGet),
  updateSettings: (patch) => ipcRenderer.invoke(IpcChannel.settingsUpdate, patch),
  saveHumanIdea: (input) => ipcRenderer.invoke(IpcChannel.ideaSaveHuman, input)
}

contextBridge.exposeInMainWorld('gameIdeaLab', api)
