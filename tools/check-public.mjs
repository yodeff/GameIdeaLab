// 公開前の検査（docs/DECISIONS/0002）。git に入る予定のファイルに、公開したくない情報が無いかを見る。
// - Windows の個人の場所を指す絶対パス
// - メールアドレス（GitHub の noreply を除く）
// - private/public-check.json（git 管理外）の deny に書いた語
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const BINARY = /\.(png|jpe?g|gif|ico|icns|woff2?|ttf|sqlite|zip|exe)$/i
const ABSOLUTE_PATH = /\b[A-Za-z]:[\\/]+(?:Users|Develop|Agent)\b/
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g
const ALLOWED_EMAIL = /@users\.noreply\.github\.com$|@example\.(?:com|org)$/

const deny = existsSync('private/public-check.json')
  ? JSON.parse(readFileSync('private/public-check.json', 'utf8')).deny ?? []
  : []

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  encoding: 'utf8'
})
  .split('\0')
  .filter((f) => f && !BINARY.test(f) && existsSync(f) && f !== 'package-lock.json')

const problems = []
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  lines.forEach((line, i) => {
    const where = `${file}:${i + 1}`
    if (ABSOLUTE_PATH.test(line)) problems.push(`${where} 個人の環境の絶対パス`)
    for (const email of line.match(EMAIL) ?? []) {
      if (!ALLOWED_EMAIL.test(email) && !/^[\w.+-]+@[\d.]+$/.test(email)) problems.push(`${where} メールアドレス`)
    }
    for (const word of deny) {
      if (line.includes(word)) problems.push(`${where} 公開しない語（private/public-check.json）`)
    }
  })
}

if (problems.length > 0) {
  console.error(`公開前の検査: ${problems.length} 件\n` + problems.map((p) => `  ${p}`).join('\n'))
  console.error('個人の環境や内部の事情は private/ に移す（docs/DECISIONS/0002）。')
  process.exit(1)
}
console.log(`公開前の検査: OK（${files.length} ファイル、公開しない語 ${deny.length} 件）`)
