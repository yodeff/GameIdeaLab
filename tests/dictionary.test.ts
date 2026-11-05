import { describe, expect, it } from 'vitest'
import { findDictionaryIssues, type KeywordDictionary } from '@core/dictionary'
import keywords from '../resources/dictionaries/keywords.ja.json'
import genres from '../resources/dictionaries/genres.ja.json'

describe('findDictionaryIssues', () => {
  it('別のカテゴリにある同じ単語を重複として返す', () => {
    const dictionary: KeywordDictionary = {
      schemaVersion: 1,
      kind: 'keyword',
      categories: [
        { id: 'a', label: 'A', words: ['鍵', '扉'] },
        { id: 'b', label: 'B', words: [' 鍵 '] }
      ]
    }
    expect(findDictionaryIssues(dictionary)).toEqual([
      { type: 'duplicate-word', word: '鍵', categoryIds: ['a', 'b'] }
    ])
  })

  it('空の単語と重複したカテゴリ ID を返す', () => {
    const dictionary: KeywordDictionary = {
      schemaVersion: 1,
      kind: 'keyword',
      categories: [
        { id: 'a', label: 'A', words: [''] },
        { id: 'a', label: 'A2', words: [] }
      ]
    }
    expect(findDictionaryIssues(dictionary)).toEqual([
      { type: 'blank-word', categoryId: 'a' },
      { type: 'duplicate-category-id', categoryId: 'a' }
    ])
  })
})

describe('同梱の辞書', () => {
  it.each([
    ['keywords.ja.json', keywords],
    ['genres.ja.json', genres]
  ])('%s に誤りがない', (_name, dictionary) => {
    expect(findDictionaryIssues(dictionary as KeywordDictionary)).toEqual([])
  })
})
