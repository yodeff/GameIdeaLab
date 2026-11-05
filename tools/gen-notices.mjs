// 配るアプリに入る他者のコードのライセンス表記（THIRD_PARTY_NOTICES.md）を作る。
// ビルドの出力（out/）に残る `node_modules/<パッケージ>` の印から、実際に同梱されたパッケージだけを拾う。
// Electron・Chromium のライセンスは electron-builder がインストール先に入れる（LICENSE.electron.txt・LICENSES.chromium.html）。
// 使い方: npm run build の後に node tools/gen-notices.mjs（npm run dist:win が呼ぶ）
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const outDir = join(root, 'out')
if (!existsSync(outDir)) throw new Error('out/ がありません。先に npm run build してください')

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* files(p)
    else if (/\.(c|m)?js$/.test(name)) yield p
  }
}

const packages = new Set()
for (const f of files(outDir)) {
  if (f.includes(`${join('out', 'web')}`)) continue // お試し版は別に配る（同じ中身）
  for (const m of readFileSync(f, 'utf8').matchAll(/node_modules\/((?:@[\w.-]+\/)?[\w.-]+)\//g)) packages.add(m[1])
}

const sections = [...packages].sort().map((name) => {
  const dir = join(root, 'node_modules', name)
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const licenseFile = readdirSync(dir).find((f) => /^licen[cs]e/i.test(f))
  const text = licenseFile ? readFileSync(join(dir, licenseFile), 'utf8').trim() : `（ライセンスの文が見つかりません。${pkg.license}）`
  return `## ${name} ${pkg.version}\n\n- ライセンス: ${pkg.license}\n- 入手先: ${pkg.homepage ?? pkg.repository?.url ?? '—'}\n\n\`\`\`text\n${text}\n\`\`\``
})

const doc = `# Third-party notices / 他者のソフトウェアのライセンス

Game Idea Lab には次のソフトウェアが含まれています。このファイルは \`node tools/gen-notices.mjs\` で作っています（手で直さない）。

Electron と Chromium のライセンスは、インストール先の \`LICENSE.electron.txt\` と \`LICENSES.chromium.html\` にあります。
効果音・辞書・アイコンはこのプロジェクトで作ったものです（\`src/renderer/src/assets/sounds/README.md\`、\`resources/dictionaries/README.md\`）。

${sections.join('\n\n')}
`
writeFileSync(join(root, 'THIRD_PARTY_NOTICES.md'), doc)
console.log(`THIRD_PARTY_NOTICES.md: ${[...packages].sort().join(', ')}`)
