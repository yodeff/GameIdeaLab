import { describe, expect, it } from 'vitest'
import {
  IDEAS_SCHEMA,
  IDEA_ITEM_SCHEMA,
  buildDeriveInput,
  buildGenerateInput,
  buildInstructions,
  bodyToText,
  combinationLines,
  createIdeaStreamParser,
  directionsFor,
  planIdeas,
  EXPERIMENT_AXES,
  parseGameIdeaBody,
  type GameIdeaBody
} from '@core/idea'
import { sampleIdea } from '../support/ideas'
import { seededRng } from '../support/rng'

const combination = { genres: ['経営シミュレーション'], keywords: ['自動販売機', '寄生'] }

describe('directionsFor（D-13）', () => {
  it.each([
    [1, ['王道']],
    [3, ['王道', '変化球', '実験的']],
    [5, ['王道', '変化球', '実験的', '王道', '変化球']]
  ])('%i 案', (n, expected) => {
    expect(directionsFor(n)).toEqual(expected)
  })
})

describe('指示文', () => {
  it('忠実度ごとに違う規則が入り、方向の意味と避けることが入る', () => {
    const strict = buildInstructions('strict')
    const free = buildInstructions('free')
    expect(strict).toContain('すべてのキーワードを')
    expect(free).toContain('飛躍してよい')
    for (const s of [strict, free]) {
      expect(s).toContain('欲張るほど')
      expect(s).toContain('困ったことが起きる → 手を打つ → ごほうび')
      expect(s).toContain('ねらい')
      expect(s).toContain('プレイの様子を思い浮かべられる')
      expect(s).toContain('「ほどける」')
      expect(s).toContain('変化球')
      expect(s).toContain('ありがちな RPG')
      expect(s).toContain('日本語')
    }
  })

  it('依頼に組み合わせと案ごとの方向が入る', () => {
    const input = buildGenerateInput(combination, directionsFor(4).map((direction) => ({ direction, axis: null })))
    expect(input).toContain('キーワード1: 自動販売機')
    expect(input).toContain('ゲームジャンル: 経営シミュレーション')
    expect(input).toContain('4 案')
    expect(input).toContain('4. 王道')
  })

  it('派生の依頼に元の案と操作が入り、別のジャンルでは新しいジャンルを使う', () => {
    const parent = sampleIdea({ direction: '変化球' })
    const genre = buildDeriveInput(combination, parent, 'genre', { genre: 'パズル' })
    expect(genre).toContain('ゲームジャンル: パズル')
    expect(genre).toContain('寄生自販機チェーン')
    expect(genre).toContain('「変化球」')
    expect(buildDeriveInput(combination, parent, 'free', { instruction: '協力プレイにする' })).toContain('協力プレイにする')
  })
})

describe('combinationLines（スロットの数が変わる）', () => {
  it('ジャンルが 1 つならそのまま、キーワードは並んだ数だけ番号を振る', () => {
    expect(combinationLines({ genres: ['パズル'], keywords: ['鍵', '扉', '鏡'] })).toEqual([
      'キーワード1: 鍵',
      'キーワード2: 扉',
      'キーワード3: 鏡',
      'ゲームジャンル: パズル'
    ])
  })

  it('ジャンルが無ければ自由に選ばせ、複数なら掛け合わせる', () => {
    expect(combinationLines({ genres: [], keywords: ['鍵'] }).at(-1)).toMatch(/指定なし.*自由に選び/)
    expect(combinationLines({ genres: ['パズル', 'RPG'], keywords: ['鍵'] }).at(-1)).toBe('ゲームジャンル: パズル と RPG（これらを掛け合わせる）')
  })

  it('生成の依頼にもその行が入る', () => {
    const input = buildGenerateInput({ genres: [], keywords: ['鍵'] }, [{ direction: '王道', axis: null }])
    expect(input).toContain('キーワード1: 鍵')
    expect(input).not.toContain('キーワード2')
    expect(input).toContain('ゲームジャンル: 指定なし')
  })
})

describe('JSON Schema', () => {
  it('strict のために全項目を required に入れ、余分な項目を許さない', () => {
    expect([...IDEA_ITEM_SCHEMA.required].sort()).toEqual(Object.keys(IDEA_ITEM_SCHEMA.properties).sort())
    expect(IDEA_ITEM_SCHEMA.additionalProperties).toBe(false)
    expect(IDEAS_SCHEMA.additionalProperties).toBe(false)
  })
})

describe('parseGameIdeaBody', () => {
  it('正しい案を返し、任意の項目の空文字を null にそろえる', () => {
    expect(parseGameIdeaBody({ ...sampleIdea(), features: '' })).toEqual(sampleIdea())
  })

  it.each([
    ['方向が違う', { direction: '普通' }],
    ['必須の項目が空', { core_loop: '' }],
    ['必須の項目が無い', { goal: undefined }],
    ['任意の項目が数値', { features: 1 }]
  ])('%s なら null', (_name, broken) => {
    expect(parseGameIdeaBody({ ...sampleIdea(), ...broken })).toBeNull()
  })

  it('検索用の文に全項目が入る', () => {
    const text = bodyToText(sampleIdea({ features: '特徴' }))
    expect(text).toContain('寄生自販機チェーン')
    expect(text).toContain('短期と長期')
    expect(text).toContain('特徴')
  })
})

describe('createIdeaStreamParser', () => {
  const full = JSON.stringify({
    ideas: [
      sampleIdea({ title: '括弧 { と } と "引用" を含む', concept: 'エスケープ \\ と [配列] も' }),
      sampleIdea({ direction: '変化球', title: '二つ目' }),
      sampleIdea({ direction: '実験的', title: '三つ目' })
    ]
  })

  it('1 文字ずつ届いても、閉じた案から順に取り出す', () => {
    const parser = createIdeaStreamParser()
    const titles: string[] = []
    const closedAt: number[] = []
    ;[...full].forEach((ch, i) => {
      for (const item of parser.push(ch)) {
        titles.push((item as GameIdeaBody).title)
        closedAt.push(i)
      }
    })
    expect(titles).toEqual(['括弧 { と } と "引用" を含む', '二つ目', '三つ目'])
    expect(closedAt[0]).toBeLessThan(full.length / 2) // 1 つ目は全体が届く前に出る
    expect(parser.text()).toBe(full)
  })

  it('途中で切れたら、閉じていない案は返さない', () => {
    const parser = createIdeaStreamParser()
    const items = parser.push(full.slice(0, Math.floor(full.length * 0.5)))
    expect(items.length).toBeLessThan(3)
    expect(items.every((i) => !(i instanceof Error))).toBe(true)
  })

  it('ideas 以外の配列の中のオブジェクトは取り出さない', () => {
    const parser = createIdeaStreamParser()
    expect(parser.push('{"meta":[{"a":1}],"ideas":[{"title":"x"}]}')).toEqual([{ title: 'x' }])
  })
})

describe('planIdeas（版 4）', () => {
  it('実験的の案にだけ軸を割り当て、同じ依頼の中では重ねない', () => {
    const plan = planIdeas(9, seededRng(1))
    expect(plan.map((p) => p.direction)).toEqual(directionsFor(9))
    const axes = plan.filter((p) => p.direction === '実験的').map((p) => p.axis)
    expect(axes.every((a) => a !== null && (EXPERIMENT_AXES as readonly string[]).includes(a))).toBe(true)
    expect(new Set(axes).size).toBe(axes.length)
    expect(plan.filter((p) => p.direction !== '実験的').every((p) => p.axis === null)).toBe(true)
  })

  it('依頼に変える軸が入る', () => {
    const input = buildGenerateInput(combination, planIdeas(3, seededRng(2)))
    expect(input).toMatch(/3\. 実験的（変える軸: .+）/)
  })

  it('乱数が違えば軸もばらける', () => {
    const seen = new Set(Array.from({ length: 30 }, (_, i) => planIdeas(3, seededRng(i))[2]?.axis))
    expect(seen.size).toBeGreaterThan(5)
  })
})
