// キーワード辞書の型と検査。

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
  | { type: 'word-format'; word: string; categoryId: string }

/** 一般キーワードの 1 語: 漢字・ひらがな・カタカナ・長音・々 の 1〜10 文字（design/04 §1.3） */
const KEYWORD_PATTERN = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々]{1,10}$/u
/** ジャンル名: 英字（RPG など）を含みうるので、空白と制御文字が無い 1〜12 文字とする */
const GENRE_PATTERN = /^[^\s\p{Cc}]{1,12}$/u

/** 辞書の誤りを返す。異なるカテゴリに同じ単語がある場合も重複とする（企画書 §5.6） */
export function findDictionaryIssues(dictionary: KeywordDictionary): DictionaryIssue[] {
  const issues: DictionaryIssue[] = []
  const seenIds = new Set<string>()
  const wordOwners = new Map<string, string[]>()
  const pattern = dictionary.kind === 'keyword' ? KEYWORD_PATTERN : GENRE_PATTERN

  for (const category of dictionary.categories) {
    if (seenIds.has(category.id)) issues.push({ type: 'duplicate-category-id', categoryId: category.id })
    seenIds.add(category.id)

    for (const raw of category.words) {
      const word = raw.trim()
      if (word === '') {
        issues.push({ type: 'blank-word', categoryId: category.id })
        continue
      }
      if (word !== raw || !pattern.test(word)) issues.push({ type: 'word-format', word: raw, categoryId: category.id })
      wordOwners.set(word, [...(wordOwners.get(word) ?? []), category.id])
    }
  }

  for (const [word, categoryIds] of wordOwners) {
    if (categoryIds.length > 1) issues.push({ type: 'duplicate-word', word, categoryIds })
  }
  return issues
}

/** 単語が 1 つ以上あるカテゴリだけを返す（抽選の対象。D-2） */
export function nonEmptyCategories(dictionary: KeywordDictionary): KeywordCategory[] {
  return dictionary.categories.filter((c) => c.words.length > 0)
}
