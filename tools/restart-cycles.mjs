// 再起動の確かめ（design/06 の T-24）。ビルドしたアプリを一時フォルダの保存先（GIL_USER_DATA）で起動し、
// 画面の操作と IPC の書き込みをしてから、普通に閉じる・強制終了・書き込み中に強制終了を繰り返す。
// そのたびに DB の健全さ（quick_check）と件数を出す。本物のデータには触らない。
// 使い方: npm run build してから npm run smoke:restart -- <回数>（既定 9）
// 配る形のアプリを確かめるときは GIL_APP_EXE にその exe を渡す（例: release/win-unpacked/Game Idea Lab.exe）
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const APP = join(import.meta.dirname, '..')
const ELECTRON = join(APP, 'node_modules/electron/dist', process.platform === 'win32' ? 'electron.exe' : 'electron')
const userData = mkdtempSync(join(tmpdir(), 'gil-cycle-'))
const cycles = Number(process.argv[2] ?? 9)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const checkScript = join(mkdtempSync(join(tmpdir(), 'gil-check-')), 'check.cjs')
writeFileSync(
  checkScript,
  `const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync(process.argv[2])
const qc = db.prepare('PRAGMA quick_check').all().map((r) => Object.values(r)[0])
const v = db.prepare('PRAGMA user_version').get().user_version
const c = db.prepare('SELECT count(*) n FROM ideas').get().n
const s = db.prepare('SELECT count(*) n FROM settings').get().n
console.log(JSON.stringify({ qc: qc.slice(0, 2), v, ideas: c, settings: s }))
db.close()`
)

function check() {
  const r = spawnSync(ELECTRON, [checkScript, join(userData, 'game-idea-lab.sqlite')], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8'
  })
  return (r.stdout.trim() || r.stderr.trim()).split('\n').filter((l) => !l.includes('Experimental')).join(' ')
}

async function connect(port) {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
      const page = list.find((t) => t.type === 'page' && t.url.startsWith('file:'))
      if (page) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(150)
  }
  throw new Error('CDP に繋がらない')
}

async function evaluate(wsUrl, expression) {
  const ws = new WebSocket(wsUrl)
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)))
  const result = await new Promise((resolve) => {
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data)
      if (d.id === 1) resolve(d.result)
    }
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
  })
  ws.close()
  if (result?.exceptionDetails) console.log('画面での実行に失敗', JSON.stringify(result.exceptionDetails).slice(0, 600))
  return result?.result?.value ?? result
}

// 画面の操作と、IPC 経由の書き込み（設定・作業状態・案）
const ACTIONS = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  for (let t = 0; t < 50 && !document.querySelector('.draw-button'); t++) await sleep(100)
  const api = window.gameIdeaLab
  for (let i = 0; i < 6; i++) { document.querySelector('.draw-button')?.click(); await sleep(120) }
  document.querySelector('.slot-add--keyword')?.click()
  await sleep(100)
  for (let i = 0; i < 5; i++) await api.updateSettings({ aiCount: 1 + ((Math.floor(Date.now() / 7) + i) % 10) })
  for (let i = 0; i < 3; i++) await api.saveHumanIdea({ title: 'cycle ' + i, body: 'body ' + Date.now(), combination: { genres: ['パズル'], keywords: ['鍵'] } })
  await sleep(700) // 作業状態の自動保存（500 ms）を待つ
  return (await api.listIdeas({ scope: 'saved', text: '', genre: null, favoritesOnly: false, limit: 1 })).total
})()`

for (let i = 1; i <= cycles; i++) {
  const mode = i % 3 === 0 ? 'kill-mid' : i % 2 === 0 ? 'kill' : 'close'
  const port = 9400 + i
  const exe = process.env['GIL_APP_EXE']
  const child = spawn(exe ?? ELECTRON, [...(exe ? [] : ['.']), `--remote-debugging-port=${port}`], {
    cwd: APP,
    env: { ...process.env, GIL_USER_DATA: userData },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let log = ''
  child.stdout.on('data', (d) => (log += d))
  child.stderr.on('data', (d) => (log += d))
  const exited = new Promise((r) => child.on('exit', (code) => r(code)))
  const ws = await connect(port)
  // 安全装置: アプリが一時フォルダの保存先を使っていなければ（GIL_USER_DATA に対応していない古いビルドなど）、
  // 本物のデータに書かないよう、何もせずに止める（2026-11-05、LEARNINGS L-24）
  if (!existsSync(join(userData, 'game-idea-lab.sqlite'))) {
    child.kill()
    console.error('アプリが一時フォルダの保存先を使っていません。本物のデータに書かないよう止めました')
    process.exit(1)
  }
  let saved
  if (mode === 'kill-mid') {
    // 書き込みの最中に強制終了する
    void evaluate(ws, ACTIONS).catch(() => {})
    await sleep(500 + Math.random() * 600)
    child.kill()
  } else {
    saved = await evaluate(ws, ACTIONS)
    if (mode === 'close') await evaluate(ws, 'window.close()').catch(() => {})
    else child.kill()
  }
  const code = await Promise.race([exited, sleep(8000).then(() => 'timeout')])
  if (code === 'timeout') child.kill()
  const files = readdirSync(userData).filter((f) => f.startsWith('game-idea-lab'))
  const notice = /壊れていた/.test(log) ? ' ★起動時に壊れていると判定' : ''
  console.log(`#${i} ${mode} exit=${code} saved=${saved ?? '-'} files=[${files.join(',')}] ${check()}${notice}`)
}
console.log('userData', userData)
