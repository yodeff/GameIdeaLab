// プラン利用で初めてサインインしたときだけ出す（UI/UX ガイドライン。調査 §7）
import { useAi, useAiActions } from '../app/AiContext'

export function PlanNoticeModal() {
  const ai = useAi()
  const actions = useAiActions()
  if (!ai.planNoticeOpen) return null
  return (
    <div className="modal-backdrop">
      <div className="modal small" role="dialog" aria-modal="true" aria-labelledby="plan-notice-title">
        <h2 id="plan-notice-title">You're using your ChatGPT plan</h2>
        <p>
          B モードの生成には、あなたの ChatGPT プランの利用枠が使われます。Game Idea Lab が料金を請求することはありません。
          利用量は ChatGPT の設定（Manage usage）で確かめ、管理できます。
        </p>
        <div className="row end">
          <button type="button" className="ghost" onClick={actions.openManageUsage}>
            Manage usage
          </button>
          <button type="button" className="primary" onClick={actions.closePlanNotice} autoFocus>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
