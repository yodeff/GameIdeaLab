import type { Encryptor } from '../../src/main/secrets/secretStore'

/** 暗号化の代わり（中身は base64 にするだけ。平文がファイルに残らないことは確かめられる） */
export const fakeEncryptor = (available = true, reEncrypt = false): Encryptor => ({
  isAsyncEncryptionAvailable: async () => available,
  encryptStringAsync: async (s) => Buffer.from(`enc:${Buffer.from(s).toString('base64')}`),
  decryptStringAsync: async (b) => ({ result: Buffer.from(b.toString().slice(4), 'base64').toString(), shouldReEncrypt: reEncrypt })
})
