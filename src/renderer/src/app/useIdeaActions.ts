// 案の操作（お気に入り・保存・コピー・Markdown の保存・メモ・削除）。カードと保存済み画面で共通（T-23）
import { useMemo } from 'react'
import { ideaToMarkdown, ideasToMarkdown } from '@core/export'
import type { IdeaPatch, IdeaRecord } from '@core/idea'
import { api } from '../api'
import { useAiActions } from './AiContext'
import { useActions } from './AppContext'

export type IdeaActions = {
  update: (idea: IdeaRecord, patch: IdeaPatch) => Promise<IdeaRecord | null>
  toggleFavorite: (idea: IdeaRecord) => Promise<IdeaRecord | null>
  toggleSaved: (idea: IdeaRecord) => Promise<IdeaRecord | null>
  copy: (ideas: IdeaRecord[]) => void
  exportFile: (ideas: IdeaRecord[]) => Promise<void>
  remove: (idea: IdeaRecord) => Promise<boolean>
}

export function useIdeaActions(): IdeaActions {
  const app = useActions()
  const ai = useAiActions()

  return useMemo<IdeaActions>(() => {
    const update = async (idea: IdeaRecord, patch: IdeaPatch) => {
      const next = await api.updateIdea(idea.id, patch)
      if (next) ai.ideaChanged(next)
      else app.toast('案が見つかりませんでした（削除された可能性があります）')
      return next
    }
    return {
      update,
      toggleFavorite: async (idea) => {
        const next = await update(idea, { favorite: !idea.favorite })
        if (next?.favorite && !idea.saved) app.toast('お気に入りにして、保存しました')
        return next
      },
      toggleSaved: async (idea) => {
        const next = await update(idea, { saved: !idea.saved })
        if (next) app.toast(next.saved ? '保存しました' : '履歴に戻しました')
        return next
      },
      copy: (ideas) => {
        const text = ideas.length === 1 && ideas[0] ? ideaToMarkdown(ideas[0]) : ideasToMarkdown(ideas)
        navigator.clipboard.writeText(text).then(
          () => app.toast(ideas.length === 1 ? 'Markdown でコピーしました' : `${ideas.length} 案を Markdown でコピーしました`),
          () => app.toast('コピーできませんでした')
        )
      },
      exportFile: async (ideas) => {
        try {
          const result = await api.exportMarkdownFile(ideas.map((i) => i.id))
          if (result.saved) app.toast(`保存しました: ${result.fileName ?? ''}`)
        } catch (e) {
          console.error(e)
          app.toast('ファイルに保存できませんでした')
        }
      },
      remove: async (idea) => {
        const message = idea.saved ? `「${idea.title}」を削除しますか？元に戻せません。` : `履歴から「${idea.title}」を削除しますか？`
        if (!window.confirm(message)) return false
        const ok = await api.deleteIdea(idea.id)
        if (ok) ai.ideaRemoved(idea.id)
        return ok
      }
    }
  }, [app, ai])
}
