// 外へのリンク。デスクトップ版の入手先は公開するときに決まるので、お試し版のビルドで渡す（VITE_DOWNLOAD_URL）
const download = import.meta.env['VITE_DOWNLOAD_URL'] as string | undefined

/** デスクトップ版の入手先。決まっていなければ null（リンクを出さない） */
export const DOWNLOAD_URL: string | null = download && /^https:\/\//.test(download) ? download : null
