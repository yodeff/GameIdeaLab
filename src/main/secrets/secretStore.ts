// 秘密の保管（design/02 §6）。Electron の safeStorage（Windows では DPAPI）で暗号化してファイルに書く。
// 暗号化できない環境では保存を断る（平文で書かない）。テストでは偽の暗号化を渡す。
// Electron 45 では同期の safeStorage の関数が非推奨なので、非同期の関数を使う（LEARNINGS L-11）。
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type Encryptor = {
  isAsyncEncryptionAvailable: () => Promise<boolean>
  encryptStringAsync: (plain: string) => Promise<Buffer>
  decryptStringAsync: (encrypted: Buffer) => Promise<{ result: string; shouldReEncrypt: boolean }>
}

export class SecretUnavailableError extends Error {
  constructor() {
    super('この環境では秘密の情報を暗号化して保存できない')
    this.name = 'SecretUnavailableError'
  }
}

const KEY = /^[a-z0-9-]{1,64}$/

export class SecretStore {
  constructor(
    private readonly dir: string,
    private readonly encryptor: Encryptor
  ) {}

  available(): Promise<boolean> {
    return this.encryptor.isAsyncEncryptionAvailable()
  }

  private path(key: string): string {
    if (!KEY.test(key)) throw new Error(`秘密のキーの形が違う: ${key}`)
    return join(this.dir, `${key}.bin`)
  }

  async getJson<T>(key: string): Promise<T | null> {
    const file = this.path(key)
    if (!existsSync(file) || !(await this.available())) return null
    try {
      const { result, shouldReEncrypt } = await this.encryptor.decryptStringAsync(readFileSync(file))
      const value = JSON.parse(result) as T
      if (shouldReEncrypt) await this.setJson(key, value) // 鍵が入れ替わったら新しい鍵で書き直す
      return value
    } catch {
      return null // 壊れた・別の利用者の暗号。無いものとして扱う
    }
  }

  async setJson(key: string, value: unknown): Promise<void> {
    const file = this.path(key)
    if (!(await this.available())) throw new SecretUnavailableError()
    const encrypted = await this.encryptor.encryptStringAsync(JSON.stringify(value))
    mkdirSync(this.dir, { recursive: true })
    const tmp = `${file}.tmp`
    writeFileSync(tmp, encrypted)
    renameSync(tmp, file)
  }

  delete(key: string): void {
    rmSync(this.path(key), { force: true })
  }
}
