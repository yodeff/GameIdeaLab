import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, screen, shell } from 'electron'
import type { Settings, WindowBounds } from '@core/settings'
import { AI_EVENT_CHANNEL, type AiEvent } from '@shared/ipc'
import { ApiKeyStore, apiKeyClient, chatGptClient, clientFor } from './ai/connection'
import { GenerationJobs } from './ai/jobs'
import { ChatGptAuth } from './auth/chatgptAuth'
import { runModelBench } from './benchModels'
import { runIdeaEvaluation } from './evalIdeas'
import { createHandlers } from './ipc/handlers'
import { SecretStore } from './secrets/secretStore'
import { backupIfDue, getSettings, isHealthy, openDatabase, openDatabaseReadOnly, recoverDatabase, updateSettings } from './storage'

const DEFAULT_SIZE = { width: 1280, height: 820 }

let db: DatabaseSync | null = null

/** 保存した位置がどの画面にも入っていなければ使わない（画面の構成が変わったとき） */
function visibleBounds(bounds: WindowBounds | null): WindowBounds | null {
  if (!bounds) return null
  const visible = screen.getAllDisplays().some(({ workArea: a }) => {
    const x = Math.max(a.x, bounds.x)
    const y = Math.max(a.y, bounds.y)
    return Math.min(a.x + a.width, bounds.x + bounds.width) - x >= 100 && Math.min(a.y + a.height, bounds.y + bounds.height) - y >= 100
  })
  return visible ? bounds : null
}

function createWindow(database: DatabaseSync): void {
  const saved = visibleBounds(getSettings(database).windowBounds)
  const win = new BrowserWindow({
    ...(saved ?? DEFAULT_SIZE),
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'Game Idea Lab',
    backgroundColor: '#14161a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  win.once('ready-to-show', () => win.show())
  win.on('close', () => {
    const b = win.getNormalBounds()
    updateSettings(database, { windowBounds: { x: b.x, y: b.y, width: b.width, height: b.height } })
  })

  // 外部ページをアプリ内で開かない。https だけを既定のブラウザへ渡す（design/02 §7）
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
}

/** 開発用の道具（評価・速さの計測）として起動したか。本物の DB には書かない（LEARNINGS L-20） */
const devTool = !app.isPackaged && (process.argv.includes('--eval-ideas') || process.argv.includes('--bench-models'))

/** 起動時に知らせること（壊れた DB を直したときなど） */
let startupNotice: string | null = null

const dbPath = () => join(app.getPath('userData'), 'game-idea-lab.sqlite')

function openStorage(): DatabaseSync {
  const path = dbPath()
  if (!isHealthy(path)) {
    const report = recoverDatabase(path, new Date())
    console.error('DB が壊れていたので脇へ移して作り直した', report)
    startupNotice = `保存データの一部が壊れていたため、新しく作り直しました（設定 ${report.settings} 件、案 ${report.ideas} 件を引き継ぎ。壊れたファイルは消さずに残しています）。`
  }
  const database = openDatabase(path)
  try {
    backupIfDue(database, join(app.getPath('userData'), 'backups'), new Date())
  } catch (e) {
    console.error('控えを作れなかった', e) // 控えの失敗で起動を止めない
  }
  return database
}

/** 開発用の道具は設定だけを読み取り専用で読み、DB は閉じる */
function readSettingsOnce(): Settings {
  const ro = openDatabaseReadOnly(dbPath())
  try {
    return getSettings(ro)
  } finally {
    ro.close()
  }
}

// 保存先を別のフォルダにする（手で確かめるときに本物のデータを触らないため。06-manual-checks.md）。
// 配ったアプリでも効く（保存先が変わるだけ）。単一起動のロックも保存先ごとなので、本物のアプリと並べて起動できる
const userDataOverride = process.env['GIL_USER_DATA']
if (userDataOverride) app.setPath('userData', userDataOverride)

// 同じ DB を 2 つのアプリが同時に使わないように、2 つ目の起動は 1 つ目の窓を前に出して終わる
if (!devTool && !app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
  void app.whenReady().then(start)
}

function start(): void {
  const fetchFn = globalThis.fetch.bind(globalThis)
  const openExternal = (url: string) => shell.openExternal(url)
  const secrets = new SecretStore(join(app.getPath('userData'), 'secrets'), safeStorage)
  const auth = new ChatGptAuth({ store: secrets, fetch: fetchFn, openExternal })
  const apiKeys = new ApiKeyStore(secrets)
  const connections = { chatgpt: chatGptClient(auth, fetchFn), apiKey: apiKeyClient(apiKeys, fetchFn) }

  // 開発時だけ: モデルごとの速さ・生成の質の評価。ウィンドウを出さず、本物の DB にも書かずに終わる
  if (devTool) {
    const settings = readSettingsOnce()
    const client = clientFor(connections, settings.aiConnection)
    const projectDir = process.cwd()
    const task = process.argv.includes('--bench-models')
      ? runModelBench({ projectDir, client, settings, log: console.log }).then((file) => console.log(`計測の結果: ${file}`))
      : runIdeaEvaluation({ projectDir, client, settings, log: console.log }).then((file) => console.log(`評価の結果: ${file}`))
    void task.catch((e: unknown) => console.error('失敗した', e)).finally(() => app.quit())
    return
  }

  const database = openStorage()
  db = database
  const client = () => clientFor(connections, getSettings(database).aiConnection)
  const emit = (event: AiEvent) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send(AI_EVENT_CHANNEL, event)
  }
  const jobs = new GenerationJobs({
    db: database,
    settings: () => getSettings(database),
    client,
    emit,
    newId: randomUUID,
    now: () => new Date()
  })
  const handlers = createHandlers({
    db: database,
    appInfo: () => ({ name: app.getName(), version: app.getVersion(), platform: process.platform, notice: startupNotice }),
    secrets,
    auth,
    apiKeys,
    jobs,
    client,
    openExternal,
    saveTextFile: async (defaultName, content) => {
      const owner = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      const options = {
        title: 'Markdown で保存',
        defaultPath: join(app.getPath('documents'), defaultName),
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      }
      const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) return null
      writeFileSync(result.filePath, content, 'utf8')
      return basename(result.filePath)
    }
  })
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (_event, ...args: unknown[]) => handler(...args))
  }

  // Mac はメニューの「編集」が無いと、入力欄で ⌘C・⌘V などが効かない。標準のメニューだけを置く
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]))
  }

  createWindow(database)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(database)
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  db?.close()
  db = null
})
