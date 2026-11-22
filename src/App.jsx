// DIY Studio & Stage Console by. Ares  v4.3  —  Vite + React + lucide-react + Web Audio API
import { useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, Upload, Scissors, Copy, Trash2, Repeat, Download, StickyNote, Mic, Link2 } from 'lucide-react'

/* ---------- Konstanta ---------- */
const THEMES = {
  midnight: { n: 'Midnight Blue', bg: '#0b1220', panel: '#121b2e', line: '#223152', text: '#e6ecf8', mute: '#8a99b8', acc: '#5aa2ff' },
  crimson: { n: 'Crimson Rock', bg: '#140a0b', panel: '#1e1214', line: '#3a2226', text: '#f6e9e9', mute: '#b39393', acc: '#ff4d4f' },
  emerald: { n: 'Emerald Studio', bg: '#08130f', panel: '#0f1d17', line: '#1f3a2e', text: '#e4f4ec', mute: '#86a898', acc: '#2fd08a' },
}
const BANDS = [['Sub', 20, 60], ['Bass', 60, 250], ['Low-Mid', 250, 2000], ['High-Mid', 2000, 6000], ['Treble', 6000, 16000]]
const PUNK_TARGET = [-3, 2, 0, 3, 1] // dB relatif terhadap rata-rata spektrum (kurva target punk / alt-rock)
const DEVICES = {
  flat: { n: 'Studio Flat', hp: 10, lp: 20000, ls: 0 },
  phone: { n: 'Speaker HP', hp: 450, lp: 7500, ls: -4 },
  car: { n: 'Audio Mobil', hp: 30, lp: 12000, ls: 7 },
  live: { n: 'Sound Live', hp: 70, lp: 9000, ls: 3 },
}
const SOLO = { off: [10, 20000], low: [10, 250], mid: [250, 4000], high: [4000, 20000] }
const MATRIX = { // [outL<-L, outL<-R, outR<-L, outR<-R]
  stereo: [1, 0, 0, 1], mono: [.5, .5, .5, .5], side: [.5, -.5, .5, -.5],
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
  flat: ['Flat', [0, 0, 0, 0, 0, 0]], punk: ['Punk Boost', [2, 1, -2, 3, 2, 1]], vocal: ['Vokal Jernih', [-2, -1, -2, 3, 2, 0]],
  bass: ['Bass Penuh', [5, 3, 0, -1, 0, 0]], smile: ['Smile', [4, 1, -2, -1, 2, 4]],
}
const FMIN = 20, FMAX = 20000, GR = 12 // rentang frekuensi (Hz) dan gain (±dB)
const fmtHz = f => (f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 0 : 1)} kHz` : `${Math.round(f)} Hz`)
const fx = f => Math.log(f / FMIN) / Math.log(FMAX / FMIN)

let respCtx
function eqResponse(bands, n = 140) { // kurva respons gabungan semua band (dB)
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

function estimateLufs(buf) { // perkiraan kasar berbasis RMS (bukan K-weighted penuh)
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

/* ---------- Kunci, chord & pitch shifter ---------- */
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const KP = { // profil kunci Krumhansl-Schmuckler
  maj: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
  min: [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
}
const mod12 = n => ((n % 12) + 12) % 12
const keyName = (k, t = 0) => `${NOTES[mod12(k.root + t)]} ${k.mode === 'maj' ? 'mayor' : 'minor'}`
const relKey = k => ({ root: k.mode === 'maj' ? (k.root + 9) % 12 : (k.root + 3) % 12, mode: k.mode === 'maj' ? 'min' : 'maj' })
const tChord = (name, t) => { const m = name.match(/^([A-G]#?)(.*)$/); return m ? NOTES[mod12(NOTES.indexOf(m[1]) + t)] + m[2] : name }

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
const CHORD_TPL = [0, 1].flatMap(m => NOTES.map((_, r) => {
  const t = new Array(12).fill(0); (m ? [0, 3, 7] : [0, 4, 7]).forEach((x, j) => { t[(r + x) % 12] = j === 1 ? 0.85 : 1 })
  return { name: NOTES[r] + (m ? 'm' : ''), t, n: Math.hypot(...t) }
}))

function analyzeHarmony(buf) { // perkiraan kunci & rangkaian chord (triad mayor/minor)
  const D = 4, sr = buf.sampleRate / D, N = 8192, hop = 4096
  const c0 = buf.getChannelData(0), c1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : c0
  const len = Math.floor(c0.length / D), mono = new Float32Array(len)
  for (let i = 0; i < len; i++) { let s = 0; for (let k = 0; k < D; k++) s += c0[i * D + k] + c1[i * D + k]; mono[i] = s / (2 * D) }
  const lo = Math.ceil(65 * N / sr), hi = Math.floor(2000 * N / sr), pc = new Int8Array(hi + 1)
  for (let k = lo; k <= hi; k++) pc[k] = mod12(Math.round(12 * Math.log2((k * sr / N) / 440)) + 9)
  const win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N))
  const re = new Float64Array(N), im = new Float64Array(N), total = new Array(12).fill(0), frames = []
  for (let s = 0; s + N <= len; s += hop) {
    for (let i = 0; i < N; i++) { re[i] = mono[s + i] * win[i]; im[i] = 0 }
    fft(re, im)
    const ch = new Array(12).fill(0); let e = 0
    for (let k = lo; k <= hi; k++) { const m = Math.sqrt(Math.hypot(re[k], im[k])); ch[pc[k]] += m; e += m }
    if (e < 0.5) { frames.push(null); continue }
    const norm = ch.map(v => v / e); norm.forEach((v, i) => { total[i] += v })
    frames.push({ t: Math.max(0, (s + N / 2) / sr - 0.19), ch: norm })
  }
  let key = { root: 0, mode: 'maj', conf: 'rendah' }, bestR = -2
  if (frames.some(Boolean)) {
    for (const mode of ['maj', 'min']) for (let r = 0; r < 12; r++) {
      const c = pearson(total, total.map((_, i) => KP[mode][mod12(i - r)]))
      if (c > bestR) { bestR = c; key = { root: r, mode } }
    }
    key.conf = bestR > 0.75 ? 'tinggi' : bestR > 0.6 ? 'sedang' : 'rendah'
  }
  const lab = frames.map(f => {
    if (!f) return -1
    let best = -1, bs = -1; const cn = Math.hypot(...f.ch) || 1
    CHORD_TPL.forEach((c, i) => { let d = 0; for (let k = 0; k < 12; k++) d += f.ch[k] * c.t[k]; d /= cn * c.n; if (d > bs) { bs = d; best = i } })
    return best
  })
  const sm = lab.map((l, i) => (i && i < lab.length - 1 && lab[i - 1] === lab[i + 1] ? lab[i - 1] : l))
  const runs = []
  sm.forEach((l, i) => { const last = runs[runs.length - 1]; if (last && last.l === l) last.n++; else runs.push({ l, n: 1, t: frames[i]?.t ?? 0 }) })
  const chords = []
  runs.filter(r => r.l >= 0 && (r.n >= 2 || runs.length === 1)).forEach(r => {
    const name = CHORD_TPL[r.l].name
    if (!chords.length || chords[chords.length - 1].name !== name) chords.push({ t: r.t, name })
  })
  return { key, chords }
}

/* ---------- Audio engine ---------- */
function createEngine() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' }) // anti-kresek IEM
  const bq = (type, f, q = 0.707) => { const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x }
  const mkEq = () => { const c = EQ_DEFAULT.map(b => bq(b.type, b.f, b.q)); c.forEach((n, i) => { if (i) c[i - 1].connect(n) }); return c }
  const eqA = mkEq(), eqB = mkEq()
  const gA = ctx.createGain(), gB = ctx.createGain(), bus = ctx.createGain()
  eqA[5].connect(gA); eqB[5].connect(gB); 
  const pre = ctx.createGain(), direct = ctx.createGain(), shifted = ctx.createGain() // jalur langsung / jalur transpose
  shifted.gain.value = 0
  gA.connect(pre); gB.connect(pre); pre.connect(direct); direct.connect(bus); shifted.connect(bus)

  // analisis stereo (korelasi) — pre monitor
  const sp = ctx.createChannelSplitter(2), anL = ctx.createAnalyser(), anR = ctx.createAnalyser()
  anL.fftSize = anR.fftSize = 2048
  bus.connect(sp); sp.connect(anL, 0); sp.connect(anR, 1)

  // matriks kanal (Stereo / Mono / Side / Vocal Remover)
  const sp2 = ctx.createChannelSplitter(2), mg = ctx.createChannelMerger(2), mx = []
  bus.connect(sp2)
  for (let o = 0; o < 2; o++) for (let i = 0; i < 2; i++) { const g = ctx.createGain(); sp2.connect(g, i); g.connect(mg, 0, o); mx.push(g) }

  // solo band → simulasi perangkat → analyser → master
  const sHp = bq('highpass', 10), sLp = bq('lowpass', 20000), dHp = bq('highpass', 10), dLp = bq('lowpass', 20000), dLs = bq('lowshelf', 120)
  const an = ctx.createAnalyser(); an.fftSize = 4096; an.smoothingTimeConstant = 0.8
  const master = ctx.createGain()
  mg.connect(sHp); sHp.connect(sLp); sLp.connect(dHp); dHp.connect(dLp); dLp.connect(dLs); dLs.connect(an); an.connect(master)
  const outVol = ctx.createGain(), limDirect = ctx.createGain(), limComp = ctx.createGain(), comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -6; comp.knee.value = 0; comp.ratio.value = 20; comp.attack.value = 0.002; comp.release.value = 0.15
  limDirect.gain.value = 0 // pelindung telinga (limiter) aktif secara default
  master.connect(outVol); outVol.connect(limDirect); limDirect.connect(ctx.destination)
  outVol.connect(comp); comp.connect(limComp); limComp.connect(ctx.destination)

  // ambient noise (langsung ke output, tidak ikut fade transport)
  const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0)
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1
  const ns = ctx.createBufferSource(); ns.buffer = nb; ns.loop = true
  const nFilter = bq('bandpass', 1400, 0.35), nGain = ctx.createGain(), lfo = ctx.createOscillator(), lfoG = ctx.createGain()
  nGain.gain.value = 0; lfo.frequency.value = 0.25
  ns.connect(nFilter); nFilter.connect(nGain); nGain.connect(ctx.destination)
  lfo.connect(lfoG); lfoG.connect(nGain.gain); ns.start(); lfo.start()

  master.gain.value = 1
  return { ctx, pre, direct, shifted, outVol, limDirect, limComp, eqA, eqB, gA, gB, master, mx, anL, anR, an, sHp, sLp, dHp, dLp, dLs, nFilter, nGain, lfoG }
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

function EqPanel({ bands, setBands, eqOn, setEqOn, scope, setScope, sel, setSel, flash }) {
  const W = 720, H = 280
  const svg = useRef(null), drag = useRef(null)
  const X = f => fx(f) * W, Y = g => H / 2 - (g / GR) * (H / 2)
  const upd = (i, p) => setBands(b => b.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const { freqs, tot } = useMemo(() => eqResponse(bands), [bands])
  const line = 'M' + Array.from(freqs, (f, k) => `${X(f).toFixed(1)},${Y(Math.max(-GR, Math.min(GR, tot[k]))).toFixed(1)}`).join('L')
  const move = e => {
    if (drag.current == null) return
    const r = svg.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))
    upd(drag.current, { f: Math.round(FMIN * Math.pow(FMAX / FMIN, x)), g: Math.round((GR - y * 2 * GR) * 10) / 10 })
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
  return (<>
    <div className="row">
      <button className={eqOn ? 'on' : ''} onClick={() => setEqOn(!eqOn)}>{eqOn ? 'EQ ON' : 'EQ OFF'}</button>
      <small>Terapkan ke</small>
      <Seg value={scope} onChange={setScope} options={[['A', 'Track A'], ['B', 'Track B'], ['AB', 'Keduanya']]} />
    </div>
    <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className={`eqg${eqOn ? '' : ' off'}`} onPointerMove={move}
      onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
      {[50, 100, 200, 500, 1000, 2000, 5000, 10000].map(f => (
        <g key={f}><line x1={X(f)} x2={X(f)} y1="0" y2={H} className="gl" /><text x={X(f) + 3} y={H - 5} className="gt">{f >= 1000 ? f / 1000 + 'k' : f}</text></g>))}
      {[-12, -6, 0, 6, 12].map(g => (
        <g key={g}><line x1="0" x2={W} y1={Y(g)} y2={Y(g)} className={g === 0 ? 'gl z' : 'gl'} /><text x="4" y={Y(g) - 3} className="gt">{g > 0 ? '+' + g : g}</text></g>))}
      <path d={`${line}L${W},${Y(0)}L0,${Y(0)}Z`} className="ar" />
      <path d={line} className="cv" />
      {bands.map((b, i) => (
        <g key={i}>
          <circle cx={X(b.f)} cy={Y(b.g)} r={sel === i ? 14 : 11} className={`node${sel === i ? ' sel' : ''}`} />
          <text className={`nt${sel === i ? ' sel' : ''}`} x={X(b.f)} y={Y(b.g) + 4}>{i + 1}</text>
          <circle cx={X(b.f)} cy={Y(b.g)} r="26" fill="transparent" className="hit" tabIndex={0} role="slider"
            aria-label={`Band ${i + 1}: ${fmtHz(b.f)}, ${b.g} dB`} aria-valuenow={b.g}
            onPointerDown={e => { e.preventDefault(); drag.current = i; setSel(i); svg.current.setPointerCapture(e.pointerId) }}
            onFocus={() => setSel(i)} onKeyDown={e => key(e, i)} onDoubleClick={() => upd(i, { g: 0 })} />
        </g>))}
    </svg>
    <small className="hint">Geser titik: kiri-kanan mengatur frekuensi, atas-bawah mengatur gain. Klik dua kali untuk mengembalikan gain band itu ke 0. Di keyboard, pakai tombol panah.</small>
    <div className="bands">
      {bands.map((b, i) => (
        <div key={i} className={`band${sel === i ? ' sel' : ''}`} onClick={() => setSel(i)}>
          <b>Band {i + 1} · {fmtHz(b.f)}</b>
          <Slider label="Freq" min={0} max={1} step={0.002} value={fx(b.f)} show={fmtHz(b.f)}
            onChange={v => upd(i, { f: Math.round(FMIN * Math.pow(FMAX / FMIN, v)) })} />
          <Slider label="Gain" min={-GR} max={GR} step={0.5} value={b.g} show={`${b.g > 0 ? '+' : ''}${b.g} dB`} onChange={v => upd(i, { g: v })} />
          <Slider label="Q" min={0.3} max={6} step={0.1} value={b.q} show={EQ_DEFAULT[i].type === 'peaking' ? b.q.toFixed(1) : 'tetap'}
            disabled={EQ_DEFAULT[i].type !== 'peaking'} onChange={v => upd(i, { q: v })} />
        </div>))}
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
  const [urls, setUrls] = useState({ A: '', B: '' })
  const [recSlot, setRecSlot] = useState(null)
  const [tr, setTr] = useState({ A: 0, B: 0 }) // transpose per track (semiton)
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
  const [punk, setPunk] = useState(false) // kurva target tidak menyala otomatis
  const [meters, setMeters] = useState({ bands: [-90, -90, -90, -90, -90], peak: -120, corr: 0 })
  const [notes, setNotes] = useState([])
  const [noteText, setNoteText] = useState('')
  const [promoLen, setPromoLen] = useState(30)
  const [promoStart, setPromoStart] = useState(null) // null = otomatis (Loop A, atau posisi putar)
  const [checks, setChecks] = useState(() => { try { return JSON.parse(localStorage.getItem('cmb-checks')) || [] } catch { return [] } })
  const [msg, setMsg] = useState('')
  const [vw, setVw] = useState(0) // memicu gambar ulang waveform saat layar berubah

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
    e.master.gain.linearRampToValueAtTime(0, t + 0.04) // fade-out 40ms
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
    e.master.gain.linearRampToValueAtTime(1, t + 0.04) // fade-in 40ms
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
      setTimeout(() => { // analisis kunci & chord di belakang layar
        const harm = analyzeHarmony(buf)
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
    const m = MATRIX[vocalRm ? 'side' : ch] // Vocal Remover = Center Cancel (L − R)
    eng.current.mx.forEach((g, i) => set(g.gain, m[i], 0.01))
  }, [ch, vocalRm, ready])
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
  useEffect(() => { // metronom
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
  keyRef.current = e => { // pintasan keyboard
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

  /* ----- meter & posisi (rAF) ----- */
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
        const t = new Float32Array(e.an.fftSize); e.an.getFloatTimeDomainData(t)
        let pk = 0; for (const x of t) pk = Math.max(pk, Math.abs(x))
        const l = new Float32Array(2048), r = new Float32Array(2048); e.anL.getFloatTimeDomainData(l); e.anR.getFloatTimeDomainData(r)
        let lr = 0, ll = 0, rr = 0; for (let i = 0; i < 2048; i++) { lr += l[i] * r[i]; ll += l[i] * l[i]; rr += r[i] * r[i] }
        setMeters({ bands: [...smooth.current], peak: db(pk), corr: ll && rr ? lr / Math.sqrt(ll * rr) : 0 })
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
  const harm = cur?.harm, chords = harm?.chords || [], trA = tr[active]
  let ci = -1; chords.forEach((c, i) => { if (c.t <= pos) ci = i })
  const c0 = Math.max(0, ci - 2)

  /* ----- render ----- */
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
          <div><h1>DIY Studio &amp; Stage Console <span className="by">by. Ares</span></h1><small>v4.3 · cek mix band</small></div>
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

        <Card title="Kunci, Chord & Transpose" wide>
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
          {chords.length > 0 ? (<>
            <div className="now"><span>{ci >= 0 ? tChord(chords[ci].name, trA) : '—'}</span>
              <small>berikutnya: {chords[ci + 1] ? tChord(chords[ci + 1].name, trA) : '—'}</small></div>
            <div className="chips">{chords.slice(c0, c0 + 12).map((c, k) => (
              <button key={c0 + k} className={c0 + k === ci ? 'on' : ''} onClick={() => seek(c.t)}>{tChord(c.name, trA)}<small>{fmt(c.t)}</small></button>))}</div>
          </>) : <small className="hint">{harm ? 'Chord tidak terdeteksi pada audio ini.' : 'Unggah lagu untuk melihat kunci dan chord.'}</small>}
          <small className="hint">Kunci dan chord adalah perkiraan otomatis (chord mayor/minor). Hasil terbaik pada lagu dengan nada jelas; gitar yang sangat distorsi bisa kurang akurat. Nama chord ikut berubah sesuai transpose.</small>
        </Card>

        <Card title="Spektrum & Meter" wide>
          <div className="spec">
            {BANDS.map(([n], i) => (
              <div key={n} className="bar"><div className="fill" style={{ clipPath: `inset(${100 - pct(meters.bands[i])}% 0 0 0)` }} />
                {punk && <i className="tgt" style={{ bottom: `${pct(mean + PUNK_TARGET[i])}%` }} />}<span>{n}</span></div>))}
          </div>
          <label className="chk"><input type="checkbox" checked={punk} onChange={e => setPunk(e.target.checked)} /> Tampilkan kurva target Punk / Alt-Rock (garis penanda)</label>
          <div className="row">
            <div className="meter"><span>Peak</span><b className={meters.peak > -1 ? 'warn' : ''}>{meters.peak > -119 ? meters.peak.toFixed(1) : '−∞'} dB</b></div>
            <div className="meter grow"><span>Korelasi stereo</span>
              <div className="corr"><i style={{ left: `${(meters.corr + 1) * 50}%` }} /></div>
              <b>{meters.corr.toFixed(2)}</b></div>
          </div>
        </Card>

        <Card title="Equalizer 6-Band" wide>
          <EqPanel bands={bands} setBands={setBands} eqOn={eqOn} setEqOn={setEqOn} scope={eqScope} setScope={setEqScope}
            sel={selBand} setSel={setSelBand} flash={flash} />
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

/* ---------- Gaya ---------- */
const CSS = `
.app{min-height:100vh;color:var(--text);font:15px/1.5 "Segoe UI",system-ui,-apple-system,sans-serif;padding:20px 16px 56px;background:radial-gradient(900px 420px at 50% -140px,color-mix(in srgb,var(--acc) 24%,transparent),transparent),var(--bg)}
.app *{box-sizing:border-box}
header{display:flex;flex-wrap:wrap;gap:14px;justify-content:space-between;align-items:center;max-width:1100px;margin:0 auto 18px}
.brand{display:flex;align-items:center;gap:12px}
.logo{display:flex;align-items:flex-end;gap:3px;width:38px;height:38px;padding:8px;border-radius:11px;background:var(--panel);border:1px solid var(--line);box-shadow:0 0 22px -2px color-mix(in srgb,var(--acc) 45%,transparent)}
.logo i{flex:1;height:40%;background:var(--acc);border-radius:2px}
.logo i:nth-child(2){height:90%}.logo i:nth-child(3){height:62%}
.logo.live i{animation:eq .7s ease-in-out infinite alternate}
.logo.live i:nth-child(2){animation-delay:.2s}.logo.live i:nth-child(3){animation-delay:.4s}
@keyframes eq{to{height:96%}}
h1{font-size:22px;line-height:1.1;margin:0;font-weight:700;letter-spacing:-.015em}
header small{color:var(--mute)}
h2{font-size:16px;margin:0;font-weight:650;letter-spacing:-.005em}
nav{display:flex;gap:6px;max-width:1100px;margin:0 auto 18px;border-bottom:1px solid var(--line)}
nav button{border:0;border-bottom:2px solid transparent;border-radius:8px 8px 0 0;margin-bottom:-1px;padding:10px 16px;color:var(--mute);background:transparent}
nav button.on{background:transparent;color:var(--text);border-bottom-color:var(--acc);font-weight:600;box-shadow:none}
main{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:16px;max-width:1100px;margin:0 auto}
.card{display:flex;flex-direction:column;gap:12px;padding:18px;border:1px solid var(--line);border-radius:16px;background:linear-gradient(180deg,color-mix(in srgb,var(--panel) 90%,#fff 10%),var(--panel) 60%);box-shadow:0 1px 0 rgba(255,255,255,.05) inset,0 18px 36px -24px #000}
.card.wide{grid-column:1/-1}
button{font:inherit;font-size:14px;display:inline-flex;gap:6px;align-items:center;padding:7px 13px;color:var(--text);background:color-mix(in srgb,var(--panel) 70%,#fff 6%);border:1px solid var(--line);border-radius:9px;cursor:pointer;transition:border-color .15s,background .15s}
button:hover:not(:disabled){border-color:var(--acc)}
button:active:not(:disabled){transform:translateY(1px)}
button:disabled{opacity:.4;cursor:not-allowed}
button.on,button.primary{background:var(--acc);color:var(--bg);border-color:var(--acc);font-weight:600;box-shadow:0 0 18px -4px color-mix(in srgb,var(--acc) 70%,transparent)}
button:focus-visible,input:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.play{border-radius:999px;padding:10px 22px;font-size:15px}
.seg{display:inline-flex;flex-wrap:wrap;gap:4px;padding:4px;align-self:flex-start;background:var(--bg);border:1px solid var(--line);border-radius:12px}
.seg button{background:transparent;border:0;padding:6px 12px;color:var(--mute);box-shadow:none}
.seg button.on{background:var(--acc);color:var(--bg);box-shadow:0 0 14px -4px var(--acc)}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.slots{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:14px}
.slot{display:flex;flex-direction:column;gap:10px;padding:14px;background:var(--bg);border:1px solid var(--line);border-radius:12px;transition:border-color .2s,box-shadow .2s}
.slot.act{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc),0 0 28px -8px var(--acc)}
.sw{justify-content:flex-start;font-weight:600}
.led{width:9px;height:9px;border-radius:50%;background:var(--line)}
.slot.act .led{background:var(--acc);box-shadow:0 0 9px var(--acc)}
.up{display:flex;gap:6px;align-items:center;color:var(--mute);cursor:pointer;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.up:hover{color:var(--text)}
.sl{display:grid;grid-template-columns:92px 1fr 128px;gap:10px;align-items:center}
.sl b{font-weight:500;color:var(--mute);text-align:right;font-size:13px;font-variant-numeric:tabular-nums}
input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:6px;border-radius:3px;background:linear-gradient(90deg,var(--acc) var(--p,50%),var(--line) var(--p,50%))}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:var(--text);border:3px solid var(--acc);box-shadow:0 0 12px -1px var(--acc);cursor:pointer}
input[type=range]::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:var(--text);border:3px solid var(--acc);cursor:pointer}
input[type=checkbox]{accent-color:var(--acc);width:16px;height:16px;margin-top:3px}
.wave{position:relative;height:84px;overflow:hidden;cursor:pointer;background:linear-gradient(180deg,var(--bg),color-mix(in srgb,var(--bg) 92%,var(--acc)));border:1px solid var(--line);border-radius:12px}
.wave canvas{display:block;width:100%;height:100%;opacity:.8}
.pl{position:absolute;top:0;bottom:0;left:0;background:color-mix(in srgb,var(--acc) 14%,transparent);pointer-events:none}
.ph{position:absolute;top:0;bottom:0;width:2px;background:#fff;box-shadow:0 0 10px var(--acc),0 0 2px #fff}
.lp{position:absolute;top:0;bottom:0;background:var(--acc);mix-blend-mode:screen;opacity:.25}
.time{font-variant-numeric:tabular-nums;color:var(--mute);font-size:14px}
.hint,small{color:var(--mute);font-size:13px}
.lbl{margin:6px 0 0;color:var(--mute);font-size:13px}
.chk{display:flex;gap:8px;align-items:flex-start;font-size:14px}
.spec{display:flex;gap:10px;height:180px}
.bar{position:relative;flex:1;overflow:hidden;border:1px solid var(--line);border-radius:10px;background:repeating-linear-gradient(0deg,color-mix(in srgb,var(--line) 75%,transparent) 0 6px,transparent 6px 9px),var(--bg)}
.fill{position:absolute;inset:0;transition:clip-path .08s linear;background:linear-gradient(0deg,var(--acc) 0 62%,#ffd166 84%,#ff5d5d);-webkit-mask:repeating-linear-gradient(0deg,#000 0 6px,transparent 6px 9px);mask:repeating-linear-gradient(0deg,#000 0 6px,transparent 6px 9px)}
.tgt{position:absolute;left:0;right:0;height:0;border-top:2px dashed #fff;box-shadow:0 0 6px rgba(255,255,255,.6)}
.bar span{position:absolute;bottom:5px;left:0;right:0;text-align:center;font-size:12px;font-weight:600;text-shadow:0 0 5px var(--bg),0 0 2px var(--bg)}
.meter{display:flex;gap:10px;align-items:center}.meter.grow{flex:1;min-width:230px}
.meter span{color:var(--mute);font-size:13px}
.meter b{min-width:76px;padding:2px 10px;text-align:center;font-variant-numeric:tabular-nums;background:var(--bg);border:1px solid var(--line);border-radius:7px}
.warn{color:#ff6b6b;border-color:#ff6b6b!important}
.corr{position:relative;flex:1;height:8px;border-radius:4px;background:linear-gradient(90deg,#d6453d,var(--line) 50%,var(--acc))}
.corr i{position:absolute;top:-4px;width:4px;height:16px;border-radius:2px;background:#fff;transform:translateX(-2px);box-shadow:0 0 8px #fff}
.txt{flex:1;min-width:180px;padding:8px 12px;font:inherit;color:var(--text);background:var(--bg);border:1px solid var(--line);border-radius:9px}
.notes,.checks{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.notes li{display:flex;gap:10px;align-items:center;padding:7px 10px;background:var(--bg);border:1px solid var(--line);border-radius:10px}
.notes li span{flex:1}
.notes li button:first-child{padding:2px 9px;color:var(--acc);font-variant-numeric:tabular-nums}
.checks li{padding:10px 12px;background:var(--bg);border:1px solid var(--line);border-radius:10px;transition:border-color .2s}
.checks li:has(input:checked){border-color:var(--acc);color:var(--mute)}
.checks label{display:flex;gap:10px;cursor:pointer}
.toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:9;padding:9px 18px;font-weight:600;color:var(--bg);background:var(--acc);border-radius:10px;box-shadow:0 10px 30px -8px #000}
@media(max-width:560px){.sl{grid-template-columns:76px 1fr}.sl b{grid-column:1/-1;text-align:left}.card{padding:14px}}
@media(prefers-reduced-motion:reduce){.logo i,.fill{animation:none!important;transition:none}}
/* ---- Responsif: PC, tablet, HP ---- */
.app{padding-left:max(16px,env(safe-area-inset-left));padding-right:max(16px,env(safe-area-inset-right));padding-bottom:max(56px,calc(env(safe-area-inset-bottom) + 24px))}
header,nav,main{max-width:1240px}
.card{min-width:0}
main{grid-template-columns:repeat(auto-fit,minmax(min(310px,100%),1fr))}
nav{overflow-x:auto;scrollbar-width:none}
nav button{flex:none;white-space:nowrap}
@media(min-width:1400px){.app{font-size:16px}.spec{height:210px}.wave{height:100px}}
@media(min-width:561px) and (max-width:1023px){
  main{grid-template-columns:repeat(2,minmax(0,1fr))}
  .spec{height:170px}
}
@media(max-width:560px){
  .app{padding-top:max(14px,env(safe-area-inset-top))}
  header{flex-direction:column;align-items:stretch;gap:12px;margin-bottom:12px}
  h1{font-size:19px}
  nav{margin-bottom:12px}nav button{flex:1;padding:11px 10px}
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
/* ---- EQ interaktif, sumber lain, branding ---- */
.eqg{display:block;width:100%;height:auto;touch-action:none;background:var(--bg);border:1px solid var(--line);border-radius:12px}
.eqg.off{opacity:.45}
.eqg .gl{stroke:var(--line);stroke-width:1}.eqg .z{stroke:var(--mute);stroke-dasharray:4 4}
.eqg .gt{fill:var(--mute);font-size:11px}
.eqg .ar{fill:color-mix(in srgb,var(--acc) 18%,transparent)}
.eqg .cv{fill:none;stroke:var(--acc);stroke-width:2.5;stroke-linejoin:round;filter:drop-shadow(0 0 6px var(--acc))}
.eqg .node{fill:var(--bg);stroke:var(--acc);stroke-width:3;pointer-events:none}
.eqg .node.sel{fill:var(--acc)}
.eqg .nt{fill:var(--text);font-size:12px;font-weight:700;text-anchor:middle;pointer-events:none}
.eqg .nt.sel{fill:var(--bg)}
.eqg .hit{cursor:grab;outline:none}.eqg .hit:focus-visible{stroke:var(--text);stroke-width:2}
.bands{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(190px,100%),1fr));gap:10px}
.band{display:flex;flex-direction:column;gap:8px;padding:12px;cursor:pointer;background:var(--bg);border:1px solid var(--line);border-radius:12px}
.band.sel{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc)}
.band .sl{grid-template-columns:38px 1fr 62px;gap:6px}
.band .sl b{grid-column:auto;text-align:right;font-size:12px}
input:disabled{opacity:.35}
.more summary{cursor:pointer;color:var(--mute);font-size:13px}
.more>div{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
.rec{background:#d6453d;border-color:#d6453d;color:#fff}
.by{margin-left:6px;font-size:.55em;font-weight:500;color:var(--acc);white-space:nowrap}
/* ---- Kunci, chord, metronom ---- */
.keys{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr));gap:10px}
.kbox{display:flex;flex-direction:column;gap:2px;padding:12px;background:var(--bg);border:1px solid var(--line);border-radius:12px}
.kbox.act{border-color:var(--acc)}.kbox b{font-size:20px}
.now{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
.now span{font-size:42px;font-weight:700;line-height:1.1;color:var(--acc);letter-spacing:-.02em}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chips button{flex-direction:column;gap:0;align-items:center;padding:5px 10px;min-width:58px}
.chips button small{font-size:11px;color:inherit;opacity:.75}
`
