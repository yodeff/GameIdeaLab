// 辞書は同梱して読む（design/02 §1.1）。抽選は通信しない。
import type { KeywordDictionary } from '@core/dictionary'
import type { Dictionaries } from '@core/draw'
import genres from '../../../../resources/dictionaries/genres.ja.json'
import keywords from '../../../../resources/dictionaries/keywords.ja.json'

export const dictionaries: Dictionaries = {
  keyword: keywords as KeywordDictionary,
  genre: genres as KeywordDictionary
}
