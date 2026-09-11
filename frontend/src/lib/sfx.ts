/** Short synthesized cues + haptic. No audio files — works offline. */

let audio: AudioContext | null = null

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? window.webkitAudioContext
  if (!Ctor) return null
  if (!audio) audio = new Ctor()
  if (audio.state === 'suspended') void audio.resume()
  return audio
}

export function armAudio() {
  const resume = () => {
    void context()?.resume()
    window.removeEventListener('pointerdown', resume)
  }
  window.addEventListener('pointerdown', resume, { once: true })
}

function beep(freq: number, duration: number, type: OscillatorType, gain: number, when = 0) {
  const ctx = context()
  if (!ctx) return
  const osc = ctx.createOscillator()
  const node = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, ctx.currentTime + when)
  node.gain.setValueAtTime(gain, ctx.currentTime + when)
  node.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + duration)
  osc.connect(node)
  node.connect(ctx.destination)
  osc.start(ctx.currentTime + when)
  osc.stop(ctx.currentTime + when + duration + 0.02)
}

export function haptic(pattern: number | number[] = 12) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* unsupported */
  }
}

export function playCorrect() {
  haptic(14)
  beep(523.25, 0.09, 'triangle', 0.07)
  beep(783.99, 0.14, 'triangle', 0.08, 0.07)
}

export function playWrong() {
  haptic([28, 40, 28])
  beep(196, 0.2, 'sawtooth', 0.045)
}

export function playFanfare() {
  haptic([12, 36, 12, 36, 20])
  beep(523.25, 0.1, 'triangle', 0.07)
  beep(659.25, 0.1, 'triangle', 0.07, 0.1)
  beep(783.99, 0.2, 'triangle', 0.09, 0.2)
}

export function playRankUp() {
  haptic([16, 28, 16, 28, 16])
  beep(392, 0.1, 'triangle', 0.06)
  beep(523.25, 0.1, 'triangle', 0.07, 0.08)
  beep(659.25, 0.1, 'triangle', 0.08, 0.16)
  beep(783.99, 0.22, 'triangle', 0.1, 0.26)
}
