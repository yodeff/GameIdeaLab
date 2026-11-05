import { describe, expect, it } from 'vitest'
import { findDictionaryIssues, nonEmptyCategories, type KeywordDictionary } from '@core/dictionary'
import keywords from '../../resources/dictionaries/keywords.ja.json'
import genres from '../../resources/dictionaries/genres.ja.json'

const keywordDictionary = (categories: KeywordDictionary['categories']): KeywordDictionary => ({
  schemaVersion: 1,
  kind: 'keyword',
  categories
})

describe('findDictionaryIssues', () => {
  it('別のカテゴリにある同じ単語を重複として返す', () => {
    const issues = findDictionaryIssues(
      keywordDictionary([
        { id: 'a', label: 'A', words: ['鍵', '扉'] },
        { id: 'b', label: 'B', words: ['鍵'] }
      ])
    )
    expect(issues).toEqual([{ type: 'duplicate-word', word: '鍵', categoryIds: ['a', 'b'] }])
  })

  it('空の単語と重複したカテゴリ ID を返す', () => {
    const issues = findDictionaryIssues(
      keywordDictionary([
        { id: 'a', label: 'A', words: [''] },
        { id: 'a', label: 'A2', words: [] }
      ])
    )
    expect(issues).toEqual([
      { type: 'blank-word', categoryId: 'a' },
      { type: 'duplicate-category-id', categoryId: 'a' }
    ])
  })

  it.each([' 鍵', 'key', '鍵・扉', 'あいうえおかきくけこさ'])('一般キーワードの形に合わない「%s」を返す', (word) => {
    const issues = findDictionaryIssues(keywordDictionary([{ id: 'a', label: 'A', words: [word] }]))
    expect(issues).toContainEqual({ type: 'word-format', word, categoryId: 'a' })
  })

  it('ジャンルの辞書では英字を許す', () => {
    const dictionary: KeywordDictionary = {
      schemaVersion: 1,
      kind: 'genre',
      categories: [{ id: 'story', label: '物語', words: ['RPG'] }]
    }
    expect(findDictionaryIssues(dictionary)).toEqual([])
  })
})

describe('nonEmptyCategories', () => {
  it('単語の無いカテゴリを除く', () => {
    const dictionary = keywordDictionary([
      { id: 'a', label: 'A', words: [] },
      { id: 'b', label: 'B', words: ['鍵'] }
    ])
    expect(nonEmptyCategories(dictionary).map((c) => c.id)).toEqual(['b'])
  })
})

describe('同梱の辞書', () => {
  it.each([
    ['keywords.ja.json', keywords],
    ['genres.ja.json', genres]
  ])('%s に誤りがない', (_name, dictionary) => {
    expect(findDictionaryIssues(dictionary as KeywordDictionary)).toEqual([])
  })

  it('ジャンルの辞書に「その他」が無い（D-5）', () => {
    const words = (genres as KeywordDictionary).categories.flatMap((c) => c.words)
    expect(words).not.toContain('その他')
  })
})
