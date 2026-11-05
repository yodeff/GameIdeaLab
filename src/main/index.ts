import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import type { WindowBounds } from '@core/settings'
import { createHandlers } from './ipc/handlers'
import { backupIfDue, getSettings, openDatabase, updateSettings } from './storage'

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

function openStorage(): DatabaseSync {
  const dir = app.getPath('userData')
  const database = openDatabase(join(dir, 'game-idea-lab.sqlite'))
  try {
    backupIfDue(database, join(dir, 'backups'), new Date())
  } catch (e) {
    console.error('控えを作れなかった', e) // 控えの失敗で起動を止めない
  }
  return database
}

void app.whenReady().then(() => {
  const database = openStorage()
  db = database
  const handlers = createHandlers({
    db: database,
    appInfo: () => ({ name: app.getName(), version: app.getVersion(), platform: process.platform })
  })
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (_event, ...args: unknown[]) => handler(...args))
  }

  createWindow(database)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(database)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  db?.close()
  db = null
})
