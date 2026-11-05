// 効果音（design/03 §2.7）。音は audio-studio（Stable Audio 3、手元で動かしたもの）で作り、
// 切り詰め・モノラル化・音量をそろえて Ogg にした（出どころは assets/sounds/README.md）。
// Electron は file:// で開くので fetch で読めない。音は JS に埋め込み（?inline）、Web Audio で復号する。
import completeData from '../assets/sounds/complete.ogg?inline'
import decideData from '../assets/sounds/decide.ogg?inline'
import fanfareData from '../assets/sounds/fanfare.ogg?inline'
import rollData from '../assets/sounds/roll.ogg?inline'
import stopData from '../assets/sounds/stop.ogg?inline'
import { createRollCues } from './rollCues'

type SoundName = 'roll' | 'stop' | 'decide' | 'fanfare' | 'complete'

const SOURCES: Record<SoundName, string> = {
  roll: rollData,
  stop: stopData,
  decide: decideData,
  fanfare: fanfareData,
  complete: completeData
}
/** 音ごとの釣り合い（回る音は長く鳴るので控えめに。ファンファーレは鐘より音が詰まっているので下げる） */
const LEVELS: Record<SoundName, number> = { roll: 0.45, stop: 0.8, decide: 0.8, fanfare: 0.5, complete: 0.75 }

const config = { enabled: true, volume: 0.6 }
let ctx: AudioContext | null = null
let master: GainNode | null = null
const buffers = new Map<SoundName, AudioBuffer>()
let loop: { source: AudioBufferSourceNode; gain: GainNode } | null = null
type Voice = { source: AudioBufferSourceNode; gain: GainNode }
/** 鳴っている「決定」の音。次の抽選が始まったら消す（連打で重ならないように） */
let decideVoices: Voice[] = []

function dataUrlToBytes(url: string): ArrayBuffer {
  const binary = atob(url.slice(url.indexOf(',') + 1))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

/** AudioContext を作り、音を復号しておく。1 回だけ */
function ensureContext(): AudioContext | null {
  if (ctx) return ctx
  if (typeof AudioContext === 'undefined') return null
  ctx = new AudioContext()
  master = ctx.createGain()
  master.gain.value = config.volume
  master.connect(ctx.destination)
  for (const [name, url] of Object.entries(SOURCES) as [SoundName, string][]) {
    ctx
      .decodeAudioData(dataUrlToBytes(url))
      .then((buffer) => buffers.set(name, buffer))
      .catch((e: unknown) => console.warn(`効果音 ${name} を読めませんでした`, e))
  }
  return ctx
}

/** 設定（効果音のオン・オフ、音量 0〜1）を反映する。オンなら音を先に読み込んでおく */
export function configureSound(enabled: boolean, volume: number): void {
  config.enabled = enabled
  config.volume = Math.min(1, Math.max(0, volume))
  if (master) master.gain.value = config.volume
  if (enabled) ensureContext()
  if (!enabled) stopLoop()
}

function output(): { ctx: AudioContext; master: GainNode } | null {
  if (!config.enabled || config.volume === 0) return null
  const c = ensureContext()
  if (!c || !master) return null
  if (c.state === 'suspended') void c.resume()
  return { ctx: c, master }
}

/** 1 回鳴らす。まだ読み込めていなければ鳴らさない */
function play(name: SoundName): Voice | null {
  const out = output()
  const buffer = buffers.get(name)
  if (!out || !buffer) return null
  const source = out.ctx.createBufferSource()
  const gain = out.ctx.createGain()
  source.buffer = buffer
  gain.gain.value = LEVELS[name]
  source.connect(gain).connect(out.master)
  source.start()
  return { source, gain }
}

/** 短く消して止める（プツッと切らない） */
function fadeOut({ source, gain }: Voice, seconds: number): void {
  if (!ctx) return
  const t = ctx.currentTime
  gain.gain.cancelScheduledValues(t)
  gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds)
  source.stop(t + seconds + 0.02)
}

/** 組み合わせが決まった: 当たりの鐘とファンファーレを重ねる */
function playDecide(): void {
  decideVoices = [play('decide'), play('fanfare')].filter((v): v is Voice => v !== null)
  for (const v of decideVoices) v.source.onended = () => (decideVoices = decideVoices.filter((x) => x !== v))
}

/** 回る音を流す。毎回違うところから始めて、同じ音の繰り返しに聞こえないようにする */
function startLoop(): void {
  const out = output()
  const buffer = buffers.get('roll')
  if (!out || !buffer || loop) return
  for (const v of decideVoices) fadeOut(v, 0.12)
  decideVoices = []
  const source = out.ctx.createBufferSource()
  const gain = out.ctx.createGain()
  source.buffer = buffer
  source.loop = true
  const t = out.ctx.currentTime
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(LEVELS.roll, t + 0.03)
  source.connect(gain).connect(out.master)
  source.start(t, Math.random() * buffer.duration)
  loop = { source, gain }
}

/** 回る音を止める */
function stopLoop(): void {
  if (!loop) return
  fadeOut(loop, 0.08)
  loop = null
}

export const sounds = {
  stop: () => void play('stop'),
  decide: playDecide,
  complete: () => void play('complete')
}

export const rollCues = createRollCues(
  { loopStart: startLoop, loopStop: stopLoop, stop: sounds.stop, decide: sounds.decide },
  {
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (t) => window.clearTimeout(t as number)
  }
)
