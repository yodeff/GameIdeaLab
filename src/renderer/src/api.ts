// renderer が使う API。Electron では preload が公開した window.gameIdeaLab を使う。
// それが無いとき（ブラウザで画面だけを開いたとき）は localStorage に保存する代わりの実装を使う。
// 代わりの実装は開発中の画面の確認と、将来の Web 版の足がかり（design/02 §9）。
import { parseHumanIdeaInput, type IdeaRecord } from '@core/idea'
import { DEFAULT_SETTINGS, parseSettingsPatch, readSetting, SETTING_KEYS, type Settings } from '@core/settings'
import { parseWorkspace } from '@core/workspace'
import type { GameIdeaLabApi } from '@shared/ipc'
import { addIdea, createBrowserIdeaApi } from './browserIdeas'
import { createMockAi, createUnavailableAi, mockAiEnabled } from './mockAi'

const KEY = { workspace: 'gil.workspace', settings: 'gil.settings' } as const

function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}

function readSettings(): Settings {
  const stored = readJson(KEY.settings)
  const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS }
  if (stored && typeof stored === 'object') {
    for (const key of SETTING_KEYS) {
      if (key in stored) settings[key] = readSetting(key, (stored as Record<string, unknown>)[key])
    }
  }
  return settings as Settings
}

function createBrowserApi(): GameIdeaLabApi {
  return {
    ...(mockAiEnabled ? createMockAi() : createUnavailableAi()),
    ...createBrowserIdeaApi(),
    getAppInfo: async () => ({ name: 'Game Idea Lab', version: 'browser', platform: 'browser', notice: null }),
    loadWorkspace: async () => parseWorkspace(readJson(KEY.workspace)),
    saveWorkspace: async (workspace) => {
      if (!parseWorkspace(workspace)) throw new Error('不正な入力: 作業状態')
      localStorage.setItem(KEY.workspace, JSON.stringify(workspace))
    },
    getSettings: async () => readSettings(),
    updateSettings: async (patch) => {
      const valid = parseSettingsPatch(patch)
      if (!valid) throw new Error('不正な入力: 設定')
      const next = { ...readSettings(), ...valid }
      localStorage.setItem(KEY.settings, JSON.stringify(next))
      return next
    },
    saveHumanIdea: async (value) => {
      const input = parseHumanIdeaInput(value)
      if (!input) throw new Error('不正な入力: アイデア')
      const now = new Date().toISOString()
      const record: IdeaRecord = {
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        source: 'human',
        saved: true,
        favorite: false,
        title: input.title,
        concept: '',
        combination: input.combination,
        bodyText: input.body,
        body: null,
        direction: null,
        memo: '',
        parentId: null,
        derivation: null,
        generationId: null,
        model: null,
        fidelity: null,
        drawContext: null
      }
      addIdea(record)
      return record
    }
  }
}

export const api: GameIdeaLabApi = window.gameIdeaLab ?? createBrowserApi()
export const isDesktop = window.gameIdeaLab !== undefined
