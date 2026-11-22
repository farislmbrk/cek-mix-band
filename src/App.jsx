// DIY Studio & Stage Console by. Ares  v4.6  —  Vite + React + lucide-react + Web Audio API
import { useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, Upload, Scissors, Copy, Trash2, Repeat, Download, StickyNote, Mic, Link2, Music, Eye, EyeOff, Edit3, Check } from 'lucide-react'

/* ---------- Konstanta ---------- */
const THEMES = {
  midnight: { n: 'Midnight Blue', bg: '#0b1220', panel: '#121b2e', line: '#223152', text: '#e6ecf8', mute: '#8a99b8', acc: '#5aa2ff' },
  crimson: { n: 'Crimson Rock', bg: '#140a0b', panel: '#1e1214', line: '#3a2226', text: '#f6e9e9', mute: '#b39393', acc: '#ff4d4f' },
  emerald: { n: 'Emerald Studio', bg: '#08130f', panel: '#0f1d17', line: '#1f3a2e', text: '#e4f4ec', mute: '#86a898', acc: '#2fd08a' },
  bw: { n: 'B&W Mono', bg: '#0a0a0b', panel: '#141416', line: '#2a2a2e', text: '#f4f4f5', mute: '#9a9aa2', acc: '#ffffff' },
  amber: { n: 'Amber Tube', bg: '#140f08', panel: '#1f170d', line: '#3b2c19', text: '#f8efe2', mute: '#b89f7c', acc: '#f59e0b' },
  violet: { n: 'Neon Violet', bg: '#0e0a18', panel: '#171127', line: '#2d2247', text: '#efeaff', mute: '#9c8ec2', acc: '#a855f7' },
}
const BANDS = [['Sub', 20, 60], ['Bass', 60, 250], ['Low-Mid', 250, 2000], ['High-Mid', 2000, 6000], ['Treble', 6000, 16000]]
const PUNK_TARGET = [-3, 2, 0, 3, 1]
const DEVICES = {
  flat: { n: 'Studio Flat', hp: 10, lp: 20000, ls: 0 },
  phone: { n: 'Speaker HP', hp: 450, lp: 7500, ls: -4 },
  car: { n: 'Audio Mobil', hp: 30, lp: 12000, ls: 7 },
  live: { n: 'Sound Live', hp: 70, lp: 9000, ls: 3 },
}
const SOLO = { off: [10, 20000], low: [10, 250], mid: [250, 4000], high: [4000, 20000] }
const MATRIX = {
  stereo: [1, 0, 0, 1], mono: [.5, .5, .5, .5], side: [.5, -.5, .5, -.5],
}
const STEMS = {
  full: { n: 'Full Mix', mat: 'stereo', hp: 10, lp: 20000, pkF: 1000, pkG: 0, pkQ: 1 },
  vocal: { n: 'Vokal / Lead', mat: 'mono', hp: 220, lp: 6500, pkF: 2400, pkG: 4.5, pkQ: 0.9 },
  bass: { n: 'Bass / Sub', mat: 'mono', hp: 15, lp: 230, pkF: 85, pkG: 4.0, pkQ: 1.1 },
  drums: { n: 'Drums / Beat', mat: 'stereo', hp: 10, lp: 20000, pkF: 4500, pkG: 5.5, pkQ: 0.7 },
  guitar: { n: 'Gitar / Side', mat: 'side', hp: 180, lp: 9500, pkF: 1800, pkG: 3.5, pkQ: 0.9 },
  karaoke: { n: 'Instrumen (Minus Vocal)', mat: 'side', hp: 10, lp: 20000, pkF: 1400, pkG: -4.0, pkQ: 1.2 },
}
const CHECKS = [
  'Master sudah dicek di speaker HP, earphone, dan speaker studio',
  'Level puncak tidak clipping (di bawah -1 dBTP)',
  'Loudness mendekati -14 LUFS (acuan streaming)',
  'Cek mono compatibility (korelasi tidak mendekati -1)',
  'Intro & outro bersih, tanpa klik atau noise',
  'Metadata siap: judul, artis, ISRC, tahun rilis',
  'Cover art 3000×3000 px, format JPG/PNG',
  'Lirik & kredit penulis lagu sudah final',
]

const EQ_DEFAULT = [
  { f: 80, g: 0, q: 0.7, type: 'lowshelf' }, { f: 250, g: 0, q: 1, type: 'peaking' }, { f: 800, g: 0, q: 1, type: 'peaking' },
  { f: 2500, g: 0, q: 1, type: 'peaking' }, { f: 6000, g: 0, q: 1, type: 'peaking' }, { f: 12000, g: 0, q: 0.7, type: 'highshelf' },
]
const EQ_PRESETS = {
  flat: ['Flat', [0, 0, 0, 0, 0, 0]],
  punk: ['Punk Boost', [2, 1, -2, 3, 2, 1]],
  rock: ['Rock Mix', [4.5, -2, 1.5, 3.5, 4, 3]],
  vocal: ['Vokal Jernih', [-2, -1, -2, 3.5, 2.5, 1]],
  bass: ['Bass Penuh', [5.5, 3, 0, -1, 0, 0]],
  smile: ['Smile', [4, 1, -2, -1, 2, 4]],
}
const FMIN = 20, FMAX = 20000, GR = 12
const fmtHz = f => (f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 0 : 1)} kHz` : `${Math.round(f)} Hz`)
const fx = f => Math.log(f / FMIN) / Math.log(FMAX / FMIN)

let respCtx
function eqResponse(bands, n = 140) {
  if (!respCtx) respCtx = new OfflineAudioContext(1, 1, 48000)
  const freqs = new Float32Array(n).map((_, i) => FMIN * Math.pow(FMAX / FMIN, i / (n - 1))), tot = new Float32Array(n)
  bands.forEach((b, i) => {
    const f = respCtx.createBiquadFilter(), m = new Float32Array(n), p = new Float32Array(n)
    f.type = EQ_DEFAULT[i].type; f.frequency.value = b.f; f.gain.value = b.g; f.Q.value = b.q
    f.getFrequencyResponse(freqs, m, p); m.forEach((v, k) => { tot[k] += 20 * Math.log10(v) })
  })
  return { freqs, tot }
}

/* ---------- Utilitas ---------- */
const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const db = x => (x > 1e-6 ? 20 * Math.log10(x) : -120)

const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const TUNING_INSTRUMENTS = {
  guitar: {
    name: 'Gitar (6 Senar)',
    minHz: 65,
    maxHz: 1100,
    notes: [
      { label: 'E2 (6)', note: 'E', octave: 2, freq: 82.41 },
      { label: 'A2 (5)', note: 'A', octave: 2, freq: 110.00 },
      { label: 'D3 (4)', note: 'D', octave: 3, freq: 146.83 },
      { label: 'G3 (3)', note: 'G', octave: 3, freq: 196.00 },
      { label: 'B3 (2)', note: 'B', octave: 3, freq: 246.94 },
      { label: 'E4 (1)', note: 'E', octave: 4, freq: 329.63 },
    ],
  },
  bass: {
    name: 'Bass (4 Senar)',
    minHz: 32,
    maxHz: 520,
    notes: [
      { label: 'E1 (4)', note: 'E', octave: 1, freq: 41.20 },
      { label: 'A1 (3)', note: 'A', octave: 1, freq: 55.00 },
      { label: 'D2 (2)', note: 'D', octave: 2, freq: 73.42 },
      { label: 'G2 (1)', note: 'G', octave: 2, freq: 98.00 },
    ],
  },
  ukulele: {
    name: 'Ukulele (GCEA)',
    minHz: 180,
    maxHz: 1200,
    notes: [
      { label: 'G4 (4)', note: 'G', octave: 4, freq: 392.00 },
      { label: 'C4 (3)', note: 'C', octave: 4, freq: 261.63 },
      { label: 'E4 (2)', note: 'E', octave: 4, freq: 329.63 },
      { label: 'A4 (1)', note: 'A', octave: 4, freq: 440.00 },
    ],
  },
  violin: {
    name: 'Biola / Violin',
    minHz: 175,
    maxHz: 1800,
    notes: [
      { label: 'G3', note: 'G', octave: 3, freq: 196.00 },
      { label: 'D4', note: 'D', octave: 4, freq: 293.66 },
      { label: 'A4', note: 'A', octave: 4, freq: 440.00 },
      { label: 'E5', note: 'E', octave: 5, freq: 659.25 },
    ],
  },
  chromatic: {
    name: 'Kromatik / Vokal',
    minHz: 55,
    maxHz: 2000,
    notes: [
      { label: 'C3', note: 'C', octave: 3, freq: 130.81 },
      { label: 'E3', note: 'E', octave: 3, freq: 164.81 },
      { label: 'G3', note: 'G', octave: 3, freq: 196.00 },
      { label: 'A3', note: 'A', octave: 3, freq: 220.00 },
      { label: 'C4', note: 'C', octave: 4, freq: 261.63 },
      { label: 'A4', note: 'A', octave: 4, freq: 440.00 },
    ],
  },
}

// YIN + parabolic interpolation pitch detector untuk akurasi frekuensi lebih tinggi
function detectPitchAccurate(buf, sr, a4Ref = 440, minHz = 40, maxHz = 1600) {
  let rms = 0
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i]
  rms = Math.sqrt(rms / buf.length)
  if (rms < 0.009) return null

  let mean = 0
  for (let i = 0; i < buf.length; i++) mean += buf[i]
  mean /= buf.length

  const n = buf.length
  const x = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1))
    x[i] = (buf[i] - mean) * w
  }

  const maxTau = Math.min(Math.floor(n / 2), Math.max(4, Math.ceil(sr / Math.max(25, minHz))))
  const minTau = Math.max(2, Math.floor(sr / Math.min(sr / 3, maxHz)))
  if (maxTau <= minTau + 2) return null

  // Difference function d(tau)
  const diff = new Float64Array(maxTau + 1)
  for (let tau = 1; tau <= maxTau; tau++) {
    let s = 0
    for (let j = 0; j < n - tau; j++) {
      const d = x[j] - x[j + tau]
      s += d * d
    }
    diff[tau] = s
  }

  // Cumulative mean normalized difference d'(tau)
  const cmnd = new Float64Array(maxTau + 1)
  cmnd[0] = 1
  let runningSum = 0
  for (let tau = 1; tau <= maxTau; tau++) {
    runningSum += diff[tau]
    cmnd[tau] = runningSum > 1e-12 ? (diff[tau] * tau) / runningSum : 1
  }

  // Cari lembah pertama di bawah threshold (0.14) atau lembah global terbaik
  const threshold = 0.14
  let tauEstimate = -1
  for (let tau = minTau; tau < maxTau; tau++) {
    if (cmnd[tau] < threshold) {
      while (tau + 1 < maxTau && cmnd[tau + 1] < cmnd[tau]) tau++
      tauEstimate = tau
      break
    }
  }

  if (tauEstimate === -1) {
    let bestVal = Infinity
    for (let tau = minTau; tau < maxTau; tau++) {
      if (cmnd[tau] < bestVal) {
        bestVal = cmnd[tau]
        tauEstimate = tau
      }
    }
    if (bestVal > 0.45 || tauEstimate < minTau) return null
  }

  // Parabolic interpolation di sekitar tauEstimate untuk presisi sub-cent
  let betterTau = tauEstimate
  if (tauEstimate > minTau && tauEstimate < maxTau - 1) {
    const s0 = cmnd[tauEstimate - 1]
    const s1 = cmnd[tauEstimate]
    const s2 = cmnd[tauEstimate + 1]
    const denom = 2 * (s0 - 2 * s1 + s2)
    if (Math.abs(denom) > 1e-12) {
      const delta = (s0 - s2) / denom
      if (Math.abs(delta) <= 1) betterTau = tauEstimate + delta
    }
  }

  const freq = sr / betterTau
  if (!Number.isFinite(freq) || freq < minHz || freq > maxHz) return null

  const midiFloat = 69 + 12 * Math.log2(freq / a4Ref)
  const midiNearest = Math.round(midiFloat)
  const cents = Math.round((midiFloat - midiNearest) * 100)
  const noteIdx = ((midiNearest % 12) + 12) % 12
  const octave = Math.floor(midiNearest / 12) - 1

  return {
    freq,
    note: NOTE_NAMES_SHARP[noteIdx],
    octave,
    cents: Math.max(-50, Math.min(50, cents)),
    clarity: Math.max(0, Math.min(1, 1 - cmnd[tauEstimate])),
  }
}

function detectBpm(buf) {
  const sr = buf.sampleRate, d = buf.getChannelData(0)
  const n = Math.min(d.length, sr * 60), hop = Math.round(sr / 400), fs = sr / hop
  const env = []
  for (let i = 0; i + hop <= n; i += hop) { let s = 0; for (let j = 0; j < hop; j += 2) s += d[i + j] * d[i + j]; env.push(Math.sqrt(s)) }
  const on = env.map((v, i) => Math.max(0, v - (env[i - 1] || 0)))
  let best = 0, bestLag = 0
  for (let lag = Math.floor(fs * 60 / 200); lag <= Math.ceil(fs * 60 / 60); lag++) {
    let s = 0
    for (let i = 0; i + lag < on.length; i++) s += on[i] * on[i + lag]
    s /= on.length - lag
    if (s > best) { best = s; bestLag = lag }
  }
  if (!bestLag) return null
  let bpm = 60 * fs / bestLag
  while (bpm < 80) bpm *= 2
  while (bpm > 190) bpm /= 2
  return Math.round(bpm)
}

function estimateLufs(buf) {
  const d = buf.getChannelData(0); let s = 0, c = 0
  for (let i = 0; i < d.length; i += 4) { s += d[i] * d[i]; c++ }
  return db(Math.sqrt(s / c)) - 0.7
}

function waveformPeaks(buf, N = 600) {
  const d = buf.getChannelData(0), bk = Math.floor(d.length / N), p = []
  for (let i = 0; i < N; i++) { let m = 0; for (let j = i * bk; j < (i + 1) * bk; j += 8) m = Math.max(m, Math.abs(d[j])); p.push(m) }
  return p
}

function encodeWav(chs, sr) {
  const len = chs[0].length, nc = chs.length, buf = new ArrayBuffer(44 + len * nc * 2), v = new DataView(buf)
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  w(0, 'RIFF'); v.setUint32(4, 36 + len * nc * 2, true); w(8, 'WAVEfmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true)
  v.setUint32(24, sr, true); v.setUint32(28, sr * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true)
  w(36, 'data'); v.setUint32(40, len * nc * 2, true)
  let o = 44
  for (let i = 0; i < len; i++) for (let c = 0; c < nc; c++) { const x = Math.max(-1, Math.min(1, chs[c][i])); v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true); o += 2 }
  return new Blob([buf], { type: 'audio/wav' })
}

function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

/* ---------- Kunci, chord, nashville/roman, voicing & pitch shifter ---------- */
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const ROMAN_MAJ = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII']
const ROMAN_MIN = ['i', 'bII', 'ii', 'III', 'III#', 'iv', 'v', 'V', 'VI', 'bVII', 'vii', 'VII']
const KP = {
  maj: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
  min: [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
}
const mod12 = n => ((n % 12) + 12) % 12
const keyName = (k, t = 0) => `${NOTES[mod12(k.root + t)]} ${k.mode === 'maj' ? 'mayor' : 'minor'}`
const relKey = k => ({ root: k.mode === 'maj' ? (k.root + 9) % 12 : (k.root + 3) % 12, mode: k.mode === 'maj' ? 'min' : 'maj' })
const parseChord = name => {
  const m = (name || '').match(/^([A-G]#?)(.*)$/)
  return m ? { rootNote: m[1], suffix: m[2] || '' } : { rootNote: 'C', suffix: '' }
}
const tChord = (name, t) => {
  const { rootNote, suffix } = parseChord(name)
  const idx = NOTES.indexOf(rootNote)
  return idx >= 0 ? NOTES[mod12(idx + t)] + suffix : name
}
function chordToRoman(chordName, keyObj, transpose = 0) {
  if (!keyObj) return '—'
  const { rootNote, suffix } = parseChord(tChord(chordName, transpose))
  const rIdx = NOTES.indexOf(rootNote)
  if (rIdx < 0) return '—'
  const tonic = mod12(keyObj.root + transpose)
  const deg = mod12(rIdx - tonic)
  const isMinorChord = /^m(?![a-z])|^dim|^m7b5/i.test(suffix)
  const baseNum = keyObj.mode === 'min' ? ROMAN_MIN[deg] : ROMAN_MAJ[deg]
  const num = isMinorChord ? baseNum.toLowerCase() : baseNum.toUpperCase()
  const qual = suffix.replace(/^m(?![a-z])/, '')
  return num + qual
}
function getVoicingHint(chordName, transpose = 0) {
  const full = tChord(chordName, transpose)
  const { rootNote, suffix } = parseChord(full)
  const rIdx = NOTES.indexOf(rootNote)
  const fifthNote = rIdx >= 0 ? NOTES[mod12(rIdx + 7)] : 'G'
  const thirdNote = rIdx >= 0 ? NOTES[mod12(rIdx + (/^m(?!aj)/.test(suffix) ? 3 : 4))] : 'E'
  const capo = mod12(-transpose)
  const openRoot = capo > 0 ? NOTES[mod12(rIdx - capo)] + suffix : null
  return {
    full,
    slash: `${full}/${fifthNote}`,
    thirdSlash: `${full}/${thirdNote}`,
    capoHint: capo > 0 && capo <= 7 ? `Capo fret ${capo} ≈ ${openRoot}` : 'Tanpa capo / shape standar',
  }
}

const PITCH_JS = `
class PitchShift extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'ratio', defaultValue: 1, minValue: 0.5, maxValue: 2 }] }
  constructor() { super(); this.W = 3072; this.N = 16384; this.buf = [new Float32Array(this.N), new Float32Array(this.N)]; this.w = 0; this.ph = 0 }
  rd(c, p) {
    const N = this.N, B = this.buf[c], pos = this.w - p * this.W, i = Math.floor(pos), f = pos - i
    const a = B[((i % N) + N) % N], b = B[(((i + 1) % N) + N) % N]
    return a + (b - a) * f
  }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0], r = params.ratio[0]
    if (!inp.length) return true
    for (let n = 0; n < out[0].length; n++) {
      for (let c = 0; c < out.length; c++) this.buf[c][this.w] = (inp[c] || inp[0])[n]
      const p1 = this.ph, p2 = (this.ph + 0.5) % 1
      const w1 = 0.5 - 0.5 * Math.cos(2 * Math.PI * p1), w2 = 0.5 - 0.5 * Math.cos(2 * Math.PI * p2)
      for (let c = 0; c < out.length; c++) out[c][n] = w1 * this.rd(c, p1) + w2 * this.rd(c, p2)
      this.ph += (1 - r) / this.W
      this.ph -= Math.floor(this.ph)
      this.w = (this.w + 1) % this.N
    }
    return true
  }
}
registerProcessor('pitch-shift', PitchShift)
`
async function attachPitch(e) {
  const url = URL.createObjectURL(new Blob([PITCH_JS], { type: 'application/javascript' }))
  await e.ctx.audioWorklet.addModule(url); URL.revokeObjectURL(url)
  const n = new AudioWorkletNode(e.ctx, 'pitch-shift', { outputChannelCount: [2] })
  e.pre.connect(n); n.connect(e.shifted); e.pitch = n
}

function fft(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < h; k++) {
        const a = i + k, b = a + h, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t
      }
    }
  }
}

const pearson = (a, b) => {
  const n = a.length, ma = a.reduce((x, y) => x + y) / n, mb = b.reduce((x, y) => x + y) / n
  let s = 0, da = 0, dbb = 0
  for (let i = 0; i < n; i++) { s += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; dbb += (b[i] - mb) ** 2 }
  return s / Math.sqrt(da * dbb || 1)
}

const CHORD_SPECS_BASIC = [
  { suffix: '', iv: [0, 4, 7], w: [1.0, 0.85, 0.92] },
  { suffix: 'm', iv: [0, 3, 7], w: [1.0, 0.85, 0.92] },
  { suffix: '7', iv: [0, 4, 7, 10], w: [1.0, 0.8, 0.85, 0.72] },
  { suffix: 'maj7', iv: [0, 4, 7, 11], w: [1.0, 0.8, 0.85, 0.72] },
  { suffix: 'm7', iv: [0, 3, 7, 10], w: [1.0, 0.8, 0.85, 0.72] },
  { suffix: 'sus4', iv: [0, 5, 7], w: [1.0, 0.82, 0.9] },
  { suffix: 'dim', iv: [0, 3, 6], w: [1.0, 0.82, 0.82] },
]

const CHORD_SPECS_EXT = [
  ...CHORD_SPECS_BASIC,
  { suffix: 'sus2', iv: [0, 2, 7], w: [1.0, 0.82, 0.9] },
  { suffix: '7sus4', iv: [0, 5, 7, 10], w: [1.0, 0.78, 0.85, 0.7] },
  { suffix: 'add9', iv: [0, 4, 7, 2], w: [1.0, 0.8, 0.85, 0.68] },
  { suffix: 'm(add9)', iv: [0, 3, 7, 2], w: [1.0, 0.8, 0.85, 0.68] },
  { suffix: '6', iv: [0, 4, 7, 9], w: [1.0, 0.78, 0.84, 0.66] },
  { suffix: 'm6', iv: [0, 3, 7, 9], w: [1.0, 0.78, 0.84, 0.66] },
  { suffix: '9', iv: [0, 4, 7, 10, 2], w: [1.0, 0.75, 0.8, 0.65, 0.62] },
  { suffix: 'maj9', iv: [0, 4, 7, 11, 2], w: [1.0, 0.75, 0.8, 0.65, 0.62] },
  { suffix: 'm9', iv: [0, 3, 7, 10, 2], w: [1.0, 0.75, 0.8, 0.65, 0.62] },
  { suffix: 'dim7', iv: [0, 3, 6, 9], w: [1.0, 0.78, 0.78, 0.7] },
  { suffix: 'm7b5', iv: [0, 3, 6, 10], w: [1.0, 0.78, 0.78, 0.7] },
  { suffix: 'aug', iv: [0, 4, 8], w: [1.0, 0.84, 0.84] },
]

function buildTemplates(specs) {
  return specs.flatMap(sp => NOTES.map((_, r) => {
    const t = new Array(12).fill(0)
    sp.iv.forEach((x, j) => { t[(r + x) % 12] = sp.w[j] })
    const penalty = sp.iv.length > 3 ? (sp.iv.length - 3) * 0.032 : 0
    return { name: NOTES[r] + sp.suffix, root: r, fifth: (r + 7) % 12, t, n: Math.hypot(...t), penalty }
  }))
}

const TPL_BASIC = buildTemplates(CHORD_SPECS_BASIC)
const TPL_EXT = buildTemplates(CHORD_SPECS_EXT)

function analyzeHarmony(buf, chordMode = 'extended') {
  const D = 4, sr = buf.sampleRate / D, N = 8192, hop = 4096
  const c0 = buf.getChannelData(0), c1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : c0
  const len = Math.floor(c0.length / D), mono = new Float32Array(len)
  for (let i = 0; i < len; i++) { let s = 0; for (let k = 0; k < D; k++) s += c0[i * D + k] + c1[i * D + k]; mono[i] = s / (2 * D) }

  const lo = Math.ceil(65 * N / sr), hi = Math.floor(2200 * N / sr)
  const bassHi = Math.floor(240 * N / sr)
  const win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N))
  const re = new Float64Array(N), im = new Float64Array(N), total = new Array(12).fill(0), rawFrames = []

  for (let s = 0; s + N <= len; s += hop) {
    for (let i = 0; i < N; i++) { re[i] = mono[s + i] * win[i]; im[i] = 0 }
    fft(re, im)

    const ch = new Array(12).fill(0)
    const bassCh = new Array(12).fill(0)
    let e = 0

    for (let k = lo; k <= hi; k++) {
      const mag = Math.hypot(re[k], im[k])
      if (mag < 1e-4) continue
      const freq = (k * sr) / N
      const midi = 12 * Math.log2(freq / 440) + 69
      const pc = mod12(Math.round(midi))
      const fWeight = freq < 320 ? 1.35 : freq < 850 ? 1.0 : 0.62
      const val = Math.pow(mag, 0.65) * fWeight
      ch[pc] += val
      e += val
      if (k <= bassHi) bassCh[pc] += val * 1.5
    }

    if (e < 0.5) { rawFrames.push(null); continue }
    const norm = ch.map(v => v / e)
    norm.forEach((v, i) => { total[i] += v })

    let bassPc = 0
    for (let i = 1; i < 12; i++) if (bassCh[i] > bassCh[bassPc]) bassPc = i

    rawFrames.push({ t: Math.max(0, (s + N / 2) / sr - 0.19), ch: norm, bassPc })
  }

  const frames = rawFrames.map((f, idx) => {
    if (!f) return null
    const prev = rawFrames[idx - 1]?.ch || f.ch
    const next = rawFrames[idx + 1]?.ch || f.ch
    const smCh = f.ch.map((v, pc) => 0.25 * prev[pc] + 0.5 * v + 0.25 * next[pc])
    return { ...f, ch: smCh }
  })

  let key = { root: 0, mode: 'maj', conf: 'rendah' }, bestR = -2
  if (frames.some(Boolean)) {
    for (const mode of ['maj', 'min']) for (let r = 0; r < 12; r++) {
      const c = pearson(total, total.map((_, i) => KP[mode][mod12(i - r)]))
      if (c > bestR) { bestR = c; key = { root: r, mode } }
    }
    key.conf = bestR > 0.75 ? 'tinggi' : bestR > 0.6 ? 'sedang' : 'rendah'
  }

  const tplList = chordMode === 'basic' ? TPL_BASIC : TPL_EXT
  const lab = frames.map(f => {
    if (!f) return -1
    let best = -1, bs = -Infinity
    const cn = Math.hypot(...f.ch) || 1
    tplList.forEach((c, i) => {
      let d = 0
      for (let k = 0; k < 12; k++) d += f.ch[k] * c.t[k]
      const bassBoost = f.bassPc === c.root ? 0.11 : f.bassPc === c.fifth ? 0.04 : 0
      const score = (d / (cn * c.n)) + bassBoost - c.penalty
      if (score > bs) { bs = score; best = i }
    })
    return best
  })

  const sm = lab.map((l, i) => (i && i < lab.length - 1 && lab[i - 1] === lab[i + 1] ? lab[i - 1] : l))
  const runs = []
  sm.forEach((l, i) => {
    const last = runs[runs.length - 1]
    if (last && last.l === l) last.n++
    else runs.push({ l, n: 1, t: frames[i]?.t ?? 0 })
  })
  const chords = []
  runs.filter(r => r.l >= 0 && (r.n >= 2 || runs.length === 1)).forEach(r => {
    const name = tplList[r.l].name
    if (!chords.length || chords[chords.length - 1].name !== name) chords.push({ t: r.t, name })
  })
  return { key, chords }
}

/* ---------- Audio engine ---------- */
function createEngine() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' })
  const bq = (type, f, q = 0.707) => { const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x }
  const mkEq = () => { const c = EQ_DEFAULT.map(b => bq(b.type, b.f, b.q)); c.forEach((n, i) => { if (i) c[i - 1].connect(n) }); return c }
  const eqA = mkEq(), eqB = mkEq()
  const gA = ctx.createGain(), gB = ctx.createGain(), bus = ctx.createGain()
  eqA[5].connect(gA); eqB[5].connect(gB)
  const pre = ctx.createGain(), direct = ctx.createGain(), shifted = ctx.createGain()
  shifted.gain.value = 0
  gA.connect(pre); gB.connect(pre); pre.connect(direct); direct.connect(bus); shifted.connect(bus)

  const sp = ctx.createChannelSplitter(2), anL = ctx.createAnalyser(), anR = ctx.createAnalyser()
  anL.fftSize = anR.fftSize = 2048
  bus.connect(sp); sp.connect(anL, 0); sp.connect(anR, 1)

  const sp2 = ctx.createChannelSplitter(2), mg = ctx.createChannelMerger(2), mx = []
  bus.connect(sp2)
  for (let o = 0; o < 2; o++) for (let i = 0; i < 2; i++) { const g = ctx.createGain(); sp2.connect(g, i); g.connect(mg, 0, o); mx.push(g) }

  const stHp = bq('highpass', 10), stLp = bq('lowpass', 20000), stPk = bq('peaking', 1000, 1)
  const sHp = bq('highpass', 10), sLp = bq('lowpass', 20000), dHp = bq('highpass', 10), dLp = bq('lowpass', 20000), dLs = bq('lowshelf', 120)
  const an = ctx.createAnalyser(); an.fftSize = 4096; an.smoothingTimeConstant = 0.8
  const master = ctx.createGain()
  mg.connect(stHp); stHp.connect(stLp); stLp.connect(stPk); stPk.connect(sHp)
  sHp.connect(sLp); sLp.connect(dHp); dHp.connect(dLp); dLp.connect(dLs); dLs.connect(an); an.connect(master)

  const outVol = ctx.createGain(), limDirect = ctx.createGain(), limComp = ctx.createGain(), comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -6; comp.knee.value = 0; comp.ratio.value = 20; comp.attack.value = 0.002; comp.release.value = 0.15
  limDirect.gain.value = 0
  master.connect(outVol); outVol.connect(limDirect); limDirect.connect(ctx.destination)
  outVol.connect(comp); comp.connect(limComp); limComp.connect(ctx.destination)

  const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0)
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1
  const ns = ctx.createBufferSource(); ns.buffer = nb; ns.loop = true
  const nFilter = bq('bandpass', 1400, 0.35), nGain = ctx.createGain(), lfo = ctx.createOscillator(), lfoG = ctx.createGain()
  nGain.gain.value = 0; lfo.frequency.value = 0.25
  ns.connect(nFilter); nFilter.connect(nGain); nGain.connect(ctx.destination)
  lfo.connect(lfoG); lfoG.connect(nGain.gain); ns.start(); lfo.start()

  master.gain.value = 1
  return { ctx, pre, direct, shifted, outVol, limDirect, limComp, eqA, eqB, gA, gB, master, mx, anL, anR, an, stHp, stLp, stPk, sHp, sLp, dHp, dLp, dLs, nFilter, nGain, lfoG }
}

/* ---------- Komponen kecil ---------- */
const Card = ({ title, children, wide }) => (
  <section className={`card${wide ? ' wide' : ''}`}><h2>{title}</h2>{children}</section>
)
const Slider = ({ label, value, onChange, min = 0, max = 1, step = 0.01, show, disabled }) => (
  <label className="sl"><span>{label}</span>
    <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={e => onChange(+e.target.value)}
      style={{ '--p': `${((value - min) / (max - min)) * 100}%` }} />
    <b>{show ?? value}</b></label>
)
const Seg = ({ value, options, onChange }) => (
  <div className="seg">{options.map(([k, l]) => <button key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}</div>
)

const BAND_COLORS = ['#60a5fa', '#38bdf8', '#34d399', '#fbbf24', '#fb7185', '#c084fc']

function smoothSplinePath(pts) {
  if (!pts.length) return ''
  if (pts.length === 1) return `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? i : i - 1]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1]
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}

function EqPanel({ bands, setBands, eqOn, setEqOn, scope, setScope, sel, setSel, flash, specCurve }) {
  const W = 780, H = 312
  const svg = useRef(null), drag = useRef(null)
  const [hoverIdx, setHoverIdx] = useState(null)
  const [showIndiv, setShowIndiv] = useState(true)
  const [showSpec, setShowSpec] = useState(true)
  const [hoverProbe, setHoverProbe] = useState(null)

  const X = f => fx(f) * W
  const Y = g => H / 2 - (g / GR) * (H / 2 - 16)
  const upd = (i, p) => setBands(b => b.map((x, j) => (j === i ? { ...x, ...p } : x)))

  const { freqs, tot, indiv } = useMemo(() => {
    const base = eqResponse(bands, 220)
    if (!respCtx) respCtx = new OfflineAudioContext(1, 1, 48000)
    const perBand = bands.map((b, i) => {
      const f = respCtx.createBiquadFilter(), m = new Float32Array(base.freqs.length), p = new Float32Array(base.freqs.length)
      f.type = EQ_DEFAULT[i].type; f.frequency.value = b.f; f.gain.value = b.g; f.Q.value = b.q
      f.getFrequencyResponse(base.freqs, m, p)
      return Array.from(m, v => 20 * Math.log10(v))
    })
    return { ...base, indiv: perBand }
  }, [bands])

  const buildSmoothCurve = arr => {
    const pts = Array.from(freqs, (f, k) => [
      X(f),
      Y(Math.max(-GR, Math.min(GR, arr[k]))),
    ])
    return smoothSplinePath(pts)
  }

  const line = useMemo(() => buildSmoothCurve(tot), [tot, freqs]) // eslint-disable-line react-hooks/exhaustive-deps
  const indivLines = useMemo(() => indiv.map(arr => buildSmoothCurve(arr)), [indiv, freqs]) // eslint-disable-line react-hooks/exhaustive-deps

  const { specArea, specTopLine } = useMemo(() => {
    if (!showSpec || !specCurve || !specCurve.length) return { specArea: '', specTopLine: '' }
    const pts = specCurve.map((val, idx) => [
      (idx / (specCurve.length - 1)) * W,
      H - 20 - Math.max(0, Math.min(1, val)) * (H - 42),
    ])
    const spline = smoothSplinePath(pts)
    return {
      specTopLine: spline,
      specArea: `${spline} L${W},${H - 20} L0,${H - 20} Z`,
    }
  }, [specCurve, showSpec])

  const clientToEq = e => {
    const r = svg.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
    const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))
    const freq = Math.round(FMIN * Math.pow(FMAX / FMIN, x))
    const gain = Math.max(-GR, Math.min(GR, Math.round((GR - y * 2 * GR) * 2) / 2))
    return { x, y, freq, gain, px: x * W, py: y * H }
  }

  const move = e => {
    const pt = clientToEq(e)
    if (drag.current != null) {
      upd(drag.current, { f: pt.freq, g: pt.gain })
      setHoverProbe({ freq: pt.freq, gain: pt.gain, x: pt.px, y: pt.py })
    } else {
      setHoverProbe({ freq: pt.freq, gain: pt.gain, x: pt.px, y: pt.py })
    }
  }

  const key = (e, i) => {
    const b = bands[i], k = e.key
    if (k === 'ArrowUp') upd(i, { g: Math.min(GR, b.g + 0.5) })
    else if (k === 'ArrowDown') upd(i, { g: Math.max(-GR, b.g - 0.5) })
    else if (k === 'ArrowLeft') upd(i, { f: Math.max(FMIN, Math.round(b.f / 1.05)) })
    else if (k === 'ArrowRight') upd(i, { f: Math.min(FMAX, Math.round(b.f * 1.05)) })
    else return
    e.preventDefault()
  }
  const saveMine = () => { try { localStorage.setItem('cmb-eq', JSON.stringify(bands)); flash('Preset EQ disimpan') } catch { flash('Gagal menyimpan') } }
  const loadMine = () => {
    try {
      const b = JSON.parse(localStorage.getItem('cmb-eq'))
      if (!Array.isArray(b) || b.length !== 6) throw 0
      setBands(EQ_DEFAULT.map((d, i) => ({ ...d, f: +b[i].f || d.f, g: +b[i].g || 0, q: +b[i].q || d.q }))); flash('Preset EQ dimuat')
    } catch { flash('Belum ada preset tersimpan') }
  }

  const activeBandIdx = hoverIdx ?? sel
  const activeBand = bands[activeBandIdx]

  return (<>
    <div className="eq-toolbar">
      <div className="row">
        <button className={eqOn ? 'on' : ''} onClick={() => setEqOn(!eqOn)}>{eqOn ? 'EQ ON' : 'EQ OFF'}</button>
        <small>Terapkan ke</small>
        <Seg value={scope} onChange={setScope} options={[['A', 'Track A'], ['B', 'Track B'], ['AB', 'Keduanya']]} />
      </div>
      <div className="row">
        <button className={showIndiv ? 'on' : ''} onClick={() => setShowIndiv(v => !v)}>Kurva Per-Band</button>
        <button className={showSpec ? 'on' : ''} onClick={() => setShowSpec(v => !v)}>RTA Spektrum</button>
      </div>
    </div>

    <div className="eq-stage">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className={`eqg${eqOn ? '' : ' off'}`}
        onPointerMove={move}
        onPointerLeave={() => { if (drag.current == null) setHoverProbe(null) }}
        onPointerUp={() => { drag.current = null }}
        onPointerCancel={() => { drag.current = null }}
      >
        <defs>
          <linearGradient id="eqSpecGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--acc)" stopOpacity="0.34" />
            <stop offset="55%" stopColor="var(--acc)" stopOpacity="0.09" />
            <stop offset="100%" stopColor="var(--acc)" stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id="eqCurveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="28%" stopColor="var(--acc)" />
            <stop offset="62%" stopColor="#34d399" />
            <stop offset="85%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#fb7185" />
          </linearGradient>
          <linearGradient id="eqFillGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--acc)" stopOpacity="0.36" />
            <stop offset="50%" stopColor="var(--acc)" stopOpacity="0.11" />
            <stop offset="100%" stopColor="var(--acc)" stopOpacity="0.01" />
          </linearGradient>
          <filter id="eqGlow" x="-15%" y="-25%" width="130%" height="150%">
            <feGaussianBlur stdDeviation="3.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {showSpec && specArea && (
          <>
            <path d={specArea} fill="url(#eqSpecGrad)" />
            <path d={specTopLine} fill="none" stroke="color-mix(in srgb,var(--acc) 55%,transparent)" strokeWidth="1.5" strokeLinecap="round" />
          </>
        )}

        {[50, 100, 200, 500, 1000, 2000, 5000, 10000].map(f => (
          <g key={f}>
            <line x1={X(f)} x2={X(f)} y1="14" y2={H - 20} className="gl" />
            <text x={X(f)} y={H - 5} textAnchor="middle" className="gt">{f >= 1000 ? f / 1000 + 'k' : f}</text>
          </g>
        ))}

        {[-12, -6, 0, 6, 12].map(g => (
          <g key={g}>
            <line x1="32" x2={W - 10} y1={Y(g)} y2={Y(g)} className={g === 0 ? 'gl z' : 'gl'} />
            <text x="8" y={Y(g) + 3.5} className="gt">{g > 0 ? '+' + g : g}</text>
          </g>
        ))}

        {hoverProbe && drag.current == null && (
          <g className="probe" pointerEvents="none">
            <line x1={hoverProbe.x} x2={hoverProbe.x} y1="14" y2={H - 20} stroke="color-mix(in srgb,var(--text) 24%,transparent)" strokeDasharray="3 3" />
            <circle cx={hoverProbe.x} cy={hoverProbe.y} r="3.5" fill="var(--acc)" opacity="0.7" />
          </g>
        )}

        {showIndiv && bands.map((b, i) => {
          const isFocus = sel === i || hoverIdx === i
          return (
            <path
              key={`ind-${i}`}
              d={indivLines[i]}
              fill="none"
              stroke={BAND_COLORS[i % BAND_COLORS.length]}
              strokeWidth={isFocus ? 2.2 : 1.25}
              strokeOpacity={isFocus ? 0.9 : 0.36}
              strokeLinecap="round"
              strokeDasharray={EQ_DEFAULT[i].type === 'peaking' ? 'none' : '5 4'}
            />
          )
        })}

        <path d={`${line} L${W - 10},${Y(0)} L32,${Y(0)} Z`} fill="url(#eqFillGrad)" className="ar" />
        <path d={line} stroke="url(#eqCurveGrad)" className="cv" filter="url(#eqGlow)" />

        {bands.map((b, i) => {
          const cx = X(b.f), cy = Y(b.g), isSel = sel === i, col = BAND_COLORS[i % BAND_COLORS.length]
          return (
            <g key={i}>
              {isSel && (
                <line x1={cx} x2={cx} y1={Y(0)} y2={cy} stroke={col} strokeWidth="1.6" strokeDasharray="3 3" opacity="0.78" />
              )}
              {isSel && (
                <circle cx={cx} cy={cy} r="20" fill="none" stroke={col} strokeWidth="1.5" opacity="0.35" className="pulse-ring" />
              )}
              <circle
                cx={cx}
                cy={cy}
                r={isSel ? 15 : 11.5}
                fill={isSel ? col : 'var(--panel)'}
                stroke={col}
                strokeWidth={isSel ? 3 : 2.5}
                className={`node${isSel ? ' sel' : ''}`}
              />
              <text
                className={`nt${isSel ? ' sel' : ''}`}
                x={cx}
                y={cy + 4}
                fill={isSel ? '#08101e' : 'var(--text)'}
              >
                {i + 1}
              </text>
              <circle
                cx={cx}
                cy={cy}
                r="26"
                fill="transparent"
                className="hit"
                tabIndex={0}
                role="slider"
                aria-label={`Band ${i + 1}: ${fmtHz(b.f)}, ${b.g} dB`}
                aria-valuenow={b.g}
                onPointerEnter={() => setHoverIdx(i)}
                onPointerLeave={() => setHoverIdx(null)}
                onPointerDown={e => { e.preventDefault(); drag.current = i; setSel(i); svg.current.setPointerCapture(e.pointerId) }}
                onFocus={() => setSel(i)}
                onKeyDown={e => key(e, i)}
                onDoubleClick={() => upd(i, { g: 0 })}
              />
            </g>
          )
        })}
      </svg>

      {activeBand && (
        <div className="eq-hud">
          <span className="hud-dot" style={{ background: BAND_COLORS[activeBandIdx % BAND_COLORS.length] }} />
          <b>Band {activeBandIdx + 1}</b>
          <span>{fmtHz(activeBand.f)}</span>
          <span className="hud-gain">{activeBand.g > 0 ? `+${activeBand.g}` : activeBand.g} dB</span>
          <span>Q {activeBand.q.toFixed(1)}</span>
          {hoverProbe && (
            <span className="hud-cursor">· {fmtHz(hoverProbe.freq)} / {hoverProbe.gain > 0 ? `+${hoverProbe.gain}` : hoverProbe.gain} dB</span>
          )}
        </div>
      )}
    </div>

    <small className="hint">Kurva dihaluskan dengan interpolasi kubik spline dan cahaya halus. Seret titik 1–6 untuk mengatur frekuensi &amp; gain, atau arahkan kursor untuk membaca titik frekuensi/gain secara presisi.</small>

    <div className="bands">
      {bands.map((b, i) => {
        const col = BAND_COLORS[i % BAND_COLORS.length]
        return (
          <div key={i} className={`band${sel === i ? ' sel' : ''}`} style={{ '--bcol': col }} onClick={() => setSel(i)}>
            <div className="band-head">
              <span className="bdot" style={{ background: col }} />
              <b>Band {i + 1} · {fmtHz(b.f)}</b>
            </div>
            <Slider label="Freq" min={0} max={1} step={0.002} value={fx(b.f)} show={fmtHz(b.f)}
              onChange={v => upd(i, { f: Math.round(FMIN * Math.pow(FMAX / FMIN, v)) })} />
            <Slider label="Gain" min={-GR} max={GR} step={0.5} value={b.g} show={`${b.g > 0 ? '+' : ''}${b.g} dB`} onChange={v => upd(i, { g: v })} />
            <Slider label="Q" min={0.3} max={6} step={0.1} value={b.q} show={EQ_DEFAULT[i].type === 'peaking' ? b.q.toFixed(1) : 'tetap'}
              disabled={EQ_DEFAULT[i].type !== 'peaking'} onChange={v => upd(i, { q: v })} />
          </div>
        )
      })}
    </div>

    <div className="row">
      <small>Preset</small>
      {Object.entries(EQ_PRESETS).map(([k, [n, g]]) => (
        <button key={k} onClick={() => setBands(EQ_DEFAULT.map((d, i) => ({ ...d, g: g[i] })))}>{n}</button>))}
      <button onClick={saveMine}>Simpan preset saya</button>
      <button onClick={loadMine}>Muat preset saya</button>
      <button onClick={() => setBands(EQ_DEFAULT)}>Reset</button>
    </div>
  </>)
}

function TunerPanel({ flash }) {
  const [instrument, setInstrument] = useState('guitar')
  const [a4Ref, setA4Ref] = useState(440)
  const [targetMode, setTargetMode] = useState('auto')
  const [selectedTarget, setSelectedTarget] = useState(null)
  const [listening, setListening] = useState(false)
  const [pitch, setPitch] = useState(null)
  const [refFreq, setRefFreq] = useState(null)

  const instCfg = TUNING_INSTRUMENTS[instrument] || TUNING_INSTRUMENTS.guitar
  const instRef = useRef(instCfg)
  const a4RefVal = useRef(a4Ref)
  const historyRef = useRef([])
  instRef.current = instCfg
  a4RefVal.current = a4Ref

  const ctxRef = useRef(null)
  const analyserRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)
  const toneOscRef = useRef(null)

  useEffect(() => {
    const first = instCfg.notes[0]
    setSelectedTarget(first ? { ...first, freq: +(first.freq * (a4Ref / 440)).toFixed(2) } : null)
    historyRef.current = []
    setPitch(null)
  }, [instrument, a4Ref]) // eslint-disable-line react-hooks/exhaustive-deps

  const stopMic = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {})
      ctxRef.current = null
    }
    analyserRef.current = null
    historyRef.current = []
    setListening(false)
    setPitch(null)
  }

  const startMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const ctx = new AudioCtx()
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 8192
      src.connect(analyser)

      ctxRef.current = ctx
      analyserRef.current = analyser
      streamRef.current = stream
      historyRef.current = []
      setListening(true)

      const buf = new Float32Array(analyser.fftSize)
      let lastUi = 0
      const loop = now => {
        if (!analyserRef.current || !ctxRef.current) return
        analyserRef.current.getFloatTimeDomainData(buf)
        if (now - lastUi > 55) {
          lastUi = now
          const cfg = instRef.current
          const det = detectPitchAccurate(buf, ctxRef.current.sampleRate, a4RefVal.current, cfg.minHz, cfg.maxHz)
          if (det) {
            const hist = historyRef.current
            hist.push(det.freq)
            if (hist.length > 5) hist.shift()
            // Median filter agar lonjakan octave/noise tidak membuat jarum meloncat
            const sorted = [...hist].sort((a, b) => a - b)
            const medFreq = sorted[Math.floor(sorted.length / 2)]
            const midiFloat = 69 + 12 * Math.log2(medFreq / a4RefVal.current)
            const midiNearest = Math.round(midiFloat)
            const cents = Math.round((midiFloat - midiNearest) * 100)
            const noteIdx = ((midiNearest % 12) + 12) % 12
            const octave = Math.floor(midiNearest / 12) - 1
            setPitch({
              freq: medFreq,
              note: NOTE_NAMES_SHARP[noteIdx],
              octave,
              cents: Math.max(-50, Math.min(50, cents)),
              clarity: det.clarity,
            })
          } else {
            if (historyRef.current.length > 0) historyRef.current.shift()
            if (historyRef.current.length === 0) setPitch(null)
          }
        }
        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)
    } catch {
      flash('Mikrofon tidak bisa diakses untuk Tuner')
      stopMic()
    }
  }

  const toggleTone = freq => {
    if (refFreq === freq) {
      if (toneOscRef.current) {
        try { toneOscRef.current.stop(); toneOscRef.current.disconnect() } catch {}
        toneOscRef.current = null
      }
      setRefFreq(null)
      return
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    const ctx = ctxRef.current || new AudioCtx()
    if (!ctxRef.current) ctxRef.current = ctx
    if (ctx.state === 'suspended') ctx.resume()
    if (toneOscRef.current) {
      try { toneOscRef.current.stop(); toneOscRef.current.disconnect() } catch {}
    }
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = freq
    g.gain.setValueAtTime(0.001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.05)
    osc.connect(g)
    g.connect(ctx.destination)
    osc.start()
    toneOscRef.current = osc
    setRefFreq(freq)
  }

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (toneOscRef.current) { try { toneOscRef.current.stop() } catch {} }
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    if (ctxRef.current) ctxRef.current.close().catch(() => {})
  }, [])

  // Jika mode "Kunci Senar/Nada" aktif dan nada target dipilih, hitung selisih cents terhadap nada target
  let displayNote = pitch ? `${pitch.note}${pitch.octave}` : '—'
  let cents = pitch ? pitch.cents : 0
  if (pitch && targetMode === 'manual' && selectedTarget) {
    const targetHz = selectedTarget.freq * (a4Ref / 440)
    const diffCents = Math.round(1200 * Math.log2(pitch.freq / targetHz))
    if (Math.abs(diffCents) <= 50) {
      cents = diffCents
      displayNote = `${selectedTarget.note}${selectedTarget.octave}`
    }
  }

  const inTune = pitch ? Math.abs(cents) <= 4 : false
  const needlePct = 50 + (cents / 50) * 44

  return (
    <div className="tuner-box">
      <div className="tuner-controls">
        <div className="row">
          <small>Instrumen</small>
          <Seg
            value={instrument}
            onChange={setInstrument}
            options={Object.entries(TUNING_INSTRUMENTS).map(([k, v]) => [k, v.name])}
          />
        </div>
        <div className="row">
          <small>Kalibrasi A4</small>
          <Seg
            value={a4Ref}
            onChange={setA4Ref}
            options={[[432, '432 Hz'], [440, '440 Hz'], [442, '442 Hz']]}
          />
          <Seg
            value={targetMode}
            onChange={setTargetMode}
            options={[['auto', 'Deteksi Otomatis'], ['manual', 'Kunci Nada Target']]}
          />
        </div>
      </div>

      <div className="row">
        <button className={listening ? 'on' : 'primary'} onClick={listening ? stopMic : startMic}>
          <Mic size={14} /> {listening ? 'Matikan Tuner Mic' : 'Aktifkan Tuner Mic'}
        </button>
        <span className={`tuner-status${inTune ? ' ok' : ''}`}>
          {!listening
            ? 'Siap (Mic Off)'
            : !pitch
              ? `Mainkan ${instCfg.name}…`
              : inTune
                ? 'PAS (±4¢)'
                : cents < 0
                  ? 'TERLALU RENDAH (Flat)'
                  : 'TERLALU TINGGI (Sharp)'}
        </span>
      </div>

      <div className="tuner-readout">
        <div className={`tuner-note${inTune ? ' ok' : ''}`}>
          {displayNote}
        </div>
        <div className="tuner-meta">
          <span>{pitch ? `${pitch.freq.toFixed(1)} Hz` : '0.0 Hz'}</span>
          <span className="tuner-cents">{pitch ? `${cents > 0 ? `+${cents}` : cents} ¢` : '0 ¢'}</span>
          {pitch && <small>Akurasi sinyal: {Math.round(pitch.clarity * 100)}%</small>}
        </div>
      </div>

      <div className="tuner-scale" aria-hidden="true">
        <div className="tuner-ticks">
          <span>-50</span><span>-25</span><span>0</span><span>+25</span><span>+50</span>
        </div>
        <div className="tuner-track">
          <i className="tuner-zone" />
          <i className="tuner-center" />
          {pitch && <i className={`tuner-needle${inTune ? ' ok' : ''}`} style={{ left: `${needlePct}%` }} />}
        </div>
      </div>

      <div className="tuner-ref">
        <small>
          Nada acuan {instCfg.name} (klik untuk bunyikan nada; {targetMode === 'manual' ? 'juga mengunci target nada' : 'klik untuk dengar referensi'})
        </small>
        <div className="chips">
          {instCfg.notes.map(st => {
            const tunedHz = +(st.freq * (a4Ref / 440)).toFixed(2)
            const isTarget = targetMode === 'manual' && selectedTarget?.label === st.label
            const isPlayingTone = refFreq === tunedHz
            return (
              <button
                key={st.label}
                className={isPlayingTone || isTarget ? 'on' : ''}
                onClick={() => {
                  setSelectedTarget({ ...st, freq: tunedHz })
                  toggleTone(tunedHz)
                }}
              >
                {st.label}<small>{tunedHz} Hz</small>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ---------- Kamus Chord & Scale per Instrumen ---------- */
const SCALE_SPECS = {
  major: { name: 'Mayor (Ionian)', intervals: [0, 2, 4, 5, 7, 9, 11], degrees: ['1', '2', '3', '4', '5', '6', '7'] },
  minor: { name: 'Natural Minor (Aeolian)', intervals: [0, 2, 3, 5, 7, 8, 10], degrees: ['1', '2', 'b3', '4', '5', 'b6', 'b7'] },
  pent_maj: { name: 'Pentatonik Mayor', intervals: [0, 2, 4, 7, 9], degrees: ['1', '2', '3', '5', '6'] },
  pent_min: { name: 'Pentatonik Minor', intervals: [0, 3, 5, 7, 10], degrees: ['1', 'b3', '4', '5', 'b7'] },
  blues: { name: 'Blues Minor', intervals: [0, 3, 5, 6, 7, 10], degrees: ['1', 'b3', '4', 'b5', '5', 'b7'] },
  dorian: { name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10], degrees: ['1', '2', 'b3', '4', '5', '6', 'b7'] },
}

const CHORD_DICT_TYPES = {
  maj: { name: 'Mayor', symbol: '', intervals: [0, 4, 7], roles: ['Root', '3rd', '5th'] },
  min: { name: 'Minor', symbol: 'm', intervals: [0, 3, 7], roles: ['Root', 'b3rd', '5th'] },
  '7': { name: 'Dominan 7', symbol: '7', intervals: [0, 4, 7, 10], roles: ['Root', '3rd', '5th', 'b7th'] },
  maj7: { name: 'Major 7', symbol: 'maj7', intervals: [0, 4, 7, 11], roles: ['Root', '3rd', '5th', '7th'] },
  m7: { name: 'Minor 7', symbol: 'm7', intervals: [0, 3, 7, 10], roles: ['Root', 'b3rd', '5th', 'b7th'] },
  sus4: { name: 'Sus4', symbol: 'sus4', intervals: [0, 5, 7], roles: ['Root', '4th', '5th'] },
  sus2: { name: 'Sus2', symbol: 'sus2', intervals: [0, 2, 7], roles: ['Root', '2nd', '5th'] },
  dim: { name: 'Diminished', symbol: 'dim', intervals: [0, 3, 6], roles: ['Root', 'b3rd', 'b5th'] },
}

const FRET_INSTRUMENTS = {
  guitar: {
    name: 'Gitar (E A D G B E)',
    frets: 12,
    // Dari senar bawah (tinggi, indeks 0) ke senar atas (rendah, indeks 5) agar tampil alami seperti diagram
    strings: [
      { label: 'e (1)', openMidi: 64 },
      { label: 'B (2)', openMidi: 59 },
      { label: 'G (3)', openMidi: 55 },
      { label: 'D (4)', openMidi: 50 },
      { label: 'A (5)', openMidi: 45 },
      { label: 'E (6)', openMidi: 40 },
    ],
  },
  bass: {
    name: 'Bass (G D A E)',
    frets: 12,
    strings: [
      { label: 'G (1)', openMidi: 43 },
      { label: 'D (2)', openMidi: 38 },
      { label: 'A (3)', openMidi: 33 },
      { label: 'E (4)', openMidi: 28 },
    ],
  },
  ukulele: {
    name: 'Ukulele (A E C G)',
    frets: 12,
    strings: [
      { label: 'A (1)', openMidi: 69 },
      { label: 'E (2)', openMidi: 64 },
      { label: 'C (3)', openMidi: 60 },
      { label: 'G (4)', openMidi: 67 },
    ],
  },
}

function getScaleNotes(rootIdx, scaleKey) {
  const sp = SCALE_SPECS[scaleKey] || SCALE_SPECS.major
  return sp.intervals.map((iv, i) => {
    const pc = mod12(rootIdx + iv)
    return { note: NOTES[pc], pc, degree: sp.degrees[i] || '' }
  })
}

function getChordNotes(rootIdx, chordKey) {
  const sp = CHORD_DICT_TYPES[chordKey] || CHORD_DICT_TYPES.maj
  return sp.intervals.map((iv, i) => {
    const pc = mod12(rootIdx + iv)
    return { note: NOTES[pc], pc, role: sp.roles[i] || '' }
  })
}

function InstrumentChordScaleDict({ detectedKey, transpose = 0 }) {
  const defaultRoot = detectedKey ? mod12(detectedKey.root + transpose) : 0
  const defaultScale = detectedKey?.mode === 'min' ? 'minor' : 'major'

  const [instKey, setInstKey] = useState('guitar')
  const [dictTab, setDictTab] = useState('scale')
  const [rootNote, setRootNote] = useState(defaultRoot)
  const [scaleType, setScaleType] = useState(defaultScale)
  const [chordType, setChordType] = useState('maj')
  const [fretWindow, setFretWindow] = useState('0-5')

  useEffect(() => {
    if (detectedKey) {
      setRootNote(mod12(detectedKey.root + transpose))
      setScaleType(detectedKey.mode === 'min' ? 'minor' : 'major')
    }
  }, [detectedKey?.root, detectedKey?.mode, transpose]) // eslint-disable-line react-hooks/exhaustive-deps

  const inst = FRET_INSTRUMENTS[instKey] || FRET_INSTRUMENTS.guitar
  const activeNotes = useMemo(
    () => (dictTab === 'scale' ? getScaleNotes(rootNote, scaleType) : getChordNotes(rootNote, chordType)),
    [dictTab, rootNote, scaleType, chordType]
  )
  const activePcSet = useMemo(() => new Set(activeNotes.map(n => n.pc)), [activeNotes])
  const noteMetaByPc = useMemo(() => {
    const map = {}
    activeNotes.forEach(n => { map[n.pc] = n })
    return map
  }, [activeNotes])

  const [startFret, endFret] = fretWindow === '5-10' ? [5, 10] : fretWindow === '7-12' ? [7, 12] : [0, 5]
  const fretCols = useMemo(() => {
    const arr = []
    for (let f = startFret; f <= endFret; f++) arr.push(f)
    return arr
  }, [startFret, endFret])

  const chordTitle = `${NOTES[rootNote]}${CHORD_DICT_TYPES[chordType]?.symbol || ''}`
  const scaleTitle = `${NOTES[rootNote]} ${SCALE_SPECS[scaleType]?.name || ''}`

  return (
    <div className="dict-box">
      <div className="dict-top">
        <div className="row">
          <small>Instrumen</small>
          <Seg
            value={instKey}
            onChange={setInstKey}
            options={Object.entries(FRET_INSTRUMENTS).map(([k, v]) => [k, v.name])}
          />
        </div>
        <div className="row">
          <small>Mode Kamus</small>
          <Seg
            value={dictTab}
            onChange={setDictTab}
            options={[['scale', 'Scale / Tangga Nada'], ['chord', 'Chord / Akor']]}
          />
        </div>
      </div>

      <div className="row">
        <small>Nada Dasar</small>
        <div className="chips">
          {NOTES.map((n, idx) => (
            <button
              key={n}
              className={rootNote === idx ? 'on' : ''}
              onClick={() => setRootNote(idx)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {dictTab === 'scale' ? (
        <div className="row">
          <small>Jenis Scale</small>
          <Seg
            value={scaleType}
            onChange={setScaleType}
            options={Object.entries(SCALE_SPECS).map(([k, v]) => [k, v.name])}
          />
        </div>
      ) : (
        <div className="row">
          <small>Jenis Chord</small>
          <Seg
            value={chordType}
            onChange={setChordType}
            options={Object.entries(CHORD_DICT_TYPES).map(([k, v]) => [k, v.name])}
          />
        </div>
      )}

      <div className="dict-summary">
        <div>
          <b>{dictTab === 'scale' ? scaleTitle : `Chord ${chordTitle}`}</b>
          <div className="dict-pills">
            {activeNotes.map((item, idx) => (
              <span key={`${item.note}-${idx}`} className={`dpill${item.pc === rootNote ? ' root' : ''}`}>
                <strong>{item.note}</strong>
                <small>{dictTab === 'scale' ? item.degree : item.role}</small>
              </span>
            ))}
          </div>
        </div>
        <div className="row">
          <small>Posisi Fret</small>
          <Seg
            value={fretWindow}
            onChange={setFretWindow}
            options={[['0-5', 'Fret 0–5'], ['5-10', 'Fret 5–10'], ['7-12', 'Fret 7–12']]}
          />
        </div>
      </div>

      <div className="fretboard-wrap">
        <div className="fret-grid" style={{ '--fret-cols': fretCols.length }}>
          <div className="fret-corner">Senar</div>
          {fretCols.map(f => (
            <div key={f} className="fret-num">{f === 0 ? 'Open' : f}</div>
          ))}

          {inst.strings.map(st => (
            <div key={st.label} className="fret-row-group">
              <div className="fret-str-lbl">{st.label}</div>
              {fretCols.map(f => {
                const midi = st.openMidi + f
                const pc = mod12(midi)
                const active = activePcSet.has(pc)
                const isRoot = pc === rootNote
                const meta = noteMetaByPc[pc]
                return (
                  <div
                    key={`${st.label}-${f}`}
                    className={`fret-cell${f === 0 ? ' open-col' : ''}${active ? ' hit' : ''}${isRoot ? ' root' : ''}`}
                  >
                    {active ? (
                      <span className="fret-dot" title={`${NOTES[pc]} · ${meta?.degree || meta?.role || ''}`}>
                        <b>{NOTES[pc]}</b>
                        <small>{meta?.degree || meta?.role || ''}</small>
                      </span>
                    ) : (
                      <span className="fret-empty">·</span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <small className="hint">Posisi nada pada diagram fret otomatis mengikuti kunci/transpose lagu bila track sudah terdeteksi, atau bisa dipilih manual kapan saja.</small>
    </div>
  )
}

/* ---------- App ---------- */
export default function App() {
  const [theme, setTheme] = useState('midnight')
  const [tab, setTab] = useState(1)
  const [ready, setReady] = useState(false)
  const [files, setFiles] = useState({ A: null, B: null })
  const [active, setActive] = useState('A')
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [vol, setVol] = useState({ A: 0.4, B: 0.4 })
  const [loop, setLoop] = useState({ a: null, b: null, on: false })
  const [rate, setRate] = useState(1)
  const [bands, setBands] = useState(EQ_DEFAULT)
  const [eqOn, setEqOn] = useState(true)
  const [eqScope, setEqScope] = useState('A')
  const [selBand, setSelBand] = useState(0)
  const [specCurve, setSpecCurve] = useState(() => new Array(64).fill(0))
  const [urls, setUrls] = useState({ A: '', B: '' })
  const [recSlot, setRecSlot] = useState(null)
  const [tr, setTr] = useState({ A: 0, B: 0 })
  const [chordMode, setChordMode] = useState('extended')
  const [stemMode, setStemMode] = useState('full')



  const [keepPitch, setKeepPitch] = useState(true)
  const [pitchOk, setPitchOk] = useState(false)
  const [outVol, setOutVol] = useState(1)
  const [limiter, setLimiter] = useState(true)
  const [met, setMet] = useState({ on: false, bpm: 120, vol: 0.5 })
  const taps = useRef([]), keyRef = useRef(null)
  const [device, setDevice] = useState('flat')
  const [solo, setSolo] = useState('off')
  const [ch, setCh] = useState('stereo')
  const [vocalRm, setVocalRm] = useState(false)
  const [spot, setSpot] = useState(false)
  const [noise, setNoise] = useState({ mode: 'off', level: 0.4 })
  const [punk, setPunk] = useState(false)
  const [meters, setMeters] = useState({
    bands: [-90, -90, -90, -90, -90],
    bandPeaks: [-90, -90, -90, -90, -90],
    peak: -120,
    maxPeak: -120,
    rmsL: -100,
    rmsR: -100,
    corr: 0,
    clipped: false,
  })
  const [holdPeaks, setHoldPeaks] = useState(true)
  const [showTargetValues, setShowTargetValues] = useState(true)
  const peakHoldRef = useRef([-90, -90, -90, -90, -90])
  const maxPeakRef = useRef(-120)
  const clipCountRef = useRef(0)
  const [notes, setNotes] = useState([])
  const [noteText, setNoteText] = useState('')
  const [promoLen, setPromoLen] = useState(30)
  const [promoStart, setPromoStart] = useState(null)
  const [checks, setChecks] = useState(() => { try { return JSON.parse(localStorage.getItem('cmb-checks')) || [] } catch { return [] } })
  const [msg, setMsg] = useState('')
  const [vw, setVw] = useState(0)

  const rec = useRef(null), eng = useRef(null), ps = useRef({ src: null, off: 0, t: 0, rate: 1 }), posRef = useRef(0)
  const S = useRef({}), smooth = useRef([-90, -90, -90, -90, -90]), canvas = useRef(null), seekEl = useRef(null)
  S.current = { ...S.current, files, active, loop, rate, playing }

  const ensure = () => {
    if (!eng.current) { eng.current = createEngine(); setReady(true); attachPitch(eng.current).then(() => setPitchOk(true)).catch(() => {}) }
    if (eng.current.ctx.state === 'suspended') eng.current.ctx.resume()
    return eng.current
  }
  const setP = v => { posRef.current = v; setPos(v) }
  const flash = t => { setMsg(t); setTimeout(() => setMsg(''), 2200) }
  const cur = files[active]
  const dur = cur?.buf.duration || 0
  const loopOk = l => l.a != null && l.b != null && l.b > l.a

  /* ----- transport ----- */
  const getPos = () => {
    const e = eng.current, p = ps.current, s = S.current
    if (!e || !s.playing) return posRef.current
    let raw = p.off + (e.ctx.currentTime - p.t) * p.rate
    const { a, b, on } = s.loop
    if (on && loopOk(s.loop) && raw >= b) raw = a + ((raw - a) % (b - a))
    return Math.max(0, Math.min(raw, s.files[s.active]?.buf.duration || 0))
  }
  const stopSrc = () => {
    const e = eng.current, p = ps.current
    if (!e || !p.src) return false
    const s = p.src; ps.current = { ...p, src: null }
    const t = e.ctx.currentTime
    e.master.gain.cancelScheduledValues(t); e.master.gain.setValueAtTime(e.master.gain.value, t)
    e.master.gain.linearRampToValueAtTime(0, t + 0.04)
    try { s.stop(t + 0.045) } catch { /* sudah berhenti */ }
    return true
  }
  const start = (off, over = {}) => {
    const e = eng.current, s = { ...S.current, ...over }, f = s.files[s.active]
    if (!e || !f) return
    const lp = s.loop.on && loopOk(s.loop)
    if (lp && (off < s.loop.a || off >= s.loop.b)) off = s.loop.a
    const src = e.ctx.createBufferSource()
    src.buffer = f.buf; src.playbackRate.value = s.rate
    if (lp) { src.loop = true; src.loopStart = s.loop.a; src.loopEnd = s.loop.b }
    src.connect(s.active === 'A' ? e.eqA[0] : e.eqB[0])
    const t = e.ctx.currentTime
    e.master.gain.cancelScheduledValues(t); e.master.gain.setValueAtTime(0, t)
    e.master.gain.linearRampToValueAtTime(1, t + 0.04)
    src.onended = () => { if (ps.current.src === src) { ps.current.src = null; S.current.playing = false; setPlaying(false); setP(0) } }
    src.start(t, off)
    ps.current = { src, off, t, rate: s.rate }
    S.current.playing = true; setPlaying(true)
  }
  const restart = (off, over = {}) => {
    if (stopSrc()) { setP(off); setTimeout(() => start(off, over), 50) } else start(off, over)
  }
  const togglePlay = () => {
    const e = ensure()
    if (!S.current.files[S.current.active]) return flash('Unggah Track A atau B dulu')
    if (S.current.playing) {
      const p = getPos(); stopSrc(); S.current.playing = false; setPlaying(false); setP(p)
    } else {
      e.ctx.resume(); start(posRef.current >= dur - 0.05 ? 0 : posRef.current)
    }
  }
  const seek = off => { setP(off); if (S.current.playing) restart(off) }
  const switchTrack = x => {
    if (!files[x] || x === active) return
    const p = Math.min(getPos(), files[x].buf.duration - 0.1)
    setActive(x); S.current.active = x; setP(p)
    if (S.current.playing) restart(p, { active: x })
  }
  const changeLoop = next => {
    setLoop(next); S.current.loop = next
    if (S.current.playing) restart(getPos(), { loop: next })
  }
  const changeRate = r => {
    setRate(r); S.current.rate = r
    const e = eng.current, p = ps.current
    if (e && p.src) { const now = getPos(); p.src.playbackRate.value = r; ps.current = { ...p, off: now, t: e.ctx.currentTime, rate: r } }
  }

  /* ----- unggah + analisis otomatis ----- */
  const loadBuffer = async (slot, ab, name) => {
    const e = ensure()
    flash(`Membaca ${name}…`)
    try {
      const buf = await e.ctx.decodeAudioData(ab)
      const lufs = estimateLufs(buf)
      const info = { name, buf, peaks: waveformPeaks(buf), bpm: detectBpm(buf), lufs, norm: Math.min(1, 10 ** ((-14 - lufs) / 20)) }
      setFiles(f => ({ ...f, [slot]: info }))
      setTimeout(() => {
        const harm = analyzeHarmony(buf, chordMode)
        setFiles(f => (f[slot]?.buf === buf ? { ...f, [slot]: { ...f[slot], harm } } : f))
      }, 80)
      if (!S.current.files[S.current.active]) { setActive(slot); S.current.active = slot }
      flash(`${name} siap · ${info.bpm ?? '?'} BPM`)
    } catch { flash('Audio tidak bisa dibaca. Coba WAV / MP3.') }
  }
  const load = async (slot, file) => { if (file) loadBuffer(slot, await file.arrayBuffer(), file.name) }
  const loadUrl = async (slot, raw) => {
    const url = raw.trim()
    if (!/^https?:\/\//i.test(url)) return flash('Isi link yang diawali https://')
    if (/youtu\.?be/i.test(url)) return flash('Link YouTube tidak bisa dipakai. Pakai file audio atau link langsung .mp3/.wav')
    flash('Mengunduh audio…')
    try {
      const r = await fetch(url)
      if (!r.ok) throw new Error('http')
      loadBuffer(slot, await r.arrayBuffer(), decodeURIComponent(url.split('?')[0].split('/').pop()) || 'audio-link')
    } catch { flash('Gagal. Server link ini tidak mengizinkan akses. Unduh filenya lalu unggah.') }
  }
  const toggleRec = async slot => {
    if (recSlot) { rec.current?.stop(); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      const mr = new MediaRecorder(stream), chunks = []
      mr.ondataavailable = e => chunks.push(e.data)
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop()); setRecSlot(null)
        loadBuffer(slot, await new Blob(chunks, { type: mr.mimeType }).arrayBuffer(), `rekaman-${new Date().toTimeString().slice(0, 5).replace(':', '.')}`)
      }
      rec.current = mr; mr.start(); setRecSlot(slot)
    } catch { flash('Mikrofon tidak bisa diakses. Izinkan akses mikrofon di browser.') }
  }

  useEffect(() => {
    ['A', 'B'].forEach(slot => {
      const buf = files[slot]?.buf
      if (!buf) return
      const id = setTimeout(() => {
        const harm = analyzeHarmony(buf, chordMode)
        setFiles(f => (f[slot]?.buf === buf ? { ...f, [slot]: { ...f[slot], harm } } : f))
      }, 40)
      return () => clearTimeout(id)
    })
  }, [chordMode]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ----- sinkron parameter audio ----- */
  const set = (p, v, tc = 0.02) => p.setTargetAtTime(v, eng.current.ctx.currentTime, tc)
  useEffect(() => {
    if (!ready) return
    const e = eng.current
    set(e.gA.gain, vol.A * (spot && files.A ? files.A.norm : 1))
    set(e.gB.gain, vol.B * (spot && files.B ? files.B.norm : 1))
  }, [vol, spot, files, ready])
  useEffect(() => {
    if (!ready) return
    const e = eng.current
    ;[['A', e.eqA], ['B', e.eqB]].forEach(([k, chain]) => {
      const on = eqOn && eqScope.includes(k)
      chain.forEach((n, i) => {
        const b = bands[i]
        set(n.frequency, b.f); set(n.gain, on ? b.g : 0)
        if (EQ_DEFAULT[i].type === 'peaking') set(n.Q, b.q)
      })
    })
  }, [bands, eqOn, eqScope, ready])
  useEffect(() => {
    if (!ready) return
    const e = eng.current, d = DEVICES[device]
    set(e.dHp.frequency, d.hp); set(e.dLp.frequency, d.lp); set(e.dLs.gain, d.ls)
  }, [device, ready])
  useEffect(() => { if (ready) { const [h, l] = SOLO[solo]; set(eng.current.sHp.frequency, h); set(eng.current.sLp.frequency, l) } }, [solo, ready])

  useEffect(() => {
    if (!ready) return
    const e = eng.current
    const st = STEMS[stemMode] || STEMS.full
    const matKey = vocalRm ? 'side' : (stemMode !== 'full' ? st.mat : ch)
    const m = MATRIX[matKey]
    e.mx.forEach((g, i) => set(g.gain, m[i], 0.01))
    set(e.stHp.frequency, st.hp)
    set(e.stLp.frequency, st.lp)
    set(e.stPk.frequency, st.pkF)
    set(e.stPk.gain, st.pkG)
    set(e.stPk.Q, st.pkQ)
  }, [ch, vocalRm, stemMode, ready])

  useEffect(() => {
    if (!ready) return
    const e = eng.current, g = noise.mode === 'off' ? 0 : noise.level * 0.25
    if (noise.mode === 'cafe') { e.nFilter.type = 'bandpass'; e.nFilter.frequency.value = 1400; e.nFilter.Q.value = 0.35 }
    if (noise.mode === 'street') { e.nFilter.type = 'lowpass'; e.nFilter.frequency.value = 350; e.nFilter.Q.value = 0.7 }
    set(e.nGain.gain, g, 0.1); set(e.lfoG.gain, g * 0.35, 0.1)
  }, [noise, ready])

  useEffect(() => {
    if (!ready) return
    const e = eng.current
    set(e.outVol.gain, outVol); set(e.limDirect.gain, limiter ? 0 : 1, 0.02); set(e.limComp.gain, limiter ? 1 : 0, 0.02)
  }, [outVol, limiter, ready])
  useEffect(() => {
    if (!ready || !pitchOk) return
    const e = eng.current, total = tr[active] + (keepPitch ? -12 * Math.log2(rate) : 0), sh = Math.abs(total) > 0.01
    set(e.pitch.parameters.get('ratio'), 2 ** (total / 12), 0.03)
    set(e.direct.gain, sh ? 0 : 1, 0.02); set(e.shifted.gain, sh ? 1 : 0, 0.02)
  }, [tr, active, keepPitch, rate, ready, pitchOk])
  useEffect(() => {
    if (!met.on || !ready) return
    const e = eng.current; let next = e.ctx.currentTime + 0.05, n = 0
    const id = setInterval(() => {
      while (next < e.ctx.currentTime + 0.15) {
        const o = e.ctx.createOscillator(), g = e.ctx.createGain()
        o.frequency.value = n % 4 === 0 ? 1500 : 1000
        g.gain.setValueAtTime(met.vol * 0.4, next); g.gain.exponentialRampToValueAtTime(0.001, next + 0.05)
        o.connect(g); g.connect(e.ctx.destination); o.start(next); o.stop(next + 0.06)
        next += 60 / met.bpm; n++
      }
    }, 30)
    return () => clearInterval(id)
  }, [met, ready])
  keyRef.current = e => {
    if (e.defaultPrevented || /^(INPUT|TEXTAREA|SELECT|BUTTON|SUMMARY)$/.test(e.target.tagName)) return
    if (e.key === ' ') { e.preventDefault(); togglePlay() }
    else if (e.key === 'ArrowRight') seek(Math.min(dur, getPos() + 5))
    else if (e.key === 'ArrowLeft') seek(Math.max(0, getPos() - 5))
    else if (e.key === '1') switchTrack('A')
    else if (e.key === '2') switchTrack('B')
  }
  useEffect(() => {
    const f = e => keyRef.current(e)
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [])

  /* ----- meter & posisi + grafik spektrum EQ (rAF) ----- */
  useEffect(() => {
    let id
    const tick = () => {
      const e = eng.current
      if (e && S.current.playing) {
        setP(getPos())
        const f = new Float32Array(e.an.frequencyBinCount); e.an.getFloatFrequencyData(f)
        const hz = e.ctx.sampleRate / e.an.fftSize
        const raw = BANDS.map(([, lo, hi]) => { let s = 0, c = 0; for (let i = Math.floor(lo / hz); i <= Math.ceil(hi / hz); i++) { s += f[i]; c++ } return Math.max(-100, s / c) })
        smooth.current = smooth.current.map((v, i) => v * 0.8 + raw[i] * 0.2)

        const pts = new Array(64)
        for (let k = 0; k < 64; k++) {
          const freq = FMIN * Math.pow(FMAX / FMIN, k / 63)
          const bin = Math.min(f.length - 1, Math.max(1, Math.round(freq / hz)))
          const normDb = (f[bin] + 95) / 80
          pts[k] = Math.max(0, Math.min(1, normDb))
        }
        setSpecCurve(pts)

        const t = new Float32Array(e.an.fftSize); e.an.getFloatTimeDomainData(t)
        let pk = 0; for (const x of t) { const ax = Math.abs(x); if (ax > pk) pk = ax; if (ax >= 0.999) clipCountRef.current += 1 }
        const l = new Float32Array(2048), r = new Float32Array(2048); e.anL.getFloatTimeDomainData(l); e.anR.getFloatTimeDomainData(r)
        let lr = 0, ll = 0, rr = 0; for (let i = 0; i < 2048; i++) { lr += l[i] * r[i]; ll += l[i] * l[i]; rr += r[i] * r[i] }
        const peakDb = db(pk)
        if (peakDb > maxPeakRef.current) maxPeakRef.current = peakDb
        peakHoldRef.current = peakHoldRef.current.map((prevHold, idx) => {
          const curVal = smooth.current[idx]
          if (curVal >= prevHold) return curVal
          return Math.max(curVal, prevHold - 0.35)
        })
        const rmsLDb = db(Math.sqrt(ll / 2048))
        const rmsRDb = db(Math.sqrt(rr / 2048))
        setMeters({
          bands: [...smooth.current],
          bandPeaks: [...peakHoldRef.current],
          peak: peakDb,
          maxPeak: maxPeakRef.current,
          rmsL: rmsLDb,
          rmsR: rmsRDb,
          corr: ll && rr ? lr / Math.sqrt(ll * rr) : 0,
          clipped: clipCountRef.current > 0 || peakDb >= -0.05,
        })
      }
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    let t
    const f = () => { clearTimeout(t); t = setTimeout(() => setVw(window.innerWidth), 120) }
    window.addEventListener('resize', f)
    return () => { window.removeEventListener('resize', f); clearTimeout(t) }
  }, [])

  /* ----- waveform ----- */
  useEffect(() => {
    const c = canvas.current
    if (!c || tab !== 1) return
    const g = c.getContext('2d'), W = (c.width = c.clientWidth * 2), H = (c.height = 120)
    g.clearRect(0, 0, W, H); g.fillStyle = THEMES[theme].acc
    const p = cur?.peaks || []
    p.forEach((v, i) => { const h = Math.max(2, v * H * 0.95), x = (i / p.length) * W; g.fillRect(x, (H - h) / 2, Math.max(1, W / p.length - 1), h) })
  }, [cur, theme, tab, vw])

  /* ----- aksi lain ----- */
  const addNote = () => {
    if (!noteText.trim()) return
    setNotes(n => [...n, { t: pos, text: noteText.trim() }].sort((a, b) => a.t - b.t)); setNoteText('')
  }
  const copyReport = async () => {
    const body = notes.map(n => `[${fmt(n.t)}] ${n.text}`).join('\n')
    const txt = `*Catatan Mix — ${files.A?.name || 'Mix Band'}*\n${body}`
    try { await navigator.clipboard.writeText(txt); flash('Laporan disalin, tinggal tempel di WA') } catch { flash('Gagal menyalin') }
  }
  const cutPromo = () => {
    const f = files[active]; if (!f) return flash('Unggah audio dulu')
    const b = f.buf, sr = b.sampleRate
    const st = Math.floor(Math.min(promoStart ?? (loopOk(loop) ? loop.a : pos), b.duration - 0.1) * sr)
    const n = Math.min(Math.round(promoLen * sr), b.length - st), fi = Math.floor(0.04 * sr), fo = Math.min(Math.floor(0.8 * sr), n)
    if (n <= 0) return flash('Durasi tidak valid')
    const chs = Array.from({ length: b.numberOfChannels }, (_, c) => {
      const out = b.getChannelData(c).slice(st, st + n)
      for (let i = 0; i < fi && i < n; i++) out[i] *= i / fi
      for (let i = 0; i < fo && i < n; i++) out[n - 1 - i] *= i / fo
      return out
    })
    download(encodeWav(chs, sr), `promo-${promoLen}s-dari-${fmt(st / sr).replace(':', 'm')}.wav`)
  }
  const splitLR = () => {
    const b = files.A?.buf; if (!b) return flash('Unggah Track A dulu')
    if (b.numberOfChannels < 2) return flash('File ini mono, tidak bisa dipisah L/R')
    const base = files.A.name.replace(/\.[^.]+$/, '')
    download(encodeWav([b.getChannelData(0)], b.sampleRate), `${base}-L.wav`)
    setTimeout(() => download(encodeWav([b.getChannelData(1)], b.sampleRate), `${base}-R.wav`), 400)
  }
  const toggleCheck = i => setChecks(c => {
    const n = c.includes(i) ? c.filter(x => x !== i) : [...c, i]
    try { localStorage.setItem('cmb-checks', JSON.stringify(n)) } catch { /* abaikan */ }
    return n
  })

  const levelMatch = () => {
    const a = files.A, b = files.B
    if (!a || !b) return flash('Unggah Track A dan B dulu')
    setVol(o => ({ ...o, B: Math.max(0.05, Math.min(1, o.A * 10 ** ((a.lufs - b.lufs) / 20))) }))
    flash('Loudness Track B disamakan dengan A (estimasi)')
  }
  const matchKey = () => {
    const a = files.A?.harm?.key, b = files.B?.harm?.key
    if (!a || !b) return flash('Tunggu analisis kunci kedua track selesai')
    const eq = k => (k.mode === 'min' ? (k.root + 3) % 12 : k.root)
    let d = mod12(eq(a) - eq(b)); if (d > 6) d -= 12
    setTr(o => ({ ...o, B: d })); flash(`Track B ditranspose ${d > 0 ? '+' : ''}${d} semiton`)
  }
  const toggleMet = () => { ensure(); setMet(m => ({ ...m, on: !m.on })) }
  const tap = () => {
    const now = performance.now(), t = taps.current
    if (t.length && now - t[t.length - 1] > 2500) t.length = 0
    t.push(now)
    const a = t.slice(-6)
    if (a.length > 1) setMet(m => ({ ...m, bpm: Math.max(40, Math.min(220, Math.round(60000 / ((a[a.length - 1] - a[0]) / (a.length - 1))))) }))
  }

  const harm = cur?.harm
  const trA = tr[active]

  const T = THEMES[theme]
  const mean = meters.bands.reduce((a, b) => a + b, 0) / 5
  const pct = v => Math.max(0, Math.min(100, ((v + 100) / 100) * 100))
  const semis = 12 * Math.log2(rate)

  return (
    <div className="app" style={{ '--bg': T.bg, '--panel': T.panel, '--line': T.line, '--text': T.text, '--mute': T.mute, '--acc': T.acc }}>
      <style>{CSS}</style>
      <header>
        <div className="brand">
          <span className={`logo${playing ? ' live' : ''}`}><i /><i /><i /></span>
          <div><h1>DIY Studio &amp; Stage Console <span className="by">by. Ares</span></h1><small>v4.6 · cek mix band</small></div>
        </div>
        <Seg value={theme} onChange={setTheme} options={Object.entries(THEMES).map(([k, v]) => [k, v.n])} />
      </header>
      <nav><button className={tab === 1 ? 'on' : ''} onClick={() => setTab(1)}>Mix &amp; Referensi</button>
        <button className={tab === 2 ? 'on' : ''} onClick={() => setTab(2)}>Promo, Live &amp; Rilis</button></nav>
      {msg && <div className="toast">{msg}</div>}

      {tab === 1 && <main>
        <Card title="Pemutar A/B" wide>
          <div className="slots">
            {['A', 'B'].map(x => (
              <div key={x} className={`slot${active === x ? ' act' : ''}`}>
                <button className="sw" onClick={() => switchTrack(x)} disabled={!files[x]}><i className="led" />Track {x} · {x === 'A' ? 'Mix Band' : 'Referensi'}</button>
                <label className="up"><Upload size={14} /> {files[x]?.name || 'Pilih file audio'}
                  <input type="file" accept="audio/*" hidden onChange={e => load(x, e.target.files[0])} /></label>
                {files[x] && <small>{files[x].bpm ?? '—'} BPM · ≈{files[x].lufs.toFixed(1)} LUFS</small>}
                <details className="more"><summary>Sumber lain: link atau rekam</summary>
                  <div>
                    <input className="txt" placeholder="https://…/lagu.mp3" value={urls[x]} onChange={e => setUrls(u => ({ ...u, [x]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && loadUrl(x, urls[x])} />
                    <button onClick={() => loadUrl(x, urls[x])}><Link2 size={14} /> Muat</button>
                    <button className={recSlot === x ? 'rec' : ''} disabled={!!recSlot && recSlot !== x} onClick={() => toggleRec(x)}>
                      <Mic size={14} /> {recSlot === x ? 'Stop rekam' : 'Rekam mic'}</button>
                  </div>
                  <small className="hint">Link harus langsung ke file audio (.mp3/.wav) dan servernya mengizinkan akses. Link YouTube tidak didukung.</small>
                </details>
                <Slider label="Gain" value={vol[x]} onChange={v => setVol(o => ({ ...o, [x]: v }))} show={`${Math.round(vol[x] * 100)}%`} />
              </div>))}
          </div>
          <div className="row"><button onClick={levelMatch}>Samakan loudness B ke A</button>
            <small>Pintasan: Spasi putar/jeda, ←/→ geser 5 detik, 1/2 pilih track</small></div>
          <div className="wave" ref={seekEl} onClick={e => { if (!dur) return; const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * dur) }}>
            <canvas ref={canvas} />
            {loopOk(loop) && <i className="lp" style={{ left: `${(loop.a / dur) * 100}%`, width: `${((loop.b - loop.a) / dur) * 100}%`, opacity: loop.on ? 1 : 0.4 }} />}
            {dur > 0 && <i className="pl" style={{ width: `${(pos / dur) * 100}%` }} />}
            {dur > 0 && <i className="ph" style={{ left: `${(pos / dur) * 100}%` }} />}
          </div>
          <div className="row">
            <button className="primary play" onClick={togglePlay}>{playing ? <Pause size={16} /> : <Play size={16} />}{playing ? 'Jeda' : 'Putar'}</button>
            <span className="time">{fmt(pos)} / {fmt(dur)}</span>
            <button onClick={() => changeLoop({ ...loop, a: pos })}>Set A</button>
            <button onClick={() => changeLoop({ ...loop, b: pos })}>Set B</button>
            <button className={loop.on ? 'on' : ''} disabled={!loopOk(loop)} onClick={() => changeLoop({ ...loop, on: !loop.on })}><Repeat size={14} /> Loop {loop.on ? 'ON' : 'OFF'}</button>
            {loop.a != null && <small>A {fmt(loop.a)}{loop.b != null && ` – B ${fmt(loop.b)}`}</small>}
          </div>
          <Slider label="Kecepatan" min={0.75} max={1.25} step={0.01} value={rate} onChange={changeRate}
            show={keepPitch && pitchOk ? `${rate.toFixed(2)}×` : `${rate.toFixed(2)}× (${semis >= 0 ? '+' : ''}${semis.toFixed(1)} st)`} />
          <label className="chk"><input type="checkbox" checked={keepPitch} onChange={e => setKeepPitch(e.target.checked)} /> Jaga nada saat kecepatan berubah (cocok untuk latihan)</label>
          {keepPitch && !pitchOk && <small className="hint">Pitch shifter belum siap atau tidak didukung browser ini, jadi nada ikut berubah seperti kaset.</small>}
        </Card>

        <Card title="Pemisah Instrumen (Stem Isolator)" wide>
          <Seg value={stemMode} onChange={setStemMode} options={Object.entries(STEMS).map(([k, v]) => [k, v.n])} />
          <small className="hint">Pisahkan elemen instrumen secara real-time (Vokal/Lead, Bass/Sub, Drums/Beat, Gitar/Side, atau Minus Vocal) menggunakan pemrosesan Mid-Side dan filter frekuensi tanpa mengubah file asli.</small>
        </Card>

        <Card title="Kunci, Transpose & Kamus Chord / Scale" wide>
          <div className="row">
            <small>Jenis deteksi harmoni</small>
            <Seg value={chordMode} onChange={setChordMode} options={[['basic', 'Dasar'], ['extended', 'Extended']]} />
          </div>
          <div className="keys">
            {['A', 'B'].map(x => {
              const h = files[x]?.harm
              return (
                <div key={x} className={`kbox${active === x ? ' act' : ''}`}>
                  <small>Track {x} · {x === 'A' ? 'Mix Band' : 'Referensi'}</small>
                  {!files[x] ? <b>—</b> : !h ? <b>menganalisis…</b> : (<>
                    <b>{keyName(h.key, tr[x])}</b>
                    <small>{tr[x] !== 0 && `asli ${keyName(h.key)} · `}relatif {keyName(relKey(h.key), tr[x])} · keyakinan {h.key.conf}</small></>)}
                </div>)
            })}
          </div>
          <Slider label="Transpose" min={-12} max={12} step={1} value={trA} onChange={v => setTr(o => ({ ...o, [active]: v }))}
            show={`${trA > 0 ? '+' : ''}${trA} semiton`} />
          <div className="row">
            <button onClick={() => setTr(o => ({ ...o, [active]: Math.max(-12, o[active] - 1) }))}>−1</button>
            <button onClick={() => setTr(o => ({ ...o, [active]: Math.min(12, o[active] + 1) }))}>+1</button>
            <button onClick={() => setTr(o => ({ ...o, [active]: 0 }))}>Reset</button>
            <button onClick={matchKey}>Samakan kunci B ke A</button>
            <small>Berlaku untuk Track {active}. {pitchOk ? '' : 'Pitch shifter belum siap.'}</small>
          </div>

          <InstrumentChordScaleDict detectedKey={harm?.key} transpose={trA} />
        </Card>

        <Card title="Spektrum & Meter" wide>
          <div className="spec-toolbar">
            <div className="row">
              <button className={holdPeaks ? 'on' : ''} onClick={() => setHoldPeaks(h => !h)}>
                Peak Hold: {holdPeaks ? 'ON' : 'OFF'}
              </button>
              <button className={punk ? 'on' : ''} onClick={() => setPunk(p => !p)}>
                Target Punk / Alt-Rock
              </button>
              {punk && (
                <button className={showTargetValues ? 'on' : ''} onClick={() => setShowTargetValues(v => !v)}>
                  Selisih Target
                </button>
              )}
            </div>
            <button
              onClick={() => {
                peakHoldRef.current = [-90, -90, -90, -90, -90]
                maxPeakRef.current = -120
                clipCountRef.current = 0
                setMeters(m => ({ ...m, bandPeaks: [-90, -90, -90, -90, -90], maxPeak: -120, clipped: false }))
                flash('Peak Hold & indikator klip direset')
              }}
            >
              Reset Peak
            </button>
          </div>

          <div className="spec-board">
            <div className="spec-scale" aria-hidden="true">
              <span>0 dB</span>
              <span>-25</span>
              <span>-50</span>
              <span>-75</span>
              <span>-100</span>
            </div>

            <div className="spec">
              {BANDS.map(([n, lo, hi], i) => {
                const curVal = meters.bands[i]
                const barPct = pct(curVal)
                const holdPct = pct(meters.bandPeaks[i])
                const targetDb = mean + PUNK_TARGET[i]
                const targetPct = pct(targetDb)
                const diffDb = curVal - targetDb
                return (
                  <div key={n} className="band-col">
                    <div className="band-top-readout">
                      <b>{curVal > -99 ? `${curVal.toFixed(1)}` : '−∞'}</b>
                      <small>dB</small>
                    </div>

                    <div className="bar">
                      <div className="fill" style={{ clipPath: `inset(${100 - barPct}% 0 0 0)` }} />
                      {holdPeaks && meters.bandPeaks[i] > -98 && (
                        <i className="pk-marker" style={{ bottom: `${holdPct}%` }} title={`Peak Band: ${meters.bandPeaks[i].toFixed(1)} dB`} />
                      )}
                      {punk && (
                        <i
                          className="tgt"
                          style={{ bottom: `${targetPct}%` }}
                          title={`Target Punk/Alt-Rock: ${targetDb.toFixed(1)} dB (${PUNK_TARGET[i] > 0 ? `+${PUNK_TARGET[i]}` : PUNK_TARGET[i]} dari rata-rata)`}
                        />
                      )}
                    </div>

                    <div className="band-foot">
                      <span className="band-name">{n}</span>
                      <small className="band-range">{lo}–{hi >= 1000 ? `${hi / 1000}k` : hi} Hz</small>
                      {punk && showTargetValues && curVal > -98 && (
                        <small className={`band-delta ${Math.abs(diffDb) <= 2.5 ? 'ok' : diffDb > 0 ? 'hi' : 'lo'}`}>
                          {diffDb > 0 ? `+${diffDb.toFixed(1)}` : diffDb.toFixed(1)} vs tgt
                        </small>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="meter-grid">
            <div className="meter-card">
              <div className="meter-head">
                <span>Peak Aktif</span>
                <b className={meters.peak > -1 ? 'warn' : ''}>{meters.peak > -119 ? `${meters.peak.toFixed(1)} dB` : '−∞ dB'}</b>
              </div>
              <small className="meter-sub">
                Max Hold: <b>{meters.maxPeak > -119 ? `${meters.maxPeak.toFixed(1)} dB` : '−∞'}</b>
                {meters.clipped && <span className="clip-badge">KLIP TERDETEKSI</span>}
              </small>
            </div>

            <div className="meter-card">
              <div className="meter-head">
                <span>Level L / R (RMS)</span>
                <b>{meters.rmsL > -95 ? `${meters.rmsL.toFixed(1)} / ${meters.rmsR.toFixed(1)} dB` : '−∞ / −∞'}</b>
              </div>
              <div className="lr-bars" aria-hidden="true">
                <div className="lr-row">
                  <span>L</span>
                  <div className="lr-track"><i style={{ width: `${pct(meters.rmsL)}%` }} /></div>
                </div>
                <div className="lr-row">
                  <span>R</span>
                  <div className="lr-track"><i style={{ width: `${pct(meters.rmsR)}%` }} /></div>
                </div>
              </div>
            </div>

            <div className="meter-card grow">
              <div className="meter-head">
                <span>Korelasi Stereo</span>
                <b className={meters.corr < -0.25 ? 'warn' : ''}>{meters.corr.toFixed(2)}</b>
              </div>
              <div className="corr-wrap">
                <div className="corr"><i style={{ left: `${(meters.corr + 1) * 50}%` }} /></div>
                <div className="corr-labels">
                  <span>-1.0 (Out of Phase)</span>
                  <span>0.0</span>
                  <span>+1.0 (Mono / In Phase)</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Equalizer 6-Band" wide>
          <EqPanel bands={bands} setBands={setBands} eqOn={eqOn} setEqOn={setEqOn} scope={eqScope} setScope={setEqScope}
            sel={selBand} setSel={setSelBand} flash={flash} specCurve={specCurve} />
        </Card>

        <Card title="Monitoring">
          <p className="lbl">Simulasi perangkat</p>
          <Seg value={device} onChange={setDevice} options={Object.entries(DEVICES).map(([k, v]) => [k, v.n])} />
          <p className="lbl">Isolasi band</p>
          <Seg value={solo} onChange={setSolo} options={[['off', 'Off'], ['low', 'Solo Low'], ['mid', 'Solo Mid'], ['high', 'Solo High']]} />
          <p className="lbl">Kanal</p>
          <Seg value={ch} onChange={setCh} options={[['stereo', 'Stereo'], ['mono', 'Mono / Mid'], ['side', 'Solo Side']]} />
          <label className="chk"><input type="checkbox" checked={vocalRm} onChange={e => setVocalRm(e.target.checked)} /> Vocal Remover (center cancel; bass &amp; kick ikut berkurang)</label>
          <label className="chk"><input type="checkbox" checked={spot} onChange={e => setSpot(e.target.checked)} /> Normalisasi Spotify −14 LUFS (estimasi)</label>
          <Slider label="Volume keluar" value={outVol} onChange={setOutVol} show={`${Math.round(outVol * 100)}%`} />
          <label className="chk"><input type="checkbox" checked={limiter} onChange={e => setLimiter(e.target.checked)} /> Pelindung telinga (limiter) untuk IEM</label>
        </Card>

        <Card title="Simulasi Kebisingan">
          <Seg value={noise.mode} onChange={m => setNoise(n => ({ ...n, mode: m }))} options={[['off', 'Off'], ['cafe', 'Kafe'], ['street', 'Jalanan']]} />
          <Slider label="Level" value={noise.level} onChange={v => setNoise(n => ({ ...n, level: v }))} show={`${Math.round(noise.level * 100)}%`} />
        </Card>

        <Card title="Metronom">
          <div className="row">
            <button className={met.on ? 'on' : ''} onClick={toggleMet}>{met.on ? 'Berhenti' : 'Mulai'}</button>
            <button onClick={tap}>Tap tempo</button>
            <button disabled={!cur?.bpm} onClick={() => setMet(m => ({ ...m, bpm: Math.round(cur.bpm * rate) }))}>Ikuti lagu ({cur?.bpm ? Math.round(cur.bpm * rate) : '—'})</button>
          </div>
          <Slider label="BPM" min={40} max={220} step={1} value={met.bpm} onChange={v => setMet(m => ({ ...m, bpm: v }))} show={`${met.bpm}`} />
          <Slider label="Volume" value={met.vol} onChange={v => setMet(m => ({ ...m, vol: v }))} show={`${Math.round(met.vol * 100)}%`} />
        </Card>

        <Card title="Tuner Instrumen (Mic & Nada Acuan)">
          <TunerPanel flash={flash} />
        </Card>

        <Card title="Catatan Revisi" wide>
          <div className="row">
            <input className="txt" value={noteText} placeholder={`Catatan di ${fmt(pos)}…`} onChange={e => setNoteText(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNote()} />
            <button className="primary" onClick={addNote}><StickyNote size={14} /> Tambah</button>
            <button onClick={copyReport} disabled={!notes.length}><Copy size={14} /> Salin Laporan WA</button>
          </div>
          {!notes.length && <small className="hint">Belum ada catatan. Putar lagu, lalu tulis temuan di titik waktunya.</small>}
          <ul className="notes">{notes.map((n, i) => (
            <li key={i}><button onClick={() => seek(n.t)}>{fmt(n.t)}</button><span>{n.text}</span>
              <button aria-label="Hapus catatan" onClick={() => setNotes(x => x.filter((_, j) => j !== i))}><Trash2 size={13} /></button></li>))}</ul>
        </Card>
      </main>}

      {tab === 2 && <main>
        <Card title="Potong Audio Promo">
          <p className="lbl">Durasi</p>
          <Seg value={promoLen} onChange={setPromoLen} options={[[15, '15 detik'], [30, '30 detik'], [60, '60 detik']]} />
          <Slider label="Kustom" min={1} max={Math.max(5, Math.min(300, Math.floor(dur) || 60))} step={1} value={promoLen}
            onChange={setPromoLen} show={`${promoLen} detik`} />
          <p className="lbl">Mulai dari</p>
          <div className="row">
            <button className={promoStart == null ? 'on' : ''} onClick={() => setPromoStart(null)}>Otomatis</button>
            <button onClick={() => setPromoStart(pos)}>Posisi sekarang ({fmt(pos)})</button>
            <button disabled={loop.a == null} onClick={() => setPromoStart(loop.a)}>Loop A</button>
            <button disabled={!loopOk(loop)} onClick={() => { setPromoStart(loop.a); setPromoLen(Math.max(1, Math.round(loop.b - loop.a))) }}>Pakai Loop A–B</button>
          </div>
          <Slider label="Titik mulai" min={0} max={Math.max(1, Math.floor(dur))} step={1} value={Math.floor(promoStart ?? 0)}
            onChange={setPromoStart} show={promoStart == null ? 'otomatis' : fmt(promoStart)} />
          <small className="hint">
            Hasil: {fmt(promoStart ?? (loopOk(loop) ? loop.a : pos))} → {fmt(Math.min(dur, (promoStart ?? (loopOk(loop) ? loop.a : pos)) + promoLen))}.
            Mode otomatis memakai Loop A, atau posisi putar jika Loop belum diatur. Fade-in 40 ms, fade-out 0,8 detik.
          </small>
          <button className="primary" onClick={cutPromo}><Scissors size={14} /> Potong &amp; unduh .wav</button>
        </Card>
        <Card title="Live Backing Track L/R">
          <small className="hint">Pisahkan Track A stereo menjadi dua file mono: kiri (misal click/guide) dan kanan (misal backing) untuk dikirim ke mixer panggung.</small>
          <button className="primary" onClick={splitLR}><Download size={14} /> Unduh L &amp; R</button>
        </Card>
        <Card title="Checklist Rilis SoundOn" wide>
          <ul className="checks">{CHECKS.map((c, i) => (
            <li key={i}><label><input type="checkbox" checked={checks.includes(i)} onChange={() => toggleCheck(i)} /> {c}</label></li>))}</ul>
          <small className="hint">{checks.length} dari {CHECKS.length} selesai</small>
        </Card>
      </main>}
    </div>
  )
}

const CSS = `.app{min-height:100vh;color:var(--text);font:15px/1.5 "Inter","Segoe UI",system-ui,-apple-system,sans-serif;padding:22px 16px 60px;background:radial-gradient(960px 420px at 50% -130px,color-mix(in srgb,var(--acc) 18%,transparent),transparent),var(--bg)}
.app *{box-sizing:border-box}
header{display:flex;flex-wrap:wrap;gap:14px;justify-content:space-between;align-items:center;max-width:1240px;margin:0 auto 16px;padding:14px 18px;border-radius:16px;background:color-mix(in srgb,var(--panel) 84%,transparent);border:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:12px}
.logo{display:flex;align-items:flex-end;gap:3px;width:40px;height:40px;padding:8px;border-radius:12px;background:var(--bg);border:1px solid var(--line)}
.logo i{flex:1;height:40%;background:var(--acc);border-radius:2px}
.logo i:nth-child(2){height:90%}.logo i:nth-child(3){height:62%}
.logo.live i{animation:eq .7s ease-in-out infinite alternate}
.logo.live i:nth-child(2){animation-delay:.2s}.logo.live i:nth-child(3){animation-delay:.4s}
@keyframes eq{to{height:96%}}
h1{font-size:21px;line-height:1.15;margin:0;font-weight:700;letter-spacing:-.02em}
header small{color:var(--mute)}
h2{font-size:15.5px;margin:0;font-weight:650;letter-spacing:-.01em;display:flex;align-items:center;gap:8px}
h2::before{content:'';width:4px;height:15px;border-radius:99px;background:var(--acc)}
nav{display:flex;gap:6px;max-width:1240px;margin:0 auto 18px;padding:4px;border-radius:12px;background:var(--panel);border:1px solid var(--line);overflow-x:auto;scrollbar-width:none}
nav button{flex:none;white-space:nowrap;border:0;border-radius:9px;padding:9px 16px;color:var(--mute);background:transparent;font-weight:500}
nav button.on{background:var(--acc);color:var(--bg);font-weight:650}
main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(310px,100%),1fr));gap:16px;max-width:1240px;margin:0 auto}
.card{min-width:0;display:flex;flex-direction:column;gap:12px;padding:18px;border:1px solid var(--line);border-radius:16px;background:var(--panel);transition:border-color .16s ease}
.card:hover{border-color:color-mix(in srgb,var(--acc) 38%,var(--line))}
.card.wide{grid-column:1/-1}
button{font:inherit;font-size:14px;display:inline-flex;gap:6px;align-items:center;padding:7px 13px;color:var(--text);background:var(--bg);border:1px solid var(--line);border-radius:10px;cursor:pointer;transition:border-color .14s,background .14s}
button:hover:not(:disabled){border-color:var(--acc);background:color-mix(in srgb,var(--acc) 10%,var(--bg))}
button:disabled{opacity:.42;cursor:not-allowed}
button.on,button.primary{background:var(--acc);color:var(--bg);border-color:var(--acc);font-weight:600}
button:focus-visible,input:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.play{border-radius:999px;padding:10px 22px;font-size:15px}
.seg{display:inline-flex;flex-wrap:wrap;gap:4px;padding:4px;align-self:flex-start;background:var(--bg);border:1px solid var(--line);border-radius:12px}
.seg button{background:transparent;border:0;padding:6px 12px;color:var(--mute);border-radius:8px}
.seg button.on{background:var(--acc);color:var(--bg)}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.slots{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:14px}
.slot{display:flex;flex-direction:column;gap:10px;padding:14px;background:var(--bg);border:1px solid var(--line);border-radius:13px;transition:border-color .16s}
.slot.act{border-color:var(--acc)}
.sw{justify-content:flex-start;font-weight:600}
.led{width:9px;height:9px;border-radius:50%;background:var(--line)}
.slot.act .led{background:var(--acc)}
.up{display:flex;gap:6px;align-items:center;color:var(--mute);cursor:pointer;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.up:hover{color:var(--text)}
.sl{display:grid;grid-template-columns:92px 1fr 128px;gap:10px;align-items:center}
.sl b{font-weight:500;color:var(--mute);text-align:right;font-size:13px;font-variant-numeric:tabular-nums}
input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:6px;border-radius:999px;background:linear-gradient(90deg,var(--acc) var(--p,50%),var(--line) var(--p,50%))}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:var(--text);border:3px solid var(--acc);cursor:pointer}
input[type=range]::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:var(--text);border:3px solid var(--acc);cursor:pointer}
input[type=checkbox]{accent-color:var(--acc);width:16px;height:16px;margin-top:3px}
.wave{position:relative;height:88px;overflow:hidden;cursor:pointer;background:var(--bg);border:1px solid var(--line);border-radius:12px}
.wave canvas{display:block;width:100%;height:100%;opacity:.88}
.pl{position:absolute;top:0;bottom:0;left:0;background:color-mix(in srgb,var(--acc) 14%,transparent);pointer-events:none}
.ph{position:absolute;top:0;bottom:0;width:2px;background:var(--text)}
.lp{position:absolute;top:0;bottom:0;background:var(--acc);opacity:.22}
.time{font-variant-numeric:tabular-nums;color:var(--mute);font-size:14px}
.hint,small{color:var(--mute);font-size:13px}
.lbl{margin:6px 0 0;color:var(--mute);font-size:13px}
.chk{display:flex;gap:8px;align-items:flex-start;font-size:14px}
.spec-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
.spec-board{display:grid;grid-template-columns:42px 1fr;gap:10px;align-items:stretch;padding:14px;border-radius:14px;background:var(--bg);border:1px solid var(--line)}
.spec-scale{display:flex;flex-direction:column;justify-content:space-between;padding:24px 0 58px;font-size:11px;color:var(--mute);font-variant-numeric:tabular-nums;text-align:right}
.spec{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;min-width:0}
.band-col{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0}
.band-top-readout{display:inline-flex;align-items:baseline;gap:2px;height:20px;font-variant-numeric:tabular-nums}
.band-top-readout b{font-size:12.5px;font-weight:700;color:var(--text)}
.band-top-readout small{font-size:10px;color:var(--mute)}
.bar{position:relative;width:100%;height:165px;overflow:hidden;border:1px solid var(--line);border-radius:10px;background:repeating-linear-gradient(0deg,color-mix(in srgb,var(--line) 75%,transparent) 0 6px,transparent 6px 9px),color-mix(in srgb,var(--panel) 70%,var(--bg))}
.fill{position:absolute;inset:0;transition:clip-path .08s linear;background:linear-gradient(0deg,var(--acc) 0 62%,#ffd166 84%,#ff5d5d);-webkit-mask:repeating-linear-gradient(0deg,#000 0 6px,transparent 6px 9px);mask:repeating-linear-gradient(0deg,#000 0 6px,transparent 6px 9px)}
.pk-marker{position:absolute;left:2px;right:2px;height:2px;background:var(--text);border-radius:99px;pointer-events:none;box-shadow:0 0 4px var(--bg)}
.tgt{position:absolute;left:0;right:0;height:0;border-top:2px dashed #ffd166;pointer-events:none}
.band-foot{display:flex;flex-direction:column;align-items:center;gap:1px;text-align:center;min-height:46px;width:100%}
.band-name{font-size:12.5px;font-weight:650;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.band-range{font-size:10.5px;color:var(--mute);font-variant-numeric:tabular-nums}
.band-delta{font-size:10.5px;font-weight:600;font-variant-numeric:tabular-nums;padding:1px 6px;border-radius:999px;background:var(--panel);border:1px solid var(--line)}
.band-delta.ok{color:#34d399;border-color:color-mix(in srgb,#34d399 45%,transparent)}
.band-delta.hi{color:#fbbf24;border-color:color-mix(in srgb,#fbbf24 45%,transparent)}
.band-delta.lo{color:#60a5fa;border-color:color-mix(in srgb,#60a5fa 45%,transparent)}
.meter-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:10px}
.meter-card{display:flex;flex-direction:column;justify-content:center;gap:8px;padding:12px 14px;border-radius:12px;background:var(--bg);border:1px solid var(--line)}
.meter-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.meter-head span{color:var(--mute);font-size:13px}
.meter-head b{padding:3px 10px;font-size:13.5px;font-variant-numeric:tabular-nums;background:var(--panel);border:1px solid var(--line);border-radius:8px}
.meter-sub{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;color:var(--mute);font-variant-numeric:tabular-nums}
.clip-badge{padding:2px 7px;border-radius:999px;font-size:10.5px;font-weight:700;color:#fff;background:#ef4444}
.lr-bars{display:flex;flex-direction:column;gap:6px}
.lr-row{display:grid;grid-template-columns:16px 1fr;gap:8px;align-items:center;font-size:11.5px;color:var(--mute)}
.lr-track{height:7px;border-radius:999px;background:var(--panel);border:1px solid var(--line);overflow:hidden}
.lr-track i{display:block;height:100%;background:var(--acc);transition:width .08s linear}
.warn{color:#ff6b6b;border-color:#ff6b6b!important}
.corr-wrap{display:flex;flex-direction:column;gap:5px}
.corr{position:relative;width:100%;height:9px;border-radius:999px;background:linear-gradient(90deg,#d6453d,var(--line) 50%,var(--acc))}
.corr i{position:absolute;top:-4px;width:4px;height:17px;border-radius:2px;background:var(--text);transform:translateX(-2px)}
.corr-labels{display:flex;justify-content:space-between;font-size:10.5px;color:var(--mute)}
.txt{flex:1;min-width:180px;padding:8px 12px;font:inherit;color:var(--text);background:var(--bg);border:1px solid var(--line);border-radius:10px}
.notes,.checks{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.notes li{display:flex;gap:10px;align-items:center;padding:8px 11px;background:var(--bg);border:1px solid var(--line);border-radius:10px}
.notes li span{flex:1}
.notes li button:first-child{padding:2px 9px;color:var(--acc);font-variant-numeric:tabular-nums}
.checks li{padding:10px 12px;background:var(--bg);border:1px solid var(--line);border-radius:10px}
.checks li:has(input:checked){border-color:var(--acc);color:var(--mute)}
.checks label{display:flex;gap:10px;cursor:pointer}
.toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:9;padding:9px 18px;font-weight:600;color:var(--bg);background:var(--acc);border-radius:10px}
.tuner-box{display:flex;flex-direction:column;gap:12px}
.tuner-controls{display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:12px;background:var(--bg);border:1px solid var(--line)}
.tuner-status{font-size:12.5px;font-weight:600;padding:4px 10px;border-radius:999px;background:var(--bg);border:1px solid var(--line);color:var(--mute)}
.tuner-status.ok{color:#34d399;border-color:#34d399;background:color-mix(in srgb,#34d399 12%,var(--bg))}
.tuner-readout{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:12px;background:var(--bg);border:1px solid var(--line)}
.tuner-note{font-size:34px;font-weight:800;line-height:1;letter-spacing:-.02em;color:var(--acc);font-variant-numeric:tabular-nums}
.tuner-note.ok{color:#34d399}
.tuner-meta{display:flex;flex-direction:column;align-items:flex-end;gap:2px;font-variant-numeric:tabular-nums;font-size:13px;color:var(--mute)}
.tuner-cents{font-weight:700;color:var(--text)}
.tuner-scale{display:flex;flex-direction:column;gap:4px}
.tuner-ticks{display:flex;justify-content:space-between;font-size:11px;color:var(--mute);font-variant-numeric:tabular-nums}
.tuner-track{position:relative;height:20px;border-radius:999px;background:var(--bg);border:1px solid var(--line);overflow:hidden}
.tuner-zone{position:absolute;top:0;bottom:0;left:45%;width:10%;background:color-mix(in srgb,#34d399 22%,transparent)}
.tuner-center{position:absolute;top:2px;bottom:2px;left:50%;width:2px;transform:translateX(-1px);background:color-mix(in srgb,var(--text) 45%,transparent)}
.tuner-needle{position:absolute;top:2px;bottom:2px;width:4px;margin-left:-2px;border-radius:999px;background:var(--acc);transition:left .06s linear}
.tuner-needle.ok{background:#34d399}
.tuner-ref{display:flex;flex-direction:column;gap:6px}
.eq-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
.eq-stage{position:relative}
.eqg{display:block;width:100%;height:auto;touch-action:none;background:radial-gradient(680px 220px at 50% 50%,color-mix(in srgb,var(--acc) 9%,transparent),transparent),var(--bg);border:1px solid var(--line);border-radius:14px;box-shadow:inset 0 1px 0 color-mix(in srgb,var(--text) 6%,transparent)}
.eqg.off{opacity:.42;filter:grayscale(.5)}
.eqg .gl{stroke:color-mix(in srgb,var(--line) 80%,transparent);stroke-width:1}
.eqg .z{stroke:color-mix(in srgb,var(--mute) 72%,transparent);stroke-dasharray:5 4;stroke-width:1.25}
.eqg .gt{fill:var(--mute);font-size:11px;font-variant-numeric:tabular-nums}
.eqg .ar{transition:opacity .15s}
.eqg .cv{fill:none;stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round}
.eqg .node{pointer-events:none;transition:r .15s ease,fill .15s ease}
.eqg .pulse-ring{pointer-events:none}
.eqg .nt{font-size:11.5px;font-weight:700;text-anchor:middle;pointer-events:none;font-variant-numeric:tabular-nums}
.eqg .hit{cursor:grab;outline:none}.eqg .hit:active{cursor:grabbing}.eqg .hit:focus-visible{stroke:var(--text);stroke-width:2}
.eq-hud{position:absolute;top:10px;right:12px;display:inline-flex;flex-wrap:wrap;align-items:center;gap:8px;padding:5px 12px;border-radius:999px;background:color-mix(in srgb,var(--panel) 92%,transparent);backdrop-filter:blur(6px);border:1px solid var(--line);font-size:12px;font-variant-numeric:tabular-nums;pointer-events:none}
.eq-hud b{color:var(--text)}
.eq-hud .hud-gain{color:var(--acc);font-weight:700}
.eq-hud .hud-cursor{color:var(--mute);font-size:11.5px}
.hud-dot,.bdot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.bands{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(190px,100%),1fr));gap:10px}
.band{display:flex;flex-direction:column;gap:8px;padding:12px;cursor:pointer;background:var(--bg);border:1px solid var(--line);border-radius:12px;transition:border-color .15s,transform .15s}
.band:hover{border-color:color-mix(in srgb,var(--bcol,var(--acc)) 65%,var(--line))}
.band.sel{border-color:var(--bcol,var(--acc));box-shadow:0 0 0 1px color-mix(in srgb,var(--bcol,var(--acc)) 28%,transparent)}
.band-head{display:flex;align-items:center;gap:7px}
.band .sl{grid-template-columns:38px 1fr 62px;gap:6px}
.band .sl b{grid-column:auto;text-align:right;font-size:12px}
input:disabled{opacity:.35}
.more summary{cursor:pointer;color:var(--mute);font-size:13px}
.more>div{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
.rec{background:#d6453d;border-color:#d6453d;color:#fff}
.by{margin-left:6px;font-size:.55em;font-weight:500;color:var(--acc);white-space:nowrap}
.keys{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr));gap:10px}
.kbox{display:flex;flex-direction:column;gap:2px;padding:12px;background:var(--bg);border:1px solid var(--line);border-radius:12px}
.kbox.act{border-color:var(--acc)}.kbox b{font-size:20px}
.dict-box{display:flex;flex-direction:column;gap:12px;padding:14px;border-radius:12px;background:var(--bg);border:1px solid var(--line)}
.dict-top{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
.dict-summary{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;padding:10px 12px;border-radius:10px;background:var(--panel);border:1px solid var(--line)}
.dict-summary b{font-size:16px;color:var(--acc)}
.dict-pills{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.dpill{display:inline-flex;align-items:baseline;gap:5px;padding:4px 9px;border-radius:8px;background:var(--bg);border:1px solid var(--line);font-size:12.5px}
.dpill.root{border-color:var(--acc);background:color-mix(in srgb,var(--acc) 16%,var(--bg));color:var(--acc)}
.dpill small{font-size:10.5px;color:var(--mute)}
.fretboard-wrap{overflow-x:auto;padding-bottom:4px}
.fret-grid{display:grid;grid-template-columns:68px repeat(var(--fret-cols,6),minmax(54px,1fr));min-width:390px;background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.fret-corner,.fret-num,.fret-str-lbl{display:flex;align-items:center;justify-content:center;padding:6px 4px;font-size:11.5px;font-weight:600;color:var(--mute);background:color-mix(in srgb,var(--bg) 70%,var(--panel));border-bottom:1px solid var(--line);border-right:1px solid var(--line)}
.fret-row-group{display:contents}
.fret-cell{position:relative;display:flex;align-items:center;justify-content:center;min-height:42px;border-bottom:1px solid var(--line);border-right:1px solid color-mix(in srgb,var(--line) 65%,transparent)}
.fret-cell.open-col{border-right:2.5px solid var(--mute);background:color-mix(in srgb,var(--bg) 45%,transparent)}
.fret-cell.hit{background:color-mix(in srgb,var(--acc) 10%,transparent)}
.fret-cell.root{background:color-mix(in srgb,var(--acc) 22%,transparent)}
.fret-dot{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:var(--acc);color:var(--bg);line-height:1.05;font-variant-numeric:tabular-nums}
.fret-cell:not(.root) .fret-dot{background:color-mix(in srgb,var(--acc) 24%,var(--bg));color:var(--text);border:1.5px solid var(--acc)}
.fret-dot b{font-size:11.5px;font-weight:700}
.fret-dot small{font-size:9px;opacity:.85}
.fret-empty{color:color-mix(in srgb,var(--mute) 35%,transparent);font-size:12px}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chips button{flex-direction:column;gap:0;align-items:center;padding:5px 10px;min-width:58px}
.chips button small{font-size:11px;color:inherit;opacity:.75}
.app{padding-left:max(16px,env(safe-area-inset-left));padding-right:max(16px,env(safe-area-inset-right));padding-bottom:max(60px,calc(env(safe-area-inset-bottom) + 24px))}
@media(min-width:1400px){.app{font-size:16px}.spec{height:210px}.wave{height:100px}}
@media(min-width:561px) and (max-width:1023px){
  main{grid-template-columns:repeat(2,minmax(0,1fr))}
  .spec{height:170px}
}
@media(max-width:560px){
  .app{padding-top:max(14px,env(safe-area-inset-top))}
  header{flex-direction:column;align-items:stretch;gap:12px;margin-bottom:12px}
  h1{font-size:19px}
  .sl{grid-template-columns:76px 1fr}.sl b{grid-column:1/-1;text-align:left}.card{padding:14px}
  nav{margin-bottom:12px}nav button{flex:1;padding:10px}
  .seg{display:flex;width:100%}
  .seg button{flex:1 1 auto;justify-content:center;padding:8px 6px;font-size:13px}
  .slots{grid-template-columns:1fr}
  .wave{height:72px}
  .spec{height:140px;gap:6px}.bar span{font-size:10px}
  .row>.play{flex:1 1 100%;justify-content:center}
  .row .time{margin-left:auto}
  .meter.grow,.txt{min-width:100%}
  .notes li{flex-wrap:wrap}
}
@media(max-height:480px) and (orientation:landscape){.app{padding-top:10px}.spec{height:110px}.wave{height:60px}}
@media(pointer:coarse){
  button{min-height:44px}.seg button{min-height:40px}.notes li button{min-height:36px}
  input[type=range]{height:8px}
  input[type=range]::-webkit-slider-thumb{width:26px;height:26px}
  input[type=range]::-moz-range-thumb{width:20px;height:20px}
  input[type=checkbox]{width:22px;height:22px}
}
@media(prefers-reduced-motion:reduce){.logo i,.fill,.tuner-needle{animation:none!important;transition:none}}`

