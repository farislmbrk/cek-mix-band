import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  Upload,
  Volume2,
  Smartphone,
  Car,
  Speaker,
  Headphones,
  Activity,
  Sliders,
  AlertTriangle,
  CheckCircle2,
  Edit3,
  Music,
  Layers,
  RotateCcw
} from 'lucide-react';

const EQ_FREQS = [60, 250, 800, 2500, 6000, 12000];
const EQ_LABELS = ['60Hz', '250Hz', '800Hz', '2.5kHz', '6kHz', '12kHz'];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const EQ_PRESETS = [
  { id: 'flat', label: 'Flat (Default)', gains: [0, 0, 0, 0, 0, 0] },
  { id: 'vocal', label: 'Vocal Clarity', gains: [-2.5, -2.0, 1.5, 4.0, 3.5, 2.0] },
  { id: 'bass', label: 'Bass Boost', gains: [6.5, 3.5, -1.0, 0, 1.0, 1.5] },
  { id: 'rock', label: 'Rock Mix', gains: [4.5, -2.0, 1.5, 3.5, 4.0, 3.0] },
  { id: 'warm', label: 'Warm Studio', gains: [3.0, 2.0, 0.5, -1.5, -2.0, -2.5] },
  { id: 'air', label: 'Bright & Air', gains: [-1.0, -1.0, 0, 2.0, 4.5, 6.0] }
];

const BASIC_CHORD_TEMPLATES = [
  { suffix: '', intervals: [0, 4, 7] },
  { suffix: 'm', intervals: [0, 3, 7] },
  { suffix: '7', intervals: [0, 4, 7, 10] },
  { suffix: 'maj7', intervals: [0, 4, 7, 11] },
  { suffix: 'm7', intervals: [0, 3, 7, 10] },
  { suffix: 'sus4', intervals: [0, 5, 7] },
  { suffix: 'dim', intervals: [0, 3, 6] }
];

const EXTENDED_CHORD_TEMPLATES = [
  ...BASIC_CHORD_TEMPLATES,
  { suffix: 'sus2', intervals: [0, 2, 7] },
  { suffix: '7sus4', intervals: [0, 5, 7, 10] },
  { suffix: 'add9', intervals: [0, 4, 7, 2] },
  { suffix: 'm(add9)', intervals: [0, 3, 7, 2] },
  { suffix: '6', intervals: [0, 4, 7, 9] },
  { suffix: 'm6', intervals: [0, 3, 7, 9] },
  { suffix: '9', intervals: [0, 4, 7, 10, 2] },
  { suffix: 'maj9', intervals: [0, 4, 7, 11, 2] },
  { suffix: 'm9', intervals: [0, 3, 7, 10, 2] },
  { suffix: 'dim7', intervals: [0, 3, 6, 9] },
  { suffix: 'm7b5', intervals: [0, 3, 6, 10] },
  { suffix: 'aug', intervals: [0, 4, 8] }
];

export default function App() {
  const [bandName, setBandName] = useState(() => localStorage.getItem('bandName') || 'DIY STUDIO CONSOLE');
  const [isEditingName, setIsEditingName] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTrack, setActiveTrack] = useState('A');
  const [isMono, setIsMono] = useState(false);
  const [deviceMode, setDeviceMode] = useState('studio');
  const [trackAName, setTrackAName] = useState('Belum ada file Mix Band');
  const [trackBName, setTrackBName] = useState('Belum ada file Referensi');
  const [gainA, setGainA] = useState(1.0);
  const [gainB, setGainB] = useState(0.85);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [freqBars, setFreqBars] = useState([12, 12, 12, 12, 12]);
  const [peakDb, setPeakDb] = useState(-60);

  // Fitur 1: Pemisah Instrumen (Stem / Band Isolator)
  const [stemMode, setStemMode] = useState('full');

  // Fitur 2: Deteksi Chord dengan Opsi Mode Akor (Dasar vs Extended)
  const [chordComplexity, setChordComplexity] = useState('extended'); // 'basic' | 'extended'
  const [chordInfo, setChordInfo] = useState({
    chord: '--',
    confidence: 0,
    bassNote: '--',
    keyEstimate: '--'
  });

  // Fitur 3: Equalizer 6-Band + Preset EQ + Grafik Spektrum di Belakang Kurva
  const [eqGains, setEqGains] = useState([0, 0, 0, 0, 0, 0]);
  const [activeEqPreset, setActiveEqPreset] = useState('flat');
  const [spectrumCurve, setSpectrumCurve] = useState(() => Array(48).fill(0));

  const audioCtxRef = useRef(null);
  const bufferARef = useRef(null);
  const bufferBRef = useRef(null);
  const sourceRef = useRef(null);
  const gainNodeRef = useRef(null);
  const analyserRef = useRef(null);
  const filterLowRef = useRef(null);
  const filterHighRef = useRef(null);
  const stemFilterRef = useRef(null);
  const eqNodesRef = useRef([]);
  const animRef = useRef(null);
  const startTimeRef = useRef(0);
  const offsetRef = useRef(0);

  const chromaHistoryRef = useRef(Array(12).fill(0));
  const chordCandidateRef = useRef({ label: '--', count: 0 });
  const keyHistogramRef = useRef(Array(12).fill(0));
  const chordComplexityRef = useRef(chordComplexity);

  useEffect(() => {
    chordComplexityRef.current = chordComplexity;
  }, [chordComplexity]);

  const initAudio = () => {
    if (!audioCtxRef.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;

      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = 2048;
      analyserRef.current.smoothingTimeConstant = 0.78;

      gainNodeRef.current = ctx.createGain();
      filterLowRef.current = ctx.createBiquadFilter();
      filterHighRef.current = ctx.createBiquadFilter();
      stemFilterRef.current = ctx.createBiquadFilter();

      eqNodesRef.current = EQ_FREQS.map((freq, idx) => {
        const node = ctx.createBiquadFilter();
        node.frequency.setValueAtTime(freq, ctx.currentTime);
        if (idx === 0) node.type = 'lowshelf';
        else if (idx === EQ_FREQS.length - 1) node.type = 'highshelf';
        else {
          node.type = 'peaking';
          node.Q.setValueAtTime(1.4, ctx.currentTime);
        }
        node.gain.setValueAtTime(eqGains[idx] || 0, ctx.currentTime);
        return node;
      });
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  const handleFileUpload = async (e, track) => {
    const file = e.target.files[0];
    if (!file) return;
    initAudio();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioCtxRef.current.decodeAudioData(arrayBuffer);
    chromaHistoryRef.current = Array(12).fill(0);
    keyHistogramRef.current = Array(12).fill(0);

    if (track === 'A') {
      bufferARef.current = audioBuffer;
      setTrackAName(file.name);
      if (activeTrack === 'A') setDuration(audioBuffer.duration);
    } else {
      bufferBRef.current = audioBuffer;
      setTrackBName(file.name);
      if (activeTrack === 'B') setDuration(audioBuffer.duration);
    }
  };

  useEffect(() => {
    if (gainNodeRef.current && audioCtxRef.current) {
      const val = activeTrack === 'A' ? gainA : gainB;
      gainNodeRef.current.gain.setValueAtTime(val, audioCtxRef.current.currentTime);
    }
  }, [gainA, gainB, activeTrack]);

  useEffect(() => {
    if (!filterLowRef.current || !filterHighRef.current || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    if (deviceMode === 'phone') {
      filterLowRef.current.type = 'highpass';
      filterLowRef.current.frequency.setValueAtTime(320, ctx.currentTime);
      filterLowRef.current.gain.setValueAtTime(0, ctx.currentTime);
      filterHighRef.current.type = 'lowpass';
      filterHighRef.current.frequency.setValueAtTime(3800, ctx.currentTime);
      filterHighRef.current.gain.setValueAtTime(0, ctx.currentTime);
    } else if (deviceMode === 'car') {
      filterLowRef.current.type = 'peaking';
      filterLowRef.current.frequency.setValueAtTime(110, ctx.currentTime);
      filterLowRef.current.gain.setValueAtTime(6, ctx.currentTime);
      filterHighRef.current.type = 'lowpass';
      filterHighRef.current.frequency.setValueAtTime(11000, ctx.currentTime);
      filterHighRef.current.gain.setValueAtTime(0, ctx.currentTime);
    } else if (deviceMode === 'club') {
      filterLowRef.current.type = 'lowshelf';
      filterLowRef.current.frequency.setValueAtTime(80, ctx.currentTime);
      filterLowRef.current.gain.setValueAtTime(8, ctx.currentTime);
      filterHighRef.current.type = 'allpass';
      filterHighRef.current.gain.setValueAtTime(0, ctx.currentTime);
    } else {
      filterLowRef.current.type = 'allpass';
      filterLowRef.current.gain.setValueAtTime(0, ctx.currentTime);
      filterHighRef.current.type = 'allpass';
      filterHighRef.current.gain.setValueAtTime(0, ctx.currentTime);
    }
  }, [deviceMode]);

  useEffect(() => {
    if (!stemFilterRef.current || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const f = stemFilterRef.current;
    f.Q.setValueAtTime(1.2, ctx.currentTime);

    if (stemMode === 'vocal') {
      f.type = 'bandpass';
      f.frequency.setValueAtTime(1250, ctx.currentTime);
      f.Q.setValueAtTime(0.85, ctx.currentTime);
      f.gain.setValueAtTime(0, ctx.currentTime);
    } else if (stemMode === 'bass') {
      f.type = 'lowpass';
      f.frequency.setValueAtTime(220, ctx.currentTime);
      f.gain.setValueAtTime(3, ctx.currentTime);
    } else if (stemMode === 'drums') {
      f.type = 'peaking';
      f.frequency.setValueAtTime(4200, ctx.currentTime);
      f.Q.setValueAtTime(0.7, ctx.currentTime);
      f.gain.setValueAtTime(5, ctx.currentTime);
    } else if (stemMode === 'karaoke') {
      f.type = 'notch';
      f.frequency.setValueAtTime(1400, ctx.currentTime);
      f.Q.setValueAtTime(1.5, ctx.currentTime);
      f.gain.setValueAtTime(0, ctx.currentTime);
    } else {
      f.type = 'allpass';
      f.gain.setValueAtTime(0, ctx.currentTime);
    }
  }, [stemMode]);

  useEffect(() => {
    if (!audioCtxRef.current || !eqNodesRef.current.length) return;
    const ctx = audioCtxRef.current;
    eqNodesRef.current.forEach((node, idx) => {
      node.gain.setTargetAtTime(eqGains[idx] || 0, ctx.currentTime, 0.02);
    });
  }, [eqGains]);

  useEffect(() => {
    if (sourceRef.current) {
      sourceRef.current.channelCount = isMono ? 1 : 2;
      sourceRef.current.channelCountMode = isMono ? 'explicit' : 'max';
    }
  }, [isMono]);

  const stopAudio = () => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch (e) {}
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    cancelAnimationFrame(animRef.current);
  };

  const detectChordFromFFT = useCallback((freqData, sampleRate, fftSize) => {
    const binHz = sampleRate / fftSize;
    const rawChroma = Array(12).fill(0);
    const bassChroma = Array(12).fill(0);

    const minBin = Math.max(2, Math.floor(65 / binHz));
    const maxBin = Math.min(freqData.length - 1, Math.ceil(2200 / binHz));

    for (let i = minBin; i <= maxBin; i++) {
      const mag = freqData[i] / 255;
      if (mag < 0.14) continue;

      const freq = i * binHz;
      const midi = 69 + 12 * Math.log2(freq / 440);
      if (!Number.isFinite(midi)) continue;

      const pitchClass = ((Math.round(midi) % 12) + 12) % 12;
      const freqWeight = freq < 320 ? 1.35 : freq < 900 ? 1.0 : 0.65;
      const energy = (mag * mag) * freqWeight;

      rawChroma[pitchClass] += energy;
      if (freq >= 65 && freq <= 240) {
        bassChroma[pitchClass] += energy * 1.6;
      }
    }

    const totalEnergy = rawChroma.reduce((a, b) => a + b, 0);
    if (totalEnergy < 0.08) {
      return null;
    }

    const normChroma = rawChroma.map((v) => v / totalEnergy);
    const alpha = 0.35;
    const smoothed = chromaHistoryRef.current.map((prev, idx) => {
      const nextVal = prev * (1 - alpha) + normChroma[idx] * alpha;
      chromaHistoryRef.current[idx] = nextVal;
      return nextVal;
    });

    let bassIdx = 0;
    for (let i = 1; i < 12; i++) {
      if (bassChroma[i] > bassChroma[bassIdx]) bassIdx = i;
    }

    smoothed.forEach((val, idx) => {
      keyHistogramRef.current[idx] += val * 0.05;
    });
    let keyIdx = 0;
    for (let i = 1; i < 12; i++) {
      if (keyHistogramRef.current[i] > keyHistogramRef.current[keyIdx]) keyIdx = i;
    }

    const templates =
      chordComplexityRef.current === 'extended'
        ? EXTENDED_CHORD_TEMPLATES
        : BASIC_CHORD_TEMPLATES;

    let bestScore = -Infinity;
    let bestChord = '--';

    for (let root = 0; root < 12; root++) {
      for (const tpl of templates) {
        const chordPcs = new Set(tpl.intervals.map((iv) => (root + iv) % 12));
        let inChordScore = 0;
        let outChordPenalty = 0;

        for (let pc = 0; pc < 12; pc++) {
          if (chordPcs.has(pc)) {
            inChordScore += smoothed[pc];
          } else {
            outChordPenalty += smoothed[pc] * 0.55;
          }
        }

        // Sedikit penalti kompleksitas untuk akor 4-5 nada agar tidak overfit saat triad murni dimainkan
        const complexityPenalty = tpl.intervals.length > 3 ? (tpl.intervals.length - 3) * 0.035 : 0;

        const fifthPc = (root + 7) % 12;
        let bassBonus = 0;
        if (bassIdx === root) bassBonus = 0.14;
        else if (bassIdx === fifthPc) bassBonus = 0.06;

        const score = inChordScore - outChordPenalty - complexityPenalty + bassBonus;
        if (score > bestScore) {
          bestScore = score;
          bestChord = `${NOTE_NAMES[root]}${tpl.suffix}`;
        }
      }
    }

    const confidence = Math.max(0, Math.min(100, Math.round((bestScore + 0.2) * 85)));
    return {
      chord: bestChord,
      confidence,
      bassNote: NOTE_NAMES[bassIdx],
      keyEstimate: `${NOTE_NAMES[keyIdx]} Key`
    };
  }, []);

  const updateVisualizer = useCallback((trackDur) => {
    if (!analyserRef.current || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const analyser = analyserRef.current;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    const timeData = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(timeData);

    let maxVal = 0;
    for (let i = 0; i < timeData.length; i++) {
      if (Math.abs(timeData[i]) > maxVal) maxVal = Math.abs(timeData[i]);
    }
    const db = maxVal > 0 ? Math.max(-60, 20 * Math.log10(maxVal)) : -60;
    setPeakDb(db);

    const elapsed = (ctx.currentTime - startTimeRef.current) % (trackDur || 1);
    setCurrentTime(elapsed);

    setFreqBars([
      Math.max(8, (dataArray[2] / 255) * 100),
      Math.max(8, (dataArray[6] / 255) * 100),
      Math.max(8, (dataArray[16] / 255) * 100),
      Math.max(8, (dataArray[45] / 255) * 100),
      Math.max(8, (dataArray[90] / 255) * 100),
    ]);

    const curvePoints = Array(48).fill(0).map((_, idx) => {
      const ratio = idx / 47;
      const binIndex = Math.min(
        dataArray.length - 1,
        Math.max(1, Math.floor(Math.pow(dataArray.length - 1, ratio)))
      );
      return dataArray[binIndex] / 255;
    });
    setSpectrumCurve(curvePoints);

    const detected = detectChordFromFFT(dataArray, ctx.sampleRate, analyser.fftSize);
    if (detected && maxVal > 0.015) {
      if (chordCandidateRef.current.label === detected.chord) {
        chordCandidateRef.current.count += 1;
      } else {
        chordCandidateRef.current = { label: detected.chord, count: 1 };
      }

      if (chordCandidateRef.current.count >= 3) {
        setChordInfo({
          chord: detected.chord,
          confidence: detected.confidence,
          bassNote: detected.bassNote,
          keyEstimate: detected.keyEstimate
        });
      }
    }

    animRef.current = requestAnimationFrame(() => updateVisualizer(trackDur));
  }, [detectChordFromFFT]);

  const playFromOffset = (targetTrack, offset) => {
    initAudio();
    const ctx = audioCtxRef.current;
    stopAudio();

    const selectedBuffer = targetTrack === 'A' ? bufferARef.current : bufferBRef.current;
    if (!selectedBuffer) {
      alert(`Unggah dulu file audio untuk Track ${targetTrack}!`);
      setIsPlaying(false);
      return;
    }

    setDuration(selectedBuffer.duration);
    const safeOffset = offset >= selectedBuffer.duration ? 0 : offset;

    const source = ctx.createBufferSource();
    source.buffer = selectedBuffer;
    source.loop = true;
    source.channelCount = isMono ? 1 : 2;
    source.channelCountMode = isMono ? 'explicit' : 'max';

    gainNodeRef.current.gain.setValueAtTime(targetTrack === 'A' ? gainA : gainB, ctx.currentTime);

    source.connect(gainNodeRef.current);
    gainNodeRef.current.connect(stemFilterRef.current);

    let prevNode = stemFilterRef.current;
    for (const eqNode of eqNodesRef.current) {
      prevNode.connect(eqNode);
      prevNode = eqNode;
    }

    prevNode.connect(filterLowRef.current);
    filterLowRef.current.connect(filterHighRef.current);
    filterHighRef.current.connect(analyserRef.current);
    analyserRef.current.connect(ctx.destination);

    source.start(0, safeOffset);
    sourceRef.current = source;
    startTimeRef.current = ctx.currentTime - safeOffset;
    setActiveTrack(targetTrack);
    setIsPlaying(true);
    updateVisualizer(selectedBuffer.duration);
  };

  const togglePlay = () => {
    if (isPlaying) {
      offsetRef.current = audioCtxRef.current.currentTime - startTimeRef.current;
      stopAudio();
      setIsPlaying(false);
    } else {
      playFromOffset(activeTrack, offsetRef.current);
    }
  };

  const handleSeek = (e) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    offsetRef.current = newTime;
    if (isPlaying) playFromOffset(activeTrack, newTime);
  };

  const switchTrack = (track) => {
    const nowOffset = isPlaying ? (audioCtxRef.current.currentTime - startTimeRef.current) : offsetRef.current;
    offsetRef.current = nowOffset;
    setActiveTrack(track);
    const buf = track === 'A' ? bufferARef.current : bufferBRef.current;
    if (buf) setDuration(buf.duration);
    if (isPlaying) playFromOffset(track, nowOffset);
  };

  const handleEqChange = (index, value) => {
    const parsed = parseFloat(value);
    setActiveEqPreset('custom');
    setEqGains((prev) => {
      const next = [...prev];
      next[index] = parsed;
      return next;
    });
  };

  const applyEqPreset = (preset) => {
    setActiveEqPreset(preset.id);
    setEqGains([...preset.gains]);
  };

  const resetEq = () => {
    setActiveEqPreset('flat');
    setEqGains([0, 0, 0, 0, 0, 0]);
  };

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const buildEqCurvePath = () => {
    const width = 600;
    const height = 140;
    const midY = height / 2;
    const points = eqGains.map((gain, idx) => {
      const x = (idx / (eqGains.length - 1)) * width;
      const y = midY - (gain / 12) * (height * 0.4);
      return [x, y];
    });

    if (points.length === 0) return '';
    let d = `M ${points[0][0]} ${points[0][1]}`;
    for (let i = 0; i < points.length - 1; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[i + 1];
      const cx = (x0 + x1) / 2;
      d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
    }
    return d;
  };

  const buildSpectrumAreaPath = () => {
    const width = 600;
    const height = 140;
    if (!spectrumCurve.length) return `M 0 ${height} L ${width} ${height} Z`;

    const coords = spectrumCurve.map((val, idx) => {
      const x = (idx / (spectrumCurve.length - 1)) * width;
      const y = height - Math.min(1, Math.max(0, val)) * (height - 10);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    return `M 0 ${height} L ${coords.join(' L ')} L ${width} ${height} Z`;
  };

  const getAdvisorMessage = () => {
    if (peakDb > -0.5) return { warn: true, text: 'Peringatan Clipping! Sinyal melewati -0.5 dB. Turunkan Limiter atau Volume Master.' };
    if (stemMode !== 'full') return { warn: false, text: `Mode Isolasi "${stemMode.toUpperCase()}" aktif untuk membantu fokus analisis elemen lagu.` };
    if (isMono) return { warn: false, text: 'Mode Mono Aktif: Dengarkan apakah gitar ritem atau vokal terdengar menipis/hilang.' };
    if (freqBars[2] > freqBars[3] + 18) return { warn: true, text: 'Area Low-Mid (250-500 Hz) cukup padat. Cek apakah suara mix terdengar agak mendem.' };
    return { warn: false, text: 'Keseimbangan spektrum dan headroom terpantau aman untuk standar streaming.' };
  };

  const advisor = getAdvisorMessage();
  const accentColor = activeTrack === 'A' ? '#38bdf8' : '#c084fc';
  const cardStyle = {
    background: 'linear-gradient(145deg, rgba(30,41,59,0.85), rgba(15,23,42,0.95))',
    border: '1px solid rgba(148,163,184,0.15)',
    borderRadius: '16px',
    padding: '18px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.25)'
  };

  return (
    <div style={{ background: 'radial-gradient(circle at top, #1e1b4b 0%, #090d16 65%)', color: '#f8fafc', minHeight: '100vh', padding: '20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: '780px', margin: '0 auto' }}>

        {/* Header & Nama Band */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity color="#38bdf8" size={24} />
              {isEditingName ? (
                <input
                  value={bandName}
                  onChange={(e) => { setBandName(e.target.value); localStorage.setItem('bandName', e.target.value); }}
                  onBlur={() => setIsEditingName(false)}
                  autoFocus
                  style={{ background: '#1e293b', color: '#fff', border: '1px solid #38bdf8', borderRadius: '6px', padding: '4px 8px', fontSize: '18px', fontWeight: 'bold' }}
                />
              ) : (
                <h1 onClick={() => setIsEditingName(true)} style={{ fontSize: '20px', fontWeight: '800', margin: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', letterSpacing: '0.5px' }}>
                  {bandName} <Edit3 size={14} color="#64748b" />
                </h1>
              )}
            </div>
            <p style={{ color: '#94a3b8', fontSize: '12px', margin: '4px 0 0 0' }}>Mix & Master Diagnostic Console v2.3</p>
          </div>

          <div style={{ backgroundColor: 'rgba(15,23,42,0.8)', padding: '6px 12px', borderRadius: '20px', border: '1px solid #334155', fontSize: '12px', color: '#38bdf8', fontWeight: '600' }}>
            Target Spotify: -14 LUFS / -1.0 dBTP
          </div>
        </div>

        {/* Upload & Gain Matching */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '16px' }}>
          {[
            { id: 'A', title: 'TRACK A • Mix Band', name: trackAName, color: '#38bdf8', gain: gainA, setGain: setGainA },
            { id: 'B', title: 'TRACK B • Lagu Referensi', name: trackBName, color: '#c084fc', gain: gainB, setGain: setGainB }
          ].map((t) => (
            <div key={t.id} style={{ ...cardStyle, border: activeTrack === t.id ? `1.5px solid ${t.color}` : '1px solid rgba(148,163,184,0.15)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontWeight: '700', fontSize: '13px', color: t.color }}>{t.title}</span>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', backgroundColor: '#334155', padding: '5px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>
                  <Upload size={13} /> Pilih File
                  <input type="file" accept="audio/*" onChange={(e) => handleFileUpload(e, t.id)} style={{ display: 'none' }} />
                </label>
              </div>
              <div style={{ fontSize: '12px', color: '#cbd5e1', marginBottom: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#94a3b8' }}>
                <Sliders size={13} /> Gain:
                <input type="range" min="0.2" max="1.5" step="0.05" value={t.gain} onChange={(e) => t.setGain(parseFloat(e.target.value))} style={{ flex: 1, accentColor: t.color }} />
                <span style={{ width: '36px', textAlign: 'right' }}>{Math.round(t.gain * 100)}%</span>
              </div>
            </div>
          ))}
        </div>

        {/* Transport & Timeline Seekbar */}
        <div style={{ ...cardStyle, marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
            <button onClick={togglePlay} style={{ background: isPlaying ? 'linear-gradient(90deg, #ef4444, #dc2626)' : 'linear-gradient(90deg, #10b981, #059669)', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
              {isPlaying ? <><Pause size={16} /> Pause</> : <><Play size={16} /> Putar Audio</>}
            </button>

            <div style={{ display: 'flex', gap: '8px', backgroundColor: '#0f172a', padding: '4px', borderRadius: '10px' }}>
              <button onClick={() => switchTrack('A')} style={{ backgroundColor: activeTrack === 'A' ? '#0284c7' : 'transparent', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '12px' }}>
                A • Mix Band
              </button>
              <button onClick={() => switchTrack('B')} style={{ backgroundColor: activeTrack === 'B' ? '#9333ea' : 'transparent', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '12px' }}>
                B • Referensi
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: '#94a3b8' }}>
            <span>{formatTime(currentTime)}</span>
            <input type="range" min="0" max={duration || 100} step="0.1" value={currentTime} onChange={handleSeek} style={{ flex: 1, accentColor: accentColor, cursor: 'pointer' }} />
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Pemisah Instrumen & Deteksi Chord (dengan Opsi Akor Tambahan) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '14px', marginBottom: '16px' }}>
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '700', marginBottom: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>
              <Layers size={14} color="#38bdf8" /> Pemisah Instrumen (Stem Isolator)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '7px' }}>
              {[
                { id: 'full', label: 'Full Mix' },
                { id: 'vocal', label: 'Vokal / Lead' },
                { id: 'drums', label: 'Drums / Beat' },
                { id: 'bass', label: 'Bass / Sub' },
                { id: 'karaoke', label: 'Minus Vocal' }
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setStemMode(item.id)}
                  style={{
                    backgroundColor: stemMode === item.id ? '#0284c7' : '#1e293b',
                    color: '#fff',
                    border: stemMode === item.id ? '1px solid #38bdf8' : '1px solid #334155',
                    padding: '8px 6px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: '700'
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>
                <Music size={14} color="#c084fc" /> Chord Analyzer
              </div>
              {/* Opsi Deteksi Jenis Akor: Dasar vs Tambahan (Extended) */}
              <div style={{ display: 'flex', backgroundColor: '#0f172a', padding: '2px', borderRadius: '7px', border: '1px solid #334155' }}>
                {[
                  { id: 'basic', label: 'Dasar' },
                  { id: 'extended', label: 'Extended (9/add9/sus)' }
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setChordComplexity(opt.id)}
                    style={{
                      backgroundColor: chordComplexity === opt.id ? '#9333ea' : 'transparent',
                      color: chordComplexity === opt.id ? '#fff' : '#94a3b8',
                      border: 'none',
                      padding: '4px 7px',
                      borderRadius: '5px',
                      fontSize: '10px',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '30px', fontWeight: '800', color: '#f8fafc', lineHeight: 1.1 }}>
                  {isPlaying ? chordInfo.chord : '--'}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
                  Bass: <strong style={{ color: '#e2e8f0' }}>{isPlaying ? chordInfo.bassNote : '--'}</strong> • {isPlaying ? chordInfo.keyEstimate : 'Menunggu audio'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Akurasi</div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: chordInfo.confidence >= 60 ? '#10b981' : '#f59e0b' }}>
                  {isPlaying ? `${chordInfo.confidence}%` : '0%'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Equalizer 6-Band + Preset EQ + Grafik Spektrum di Belakang Kurva */}
        <div style={{ ...cardStyle, marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Equalizer 6-Band & Grafik Spektrum
            </div>
            <button
              onClick={resetEq}
              style={{
                backgroundColor: '#1e293b',
                color: '#cbd5e1',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '4px 9px',
                fontSize: '11px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <RotateCcw size={12} /> Reset EQ
            </button>
          </div>

          {/* Pilihan Preset EQ */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
            {EQ_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => applyEqPreset(preset)}
                style={{
                  backgroundColor: activeEqPreset === preset.id ? '#0284c7' : '#0f172a',
                  color: activeEqPreset === preset.id ? '#fff' : '#cbd5e1',
                  border: activeEqPreset === preset.id ? '1px solid #38bdf8' : '1px solid #334155',
                  borderRadius: '8px',
                  padding: '5px 10px',
                  fontSize: '11px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Canvas SVG Grafik Audio di Belakang Kurva EQ */}
          <div style={{ position: 'relative', backgroundColor: '#090d16', borderRadius: '10px', border: '1px solid rgba(148,163,184,0.12)', overflow: 'hidden', marginBottom: '14px' }}>
            <svg viewBox="0 0 600 140" style={{ width: '100%', height: '140px', display: 'block' }}>
              <defs>
                <linearGradient id="bgWaveGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accentColor} stopOpacity="0.45" />
                  <stop offset="100%" stopColor={accentColor} stopOpacity="0.03" />
                </linearGradient>
              </defs>

              <line x1="0" y1="70" x2="600" y2="70" stroke="rgba(148,163,184,0.22)" strokeDasharray="4 4" strokeWidth="1" />
              <path d={buildSpectrumAreaPath()} fill="url(#bgWaveGrad)" />
              <path d={buildEqCurvePath()} fill="none" stroke="#f8fafc" strokeWidth="2.5" />

              {eqGains.map((gain, idx) => {
                const x = (idx / (eqGains.length - 1)) * 600;
                const y = 70 - (gain / 12) * 56;
                return (
                  <circle
                    key={EQ_FREQS[idx]}
                    cx={x}
                    cy={y}
                    r="5"
                    fill={accentColor}
                    stroke="#090d16"
                    strokeWidth="2"
                  />
                );
              })}
            </svg>
          </div>

          {/* Slider 6-Band EQ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
            {EQ_FREQS.map((freq, idx) => (
              <div key={freq} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: 'rgba(15,23,42,0.65)', padding: '8px 4px', borderRadius: '8px' }}>
                <span style={{ fontSize: '10px', fontWeight: '700', color: '#e2e8f0' }}>
                  {eqGains[idx] > 0 ? `+${eqGains[idx]}` : eqGains[idx]} dB
                </span>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="0.5"
                  value={eqGains[idx]}
                  onChange={(e) => handleEqChange(idx, e.target.value)}
                  style={{ width: '100%', margin: '8px 0', accentColor: accentColor, cursor: 'pointer' }}
                />
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>{EQ_LABELS[idx]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Spectrum & Peak Meter */}
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '14px', marginBottom: '16px' }}>
          <div style={cardStyle}>
            <div style={{ fontSize: '12px', fontWeight: '700', marginBottom: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Spektrum Frekuensi</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: '115px', backgroundColor: '#090d16', padding: '12px', borderRadius: '10px' }}>
              {['Sub', 'Bass', 'Low-Mid', 'High-Mid', 'Treble'].map((label, i) => (
                <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '18%' }}>
                  <div style={{ width: '48%', height: `${freqBars[i]}px`, background: activeTrack === 'A' ? 'linear-gradient(180deg, #38bdf8, #0284c7)' : 'linear-gradient(180deg, #e879f9, #9333ea)', borderRadius: '4px 4px 0 0', transition: 'height 0.07s' }} />
                  <span style={{ fontSize: '10px', color: '#94a3b8', marginTop: '6px' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>Peak Level</div>
            <div style={{ width: '28px', height: '95px', backgroundColor: '#090d16', borderRadius: '8px', padding: '3px', display: 'flex', alignItems: 'flex-end' }}>
              <div style={{ width: '100%', height: `${Math.max(5, ((peakDb + 60) / 60) * 100)}%`, backgroundColor: peakDb > -1 ? '#ef4444' : peakDb > -6 ? '#f59e0b' : '#10b981', borderRadius: '5px', transition: 'height 0.07s' }} />
            </div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: peakDb > -1 ? '#ef4444' : '#f8fafc' }}>{peakDb.toFixed(1)} dB</div>
          </div>
        </div>

        {/* Simulasi Perangkat & Mono Check */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '14px', marginBottom: '16px' }}>
          <div style={cardStyle}>
            <div style={{ fontSize: '12px', fontWeight: '700', marginBottom: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>Simulasi Perangkat</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {[
                { id: 'studio', label: 'Studio Flat', icon: <Headphones size={14} /> },
                { id: 'phone', label: 'Speaker HP', icon: <Smartphone size={14} /> },
                { id: 'car', label: 'Audio Mobil', icon: <Car size={14} /> },
                { id: 'club', label: 'Sound Live', icon: <Speaker size={14} /> }
              ].map((d) => (
                <button key={d.id} onClick={() => setDeviceMode(d.id)} style={{ backgroundColor: deviceMode === d.id ? '#0284c7' : '#1e293b', color: '#fff', border: '1px solid #334155', padding: '9px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {d.icon} {d.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: '#94a3b8', textTransform: 'uppercase' }}>Kompatibilitas Fase</div>
              <p style={{ fontSize: '12px', color: '#cbd5e1', margin: 0 }}>Cek apakah gitar atau vokal menghilang saat digabung ke 1 kanal.</p>
            </div>
            <button onClick={() => setIsMono(!isMono)} style={{ backgroundColor: isMono ? '#f59e0b' : '#1e293b', color: isMono ? '#000' : '#fff', border: '1px solid #334155', padding: '10px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '12px' }}>
              <Volume2 size={16} /> {isMono ? 'MONO AKTIF (Cek Fase)' : 'STEREO (Normal)'}
            </button>
          </div>
        </div>

        {/* Smart Mix Advisor */}
        <div style={{ ...cardStyle, borderLeft: advisor.warn ? '4px solid #f59e0b' : '4px solid #10b981', display: 'flex', alignItems: 'center', gap: '12px' }}>
          {advisor.warn ? <AlertTriangle color="#f59e0b" size={22} /> : <CheckCircle2 color="#10b981" size={22} />}
          <div style={{ fontSize: '13px', color: '#e2e8f0' }}>{advisor.text}</div>
        </div>

      </div>
    </div>
  );
}
