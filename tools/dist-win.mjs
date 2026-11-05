// Windows のインストーラーを作る（DECISIONS/0006）。npm run dist:win から呼ぶ。
// electron-builder の道具の置き場（既定は %LOCALAPPDATA%\electron-builder\Cache）を node_modules/.cache に移す。
// %LOCALAPPDATA% に暗号化（EFS）の印が付いた環境では、置き場の中のファイルに印が移り、
// 暗号化を使えない Windows Home ではコピーに失敗するため（LEARNINGS L-24）。
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const env = { ...process.env }
env['ELECTRON_BUILDER_CACHE'] ??= join(root, 'node_modules', '.cache', 'electron-builder')
const bin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder')
const r = spawnSync(bin, ['--win', 'nsis', '--x64'], { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' })
process.exit(r.status ?? 1)
