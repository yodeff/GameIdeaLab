// キーワード辞書の型と検査。純粋な関数だけを置く（IO・乱数・時刻に触れない）。
// Electron にも React にも依存しないので、Web 版へもそのまま持っていける。

export type KeywordCategory = {
  id: string
  label: string
  words: string[]
}

export type KeywordDictionary = {
  /** 辞書の形式の版。形を変えたら上げる */
  schemaVersion: 1
  kind: 'keyword' | 'genre'
  categories: KeywordCategory[]
}

export type DictionaryIssue =
  | { type: 'duplicate-category-id'; categoryId: string }
  | { type: 'duplicate-word'; word: string; categoryIds: string[] }
  | { type: 'blank-word'; categoryId: string }

/** 辞書の誤りを返す。異なるカテゴリに同じ単語がある場合も重複とする（企画書 §5.6） */
export function findDictionaryIssues(dictionary: KeywordDictionary): DictionaryIssue[] {
  const issues: DictionaryIssue[] = []
  const seenIds = new Set<string>()
  const wordOwners = new Map<string, string[]>()

  for (const category of dictionary.categories) {
    if (seenIds.has(category.id)) issues.push({ type: 'duplicate-category-id', categoryId: category.id })
    seenIds.add(category.id)

    for (const raw of category.words) {
      const word = raw.trim()
      if (word === '') {
        issues.push({ type: 'blank-word', categoryId: category.id })
        continue
      }
      wordOwners.set(word, [...(wordOwners.get(word) ?? []), category.id])
    }
  }

  for (const [word, categoryIds] of wordOwners) {
    if (categoryIds.length > 1) issues.push({ type: 'duplicate-word', word, categoryIds })
  }
  return issues
}
