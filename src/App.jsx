// DIY Studio & Stage Console v4.1  —  Vite + React + lucide-react + Web Audio API
import { useEffect, useRef, useState } from 'react'
import { Play, Pause, Upload, Scissors, Copy, Trash2, Repeat, Download, StickyNote } from 'lucide-react'

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

/* ---------- Audio engine ---------- */
function createEngine() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' }) // anti-kresek IEM
  const bq = (type, f, q = 0.707) => { const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x }
  const eq = [bq('lowshelf', 200), bq('peaking', 1000, 0.8), bq('highshelf', 4000)]
  eq[0].connect(eq[1]); eq[1].connect(eq[2])
  const gA = ctx.createGain(), gB = ctx.createGain(), bus = ctx.createGain()
  eq[2].connect(gA); gA.connect(bus); gB.connect(bus)

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
  mg.connect(sHp); sHp.connect(sLp); sLp.connect(dHp); dHp.connect(dLp); dLp.connect(dLs); dLs.connect(an); an.connect(master); master.connect(ctx.destination)

  // ambient noise (langsung ke output, tidak ikut fade transport)
  const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0)
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1
  const ns = ctx.createBufferSource(); ns.buffer = nb; ns.loop = true
  const nFilter = bq('bandpass', 1400, 0.35), nGain = ctx.createGain(), lfo = ctx.createOscillator(), lfoG = ctx.createGain()
  nGain.gain.value = 0; lfo.frequency.value = 0.25
  ns.connect(nFilter); nFilter.connect(nGain); nGain.connect(ctx.destination)
  lfo.connect(lfoG); lfoG.connect(nGain.gain); ns.start(); lfo.start()

  master.gain.value = 1
  return { ctx, eq, gA, gB, master, mx, anL, anR, an, sHp, sLp, dHp, dLp, dLs, nFilter, nGain, lfoG }
}

/* ---------- Komponen kecil ---------- */
const Card = ({ title, children, wide }) => (
  <section className={`card${wide ? ' wide' : ''}`}><h2>{title}</h2>{children}</section>
)
const Slider = ({ label, value, onChange, min = 0, max = 1, step = 0.01, show }) => (
  <label className="sl"><span>{label}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)}
      style={{ '--p': `${((value - min) / (max - min)) * 100}%` }} />
    <b>{show ?? value}</b></label>
)
const Seg = ({ value, options, onChange }) => (
  <div className="seg">{options.map(([k, l]) => <button key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}</div>
)

/* ---------- App ---------- */
export default function App() {
  const [theme, setTheme] = useState('midnight')
  const [tab, setTab] = useState(1)
  const [ready, setReady] = useState(false)
  const [files, setFiles] = useState({ A: null, B: null })
  const [active, setActive] = useState('A')
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [vol, setVol] = useState({ A: 0.8, B: 0.8 })
  const [loop, setLoop] = useState({ a: null, b: null, on: false })
  const [rate, setRate] = useState(1)
  const [eqv, setEqv] = useState([0, 0, 0])
  const [device, setDevice] = useState('flat')
  const [solo, setSolo] = useState('off')
  const [ch, setCh] = useState('stereo')
  const [vocalRm, setVocalRm] = useState(false)
  const [spot, setSpot] = useState(false)
  const [noise, setNoise] = useState({ mode: 'off', level: 0.4 })
  const [punk, setPunk] = useState(true)
  const [meters, setMeters] = useState({ bands: [-90, -90, -90, -90, -90], peak: -120, corr: 0 })
  const [notes, setNotes] = useState([])
  const [noteText, setNoteText] = useState('')
  const [promoLen, setPromoLen] = useState(30)
  const [promoStart, setPromoStart] = useState(null) // null = otomatis (Loop A, atau posisi putar)
  const [checks, setChecks] = useState(() => { try { return JSON.parse(localStorage.getItem('cmb-checks')) || [] } catch { return [] } })
  const [msg, setMsg] = useState('')
  const [vw, setVw] = useState(0) // memicu gambar ulang waveform saat layar berubah

  const eng = useRef(null), ps = useRef({ src: null, off: 0, t: 0, rate: 1 }), posRef = useRef(0)
  const S = useRef({}), smooth = useRef([-90, -90, -90, -90, -90]), canvas = useRef(null), seekEl = useRef(null)
  S.current = { ...S.current, files, active, loop, rate, playing }

  const ensure = () => {
    if (!eng.current) { eng.current = createEngine(); setReady(true) }
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
    src.connect(s.active === 'A' ? e.eq[0] : e.gB)
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
  const load = async (slot, file) => {
    if (!file) return
    const e = ensure()
    flash(`Membaca ${file.name}…`)
    try {
      const buf = await e.ctx.decodeAudioData(await file.arrayBuffer())
      const lufs = estimateLufs(buf)
      const info = { name: file.name, buf, peaks: waveformPeaks(buf), bpm: detectBpm(buf), lufs, norm: Math.min(1, 10 ** ((-14 - lufs) / 20)) }
      setFiles(f => ({ ...f, [slot]: info }))
      if (!S.current.files[active]) { setActive(slot); S.current.active = slot }
      flash(`${file.name} siap · ${info.bpm ?? '?'} BPM`)
    } catch { flash('File tidak bisa dibaca. Coba WAV / MP3.') }
  }

  /* ----- sinkron parameter audio ----- */
  const set = (p, v, tc = 0.02) => p.setTargetAtTime(v, eng.current.ctx.currentTime, tc)
  useEffect(() => {
    if (!ready) return
    const e = eng.current
    set(e.gA.gain, vol.A * (spot && files.A ? files.A.norm : 1))
    set(e.gB.gain, vol.B * (spot && files.B ? files.B.norm : 1))
  }, [vol, spot, files, ready])
  useEffect(() => { if (ready) eqv.forEach((g, i) => set(eng.current.eq[i].gain, g)) }, [eqv, ready])
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
          <div><h1>DIY Studio &amp; Stage Console</h1><small>v4.1 · cek mix band</small></div>
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
                <Slider label="Gain" value={vol[x]} onChange={v => setVol(o => ({ ...o, [x]: v }))} show={`${Math.round(vol[x] * 100)}%`} />
              </div>))}
          </div>
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
          <Slider label="Pitch & Speed" min={0.75} max={1.25} step={0.01} value={rate} onChange={changeRate}
            show={`${rate.toFixed(2)}× (${semis >= 0 ? '+' : ''}${semis.toFixed(1)} st)`} />
          <small className="hint">Pitch dan kecepatan berubah bersamaan, seperti memutar kaset.</small>
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

        <Card title="Monitoring">
          <p className="lbl">Simulasi perangkat</p>
          <Seg value={device} onChange={setDevice} options={Object.entries(DEVICES).map(([k, v]) => [k, v.n])} />
          <p className="lbl">Isolasi band</p>
          <Seg value={solo} onChange={setSolo} options={[['off', 'Off'], ['low', 'Solo Low'], ['mid', 'Solo Mid'], ['high', 'Solo High']]} />
          <p className="lbl">Kanal</p>
          <Seg value={ch} onChange={setCh} options={[['stereo', 'Stereo'], ['mono', 'Mono / Mid'], ['side', 'Solo Side']]} />
          <label className="chk"><input type="checkbox" checked={vocalRm} onChange={e => setVocalRm(e.target.checked)} /> Vocal Remover (center cancel; bass &amp; kick ikut berkurang)</label>
          <label className="chk"><input type="checkbox" checked={spot} onChange={e => setSpot(e.target.checked)} /> Normalisasi Spotify −14 LUFS (estimasi)</label>
        </Card>

        <Card title="Mastering EQ · Track A">
          {['Low', 'Mid', 'High'].map((n, i) => (
            <Slider key={n} label={n} min={-6} max={6} step={0.5} value={eqv[i]} onChange={v => setEqv(e => e.map((x, j) => (j === i ? v : x)))} show={`${eqv[i] > 0 ? '+' : ''}${eqv[i]} dB`} />))}
          <button onClick={() => setEqv([0, 0, 0])}>Reset EQ</button>
        </Card>

        <Card title="Simulasi Kebisingan">
          <Seg value={noise.mode} onChange={m => setNoise(n => ({ ...n, mode: m }))} options={[['off', 'Off'], ['cafe', 'Kafe'], ['street', 'Jalanan']]} />
          <Slider label="Level" value={noise.level} onChange={v => setNoise(n => ({ ...n, level: v }))} show={`${Math.round(noise.level * 100)}%`} />
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
`
