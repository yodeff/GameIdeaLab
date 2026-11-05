import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { AI_EVENT_CHANNEL, IpcChannel, type AiEvent, type GameIdeaLabApi } from '@shared/ipc'

// renderer に渡すのは GameIdeaLabApi の関数だけ。ipcRenderer 自体は公開しない
const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args)

const api: GameIdeaLabApi = {
  getAppInfo: () => invoke(IpcChannel.appInfo),
  loadWorkspace: () => invoke(IpcChannel.workspaceLoad),
  saveWorkspace: (workspace) => invoke(IpcChannel.workspaceSave, workspace),
  getSettings: () => invoke(IpcChannel.settingsGet),
  updateSettings: (patch) => invoke(IpcChannel.settingsUpdate, patch),
  saveHumanIdea: (input) => invoke(IpcChannel.ideaSaveHuman, input),

  getAuthStatus: () => invoke(IpcChannel.authStatus),
  signIn: () => invoke(IpcChannel.authSignIn),
  cancelSignIn: () => invoke(IpcChannel.authCancelSignIn),
  signOut: () => invoke(IpcChannel.authSignOut),
  setApiKey: (key) => invoke(IpcChannel.authSetApiKey, key),
  clearApiKey: () => invoke(IpcChannel.authClearApiKey),

  listModels: () => invoke(IpcChannel.aiListModels),
  generate: (request) => invoke(IpcChannel.aiGenerate, request),
  derive: (request) => invoke(IpcChannel.aiDerive, request),
  cancelGeneration: (jobId) => invoke(IpcChannel.aiCancel, jobId),
  onAiEvent: (listener) => {
    const handler = (_event: IpcRendererEvent, payload: AiEvent) => listener(payload)
    ipcRenderer.on(AI_EVENT_CHANNEL, handler)
    return () => ipcRenderer.removeListener(AI_EVENT_CHANNEL, handler)
  },
  openExternal: (url) => invoke(IpcChannel.openExternal, url)
}

contextBridge.exposeInMainWorld('gameIdeaLab', api)
