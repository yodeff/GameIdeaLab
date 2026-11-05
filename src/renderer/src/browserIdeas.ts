// ブラウザで画面だけを開いたときの、アイデアの保存（localStorage）。SQLite と同じ規則で動かす
// （絞り込みは matchesQuery、更新は applyIdeaPatch。テストで SQLite と同じ結果になることを確かめている）。
import { ideasToMarkdown } from '@core/export'
import { applyIdeaPatch, matchesQuery, type IdeaRecord } from '@core/idea'
import type { GameIdeaLabApi } from '@shared/ipc'

const KEY = 'gil.ideas'
const HISTORY_KEEP = 200

export function readIdeas(): IdeaRecord[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    return Array.isArray(v) ? (v as IdeaRecord[]) : []
  } catch {
    return []
  }
}

function writeIdeas(ideas: IdeaRecord[]): void {
  localStorage.setItem(KEY, JSON.stringify(ideas))
}

/** 追加し、保存していない案を新しい順に 200 件だけ残す（D-17） */
export function addIdea(idea: IdeaRecord): void {
  const all = [...readIdeas(), idea]
  const history = all.filter((i) => !i.saved).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const drop = new Set(history.slice(HISTORY_KEEP).map((i) => i.id))
  writeIdeas(all.filter((i) => !drop.has(i.id)))
}

type IdeaApi = Pick<GameIdeaLabApi, 'listIdeas' | 'updateIdea' | 'deleteIdea' | 'latestGeneration' | 'exportMarkdownFile'>

export function createBrowserIdeaApi(): IdeaApi {
  return {
    listIdeas: async (q) => {
      const all = readIdeas()
      const scoped = all.filter((i) => i.saved === (q.scope === 'saved'))
      const hits = all.filter((i) => matchesQuery(i, q)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return { ideas: hits.slice(0, q.limit), total: hits.length, genres: [...new Set(scoped.map((i) => i.combination.genre))].sort() }
    },
    updateIdea: async (id, patch) => {
      const all = readIdeas()
      const current = all.find((i) => i.id === id)
      if (!current) return null
      const next = applyIdeaPatch(current, patch, new Date().toISOString())
      writeIdeas(all.map((i) => (i.id === id ? next : i)))
      return next
    },
    deleteIdea: async (id) => {
      const all = readIdeas()
      if (!all.some((i) => i.id === id)) return false
      writeIdeas(all.filter((i) => i.id !== id).map((i) => (i.parentId === id ? { ...i, parentId: null } : i)))
      return true
    },
    latestGeneration: async () => {
      const all = readIdeas()
      const last = all.filter((i) => i.source === 'ai' && !i.parentId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
      if (!last) return []
      const base = all.filter((i) => i.generationId === last.generationId)
      const ids = new Set(base.map((i) => i.id))
      return [...base, ...all.filter((i) => i.parentId !== null && ids.has(i.parentId))]
    },
    exportMarkdownFile: async (ids) => {
      const ideas = readIdeas().filter((i) => ids.includes(i.id))
      if (ideas.length === 0) return { saved: false, fileName: null }
      const fileName = ideas.length === 1 ? `${ideas[0]?.title ?? 'idea'}.md` : 'game-ideas.md'
      const url = URL.createObjectURL(new Blob([ideasToMarkdown(ideas)], { type: 'text/markdown' }))
      const a = Object.assign(document.createElement('a'), { href: url, download: fileName })
      a.click()
      URL.revokeObjectURL(url)
      return { saved: true, fileName }
    }
  }
}
