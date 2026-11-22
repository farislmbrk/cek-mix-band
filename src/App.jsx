import React, { useState, useRef, useEffect } from 'react';
import {
  Play, Pause, Upload, Volume2, Smartphone, Car, Speaker, Headphones,
  Activity, Sliders, AlertTriangle, CheckCircle2, Edit3, Repeat,
  MessageSquarePlus, Trash2, Copy, Check, Scissors, Radio, Layers,
  CheckSquare, Square, Download
} from 'lucide-react';

export default function App() {
  const [bandName, setBandName] = useState(() => localStorage.getItem('bandName') || 'KIRANA');
  const [isEditingName, setIsEditingName] = useState(false);
  const [activeTab, setActiveTab] = useState('studio'); // 'studio' | 'stage'

  // Audio Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTrack, setActiveTrack] = useState('A');
  const [trackAName, setTrackAName] = useState('Belum ada file Mix Band');
  const [trackBName, setTrackBName] = useState('Belum ada file Referensi');
  const [gainA, setGainA] = useState(1.0);
  const [gainB, setGainB] = useState(0.85);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Waveform Peaks
  const [waveA, setWaveA] = useState(Array(64).fill(20));
  const [waveB, setWaveB] = useState(Array(64).fill(20));

  // Diagnostic & Routing Modes
  const [channelMode, setChannelMode] = useState('stereo'); // 'stereo' | 'mono' | 'mid' | 'side'
  const [freqSolo, setFreqSolo] = useState('all'); // 'all' | 'low' | 'mid' | 'high'
  const [deviceMode, setDeviceMode] = useState('studio'); // 'studio' | 'phone' | 'car' | 'club' | 'spotify'
  const [freqBars, setFreqBars] = useState([12, 12, 12, 12, 12]);
  const [peakDb, setPeakDb] = useState(-60);
  const [correlation, setCorrelation] = useState(1.0);

  // A-B Loop State
  const [loopA, setLoopA] = useState(null);
  const [loopB, setLoopB] = useState(null);
  const [isLoopActive, setIsLoopActive] = useState(false);

  // Timestamped Mix Notes
  const [notes, setNotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('kiranaMixNotes')) || []; } catch { return []; }
  });
  const [noteInput, setNoteInput] = useState('');
  const [copiedNotes, setCopiedNotes] = useState(false);

  // Pre-Release Checklist
  const [checklist, setChecklist] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('kiranaChecklist')) || [
        { id: 1, text: 'Headroom aman di bawah -1.0 dBTP (Tidak Clipping)', done: false },
        { id: 2, text: 'Vokal & gitar tetap jelas saat Mode MONO aktif', done: false },
        { id: 3, text: 'Bass & Kick tetap terdengar di simulasi Speaker HP', done: false },
        { id: 4, text: 'Keseimbangan frekuensi sudah mendekati Lagu Referensi', done: false },
        { id: 5, text: 'Format export WAV 44.1 kHz (16-bit atau 24-bit)', done: false },
      ];
    } catch { return []; }
  });

  // Stage & Promo State
  const [snippetStart, setSnippetStart] = useState(0);
  const [snippetLen, setSnippetLen] = useState(15);
  const [isExporting, setIsExporting] = useState(false);
  const [stagePan, setStagePan] = useState(0); // -1 Left, 0 Center, 1 Right

  // Web Audio Refs
  const audioCtxRef = useRef(null);
  const bufferARef = useRef(null);
  const bufferBRef = useRef(null);
  const sourceRef = useRef(null);
  const gainNodeRef = useRef(null);
  const filterLowRef = useRef(null);
  const filterHighRef = useRef(null);
  const soloFilterRef = useRef(null);
  const processorRef = useRef(null);
  const pannerRef = useRef(null);
  const analyserRef = useRef(null);
  const animRef = useRef(null);
  const startTimeRef = useRef(0);
  const offsetRef = useRef(0);

  // Sync Refs for real-time ScriptProcessor / Loop checks
  const channelModeRef = useRef(channelMode);
  const loopARef = useRef(loopA);
  const loopBRef = useRef(loopB);
  const isLoopActiveRef = useRef(isLoopActive);

  useEffect(() => { channelModeRef.current = channelMode; }, [channelMode]);
  useEffect(() => { loopARef.current = loopA; }, [loopA]);
  useEffect(() => { loopBRef.current = loopB; }, [loopB]);
  useEffect(() => { isLoopActiveRef.current = isLoopActive; }, [isLoopActive]);

  useEffect(() => {
    localStorage.setItem('kiranaMixNotes', JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    localStorage.setItem('kiranaChecklist', JSON.stringify(checklist));
  }, [checklist]);

  const initAudio = () => {
    if (!audioCtxRef.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;

      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = 256;

      gainNodeRef.current = ctx.createGain();
      filterLowRef.current = ctx.createBiquadFilter();
      filterHighRef.current = ctx.createBiquadFilter();
      soloFilterRef.current = ctx.createBiquadFilter();
      pannerRef.current = ctx.createStereoPanner ? ctx.createStereoPanner() : null;

      // Custom Processor for Mono, Mid, Side & Phase Correlation
      const proc = ctx.createScriptProcessor(2048, 2, 2);
      proc.onaudioprocess = (e) => {
        const inL = e.inputBuffer.getChannelData(0);
        const inR = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : inL;
        const outL = e.outputBuffer.getChannelData(0);
        const outR = e.outputBuffer.getChannelData(1);

        let sumLR = 0, sumL2 = 0, sumR2 = 0;
        const mode = channelModeRef.current;

        for (let i = 0; i < inL.length; i++) {
          const l = inL[i];
          const r = inR[i];
          sumLR += l * r;
          sumL2 += l * l;
          sumR2 += r * r;

          if (mode === 'mono') {
            const m = (l + r) * 0.5;
            outL[i] = m;
            outR[i] = m;
          } else if (mode === 'mid') {
            const m = (l + r) * 0.5;
            outL[i] = m;
            outR[i] = m;
          } else if (mode === 'side') {
            const s = (l - r) * 0.5;
            outL[i] = s;
            outR[i] = -s;
          } else {
            outL[i] = l;
            outR[i] = r;
          }
        }

        const denom = Math.sqrt(sumL2 * sumR2);
        if (denom > 0.00001) {
          const corr = Math.max(-1, Math.min(1, sumLR / denom));
          setCorrelation(corr);
        }
      };
      processorRef.current = proc;
    }
  };

  const extractWaveform = (audioBuffer) => {
    const raw = audioBuffer.getChannelData(0);
    const samples = 64;
    const blockSize = Math.floor(raw.length / samples);
    const peaks = [];
    for (let i = 0; i < samples; i++) {
      let max = 0;
      for (let j = 0; j < blockSize; j += 10) {
        const val = Math.abs(raw[i * blockSize + j] || 0);
        if (val > max) max = val;
      }
      peaks.push(Math.max(10, Math.min(100, max * 100)));
    }
    return peaks;
  };

  const handleFileUpload = async (e, track) => {
    const file = e.target.files[0];
    if (!file) return;
    initAudio();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioCtxRef.current.decodeAudioData(arrayBuffer);
    const peaks = extractWaveform(audioBuffer);

    if (track === 'A') {
      bufferARef.current = audioBuffer;
      setTrackAName(file.name);
      setWaveA(peaks);
      if (activeTrack === 'A') {
        setDuration(audioBuffer.duration);
        setSnippetStart(0);
      }
    } else {
      bufferBRef.current = audioBuffer;
      setTrackBName(file.name);
      setWaveB(peaks);
      if (activeTrack === 'B') setDuration(audioBuffer.duration);
    }
  };

  // Update Gain & Device Normalization
  useEffect(() => {
    if (gainNodeRef.current && audioCtxRef.current) {
      let baseGain = activeTrack === 'A' ? gainA : gainB;
      if (deviceMode === 'spotify') baseGain *= 0.72; // Simulate -14 LUFS normalization drop
      gainNodeRef.current.gain.setValueAtTime(baseGain, audioCtxRef.current.currentTime);
    }
  }, [gainA, gainB, activeTrack, deviceMode]);

  // Update Device EQ Simulation
  useEffect(() => {
    if (!filterLowRef.current || !filterHighRef.current || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    if (deviceMode === 'phone') {
      filterLowRef.current.type = 'highpass';
      filterLowRef.current.frequency.setValueAtTime(320, ctx.currentTime);
      filterHighRef.current.type = 'lowpass';
      filterHighRef.current.frequency.setValueAtTime(3800, ctx.currentTime);
    } else if (deviceMode === 'car') {
      filterLowRef.current.type = 'peaking';
      filterLowRef.current.frequency.setValueAtTime(110, ctx.currentTime);
      filterLowRef.current.gain.setValueAtTime(6, ctx.currentTime);
      filterHighRef.current.type = 'lowpass';
      filterHighRef.current.frequency.setValueAtTime(11000, ctx.currentTime);
    } else if (deviceMode === 'club') {
      filterLowRef.current.type = 'lowshelf';
      filterLowRef.current.frequency.setValueAtTime(80, ctx.currentTime);
      filterLowRef.current.gain.setValueAtTime(8, ctx.currentTime);
      filterHighRef.current.type = 'allpass';
    } else {
      filterLowRef.current.type = 'allpass';
      filterHighRef.current.type = 'allpass';
    }
  }, [deviceMode]);

  // Update Frequency Solo Filter
  useEffect(() => {
    if (!soloFilterRef.current || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    if (freqSolo === 'low') {
      soloFilterRef.current.type = 'lowpass';
      soloFilterRef.current.frequency.setValueAtTime(250, ctx.currentTime);
      soloFilterRef.current.Q.setValueAtTime(0.7, ctx.currentTime);
    } else if (freqSolo === 'mid') {
      soloFilterRef.current.type = 'bandpass';
      soloFilterRef.current.frequency.setValueAtTime(1200, ctx.currentTime);
      soloFilterRef.current.Q.setValueAtTime(0.6, ctx.currentTime);
    } else if (freqSolo === 'high') {
      soloFilterRef.current.type = 'highpass';
      soloFilterRef.current.frequency.setValueAtTime(4000, ctx.currentTime);
      soloFilterRef.current.Q.setValueAtTime(0.7, ctx.currentTime);
    } else {
      soloFilterRef.current.type = 'allpass';
    }
  }, [freqSolo]);

  // Update Stage Panner
  useEffect(() => {
    if (pannerRef.current && audioCtxRef.current) {
      pannerRef.current.pan.setValueAtTime(stagePan, audioCtxRef.current.currentTime);
    }
  }, [stagePan]);

  const stopAudio = () => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch (e) {}
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    cancelAnimationFrame(animRef.current);
  };

  const playFromOffset = (targetTrack, offset) => {
    initAudio();
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    stopAudio();

    const selectedBuffer = targetTrack === 'A' ? bufferARef.current : bufferBRef.current;
    if (!selectedBuffer) {
      alert(`Unggah dulu file audio untuk Track ${targetTrack}!`);
      setIsPlaying(false);
      return;
    }

    setDuration(selectedBuffer.duration);
    const safeOffset = offset >= selectedBuffer.duration ? 0 : Math.max(0, offset);

    const source = ctx.createBufferSource();
    source.buffer = selectedBuffer;
    source.loop = true;

    let baseGain = targetTrack === 'A' ? gainA : gainB;
    if (deviceMode === 'spotify') baseGain *= 0.72;
    gainNodeRef.current.gain.setValueAtTime(baseGain, ctx.currentTime);

    // Audio Chain: Source -> Gain -> DeviceLow -> DeviceHigh -> SoloFilter -> M/S Processor -> Panner -> Analyser -> Out
    source.connect(gainNodeRef.current);
    gainNodeRef.current.connect(filterLowRef.current);
    filterLowRef.current.connect(filterHighRef.current);
    filterHighRef.current.connect(soloFilterRef.current);
    soloFilterRef.current.connect(processorRef.current);

    if (pannerRef.current) {
      processorRef.current.connect(pannerRef.current);
      pannerRef.current.connect(analyserRef.current);
    } else {
      processorRef.current.connect(analyserRef.current);
    }
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
      offsetRef.current = (audioCtxRef.current.currentTime - startTimeRef.current) % (duration || 1);
      stopAudio();
      setIsPlaying(false);
    } else {
      playFromOffset(activeTrack, offsetRef.current);
    }
  };

  const updateVisualizer = (trackDur) => {
    if (!analyserRef.current || !audioCtxRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    const timeData = new Float32Array(analyserRef.current.fftSize);
    analyserRef.current.getFloatTimeDomainData(timeData);
    let maxVal = 0;
    for (let i = 0; i < timeData.length; i++) {
      if (Math.abs(timeData[i]) > maxVal) maxVal = Math.abs(timeData[i]);
    }
    const db = maxVal > 0 ? Math.max(-60, 20 * Math.log10(maxVal)) : -60;
    setPeakDb(db);

    const elapsed = (audioCtxRef.current.currentTime - startTimeRef.current) % (trackDur || 1);
    setCurrentTime(elapsed);

    // Handle A-B Section Loop
    if (isLoopActiveRef.current && loopARef.current !== null && loopBRef.current !== null && loopBRef.current > loopARef.current) {
      if (elapsed >= loopBRef.current) {
        offsetRef.current = loopARef.current;
        playFromOffset(activeTrack, loopARef.current);
        return;
      }
    }

    setFreqBars([
      Math.max(8, (dataArray[2] / 255) * 100),
      Math.max(8, (dataArray[6] / 255) * 100),
      Math.max(8, (dataArray[16] / 255) * 100),
      Math.max(8, (dataArray[45] / 255) * 100),
      Math.max(8, (dataArray[90] / 255) * 100),
    ]);

    animRef.current = requestAnimationFrame(() => updateVisualizer(trackDur));
  };

  const seekTo = (newTime) => {
    const clamped = Math.max(0, Math.min(duration || 0, newTime));
    setCurrentTime(clamped);
    offsetRef.current = clamped;
    if (isPlaying) playFromOffset(activeTrack, clamped);
  };

  const switchTrack = (track) => {
    const nowOffset = isPlaying ? ((audioCtxRef.current.currentTime - startTimeRef.current) % (duration || 1)) : offsetRef.current;
    offsetRef.current = nowOffset;
    setActiveTrack(track);
    const buf = track === 'A' ? bufferARef.current : bufferBRef.current;
    if (buf) setDuration(buf.duration);
    if (isPlaying) playFromOffset(track, nowOffset);
  };

  // Add Timestamped Note
  const addNote = (e) => {
    e.preventDefault();
    if (!noteInput.trim()) return;
    const newNote = {
      id: Date.now(),
      time: currentTime,
      track: activeTrack,
      text: noteInput.trim()
    };
    setNotes([newNote, ...notes]);
    setNoteInput('');
  };

  const copyNotesToClipboard = () => {
    if (notes.length === 0) return;
    const header = `Catatan Revisi Mix - ${bandName} (${trackAName}):\n`;
    const body = notes.map(n => `- [${formatTime(n.time)}] (Track ${n.track}): ${n.text}`).join('\n');
    navigator.clipboard.writeText(header + body);
    setCopiedNotes(true);
    setTimeout(() => setCopiedNotes(false), 2000);
  };

  // Export WAV Snippet for TikTok/Reels
  const exportWavSnippet = () => {
    const buf = bufferARef.current;
    if (!buf) {
      alert('Unggah dulu file Mix Band di Track A!');
      return;
    }
    setIsExporting(true);
    setTimeout(() => {
      const sampleRate = buf.sampleRate;
      const startSample = Math.floor(snippetStart * sampleRate);
      const endSample = Math.min(buf.length, Math.floor((snippetStart + snippetLen) * sampleRate));
      const frameCount = endSample - startSample;
      if (frameCount <= 0) {
        setIsExporting(false);
        return;
      }

      const numChannels = buf.numberOfChannels;
      const bytesPerSample = 2;
      const blockAlign = numChannels * bytesPerSample;
      const dataSize = frameCount * blockAlign;
      const wavBuffer = new ArrayBuffer(44 + dataSize);
      const view = new DataView(wavBuffer);

      const writeStr = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
      writeStr(0, 'RIFF');
      view.setUint32(4, 36 + dataSize, true);
      writeStr(8, 'WAVE');
      writeStr(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * blockAlign, true);
      view.setUint16(32, blockAlign, true);
      view.setUint16(34, 16, true);
      writeStr(36, 'data');
      view.setUint32(40, dataSize, true);

      let offset = 44;
      for (let i = 0; i < frameCount; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
          let sample = buf.getChannelData(ch)[startSample + i] || 0;
          sample = Math.max(-1, Math.min(1, sample));
          view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
          offset += 2;
        }
      }

      const blob = new Blob([wavBuffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${bandName.replace(/\s+/g, '_')}_Snippet_${snippetLen}s.wav`;
      a.click();
      URL.revokeObjectURL(url);
      setIsExporting(false);
    }, 100);
  };

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const getAdvisorMessage = () => {
    if (peakDb > -0.5) return { warn: true, text: 'Peringatan Clipping! Sinyal melewati -0.5 dB. Turunkan Limiter atau Volume Master.' };
    if (correlation < 0.15 && isPlaying) return { warn: true, text: 'Peringatan Fase Stereo! Korelasi mendekati 0/negatif—gitar/synth berisiko hilang di speaker Mono.' };
    if (channelMode === 'side') return { warn: false, text: 'Monitor SIDE Aktif: Hanya menampilkan perbedaan kiri-kanan (reverb & gitar ganda).' };
    if (channelMode === 'mid') return { warn: false, text: 'Monitor MID Aktif: Hanya menampilkan vokal utama, bass, kick, dan snare di tengah.' };
    if (freqBars[2] > freqBars[3] + 18) return { warn: true, text: 'Area Low-Mid (250-500 Hz) cukup padat. Cek apakah suara mix terdengar mendem.' };
    return { warn: false, text: 'Spektrum, fase stereo, dan headroom terpantau aman untuk standar streaming.' };
  };

  const advisor = getAdvisorMessage();
  const activeWaveform = activeTrack === 'A' ? waveA : waveB;
  const activeColor = activeTrack === 'A' ? '#38bdf8' : '#c084fc';

  const cardStyle = {
    background: 'linear-gradient(145deg, rgba(30,41,59,0.88), rgba(15,23,42,0.96))',
    border: '1px solid rgba(148,163,184,0.15)',
    borderRadius: '16px',
    padding: '16px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.25)'
  };

  return (
    <div style={{ background: 'radial-gradient(circle at top, #1e1b4b 0%, #090d16 65%)', color: '#f8fafc', minHeight: '100vh', padding: '18px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: '820px', margin: '0 auto' }}>
        
        {/* Header & Mode Switcher */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
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
                <h1 onClick={() => setIsEditingName(true)} style={{ fontSize: '21px', fontWeight: '800', margin: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {bandName} <Edit3 size={14} color="#64748b" />
                </h1>
              )}
            </div>
            <p style={{ color: '#94a3b8', fontSize: '12px', margin: '2px 0 0 0' }}>DIY Studio & Stage Console v3.0</p>
          </div>

          <div style={{ display: 'flex', backgroundColor: '#0f172a', padding: '4px', borderRadius: '12px', border: '1px solid #334155' }}>
            <button
              onClick={() => setActiveTab('studio')}
              style={{ backgroundColor: activeTab === 'studio' ? '#0284c7' : 'transparent', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '9px', cursor: 'pointer', fontWeight: '700', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Sliders size={14} /> Studio Mix & Master
            </button>
            <button
              onClick={() => setActiveTab('stage')}
              style={{ backgroundColor: activeTab === 'stage' ? '#9333ea' : 'transparent', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '9px', cursor: 'pointer', fontWeight: '700', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Radio size={14} /> Stage, Promo & Checklist
            </button>
          </div>
        </div>

        {/* Upload & Gain Matching (Always Visible) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginBottom: '14px' }}>
          {[
            { id: 'A', title: 'TRACK A • Mix Band', name: trackAName, color: '#38bdf8', gain: gainA, setGain: setGainA },
            { id: 'B', title: 'TRACK B • Lagu Referensi', name: trackBName, color: '#c084fc', gain: gainB, setGain: setGainB }
          ].map((t) => (
            <div key={t.id} style={{ ...cardStyle, border: activeTrack === t.id ? `1.5px solid ${t.color}` : '1px solid rgba(148,163,184,0.15)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontWeight: '700', fontSize: '12px', color: t.color }}>{t.title}</span>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', backgroundColor: '#334155', padding: '5px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>
                  <Upload size={12} /> Pilih WAV/MP3
                  <input type="file" accept="audio/*" onChange={(e) => handleFileUpload(e, t.id)} style={{ display: 'none' }} />
                </label>
              </div>
              <div style={{ fontSize: '12px', color: '#cbd5e1', marginBottom: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#94a3b8' }}>
                <span>Gain:</span>
                <input type="range" min="0.1" max="1.5" step="0.05" value={t.gain} onChange={(e) => t.setGain(parseFloat(e.target.value))} style={{ flex: 1, accentColor: t.color }} />
                <span style={{ width: '34px', textAlign: 'right' }}>{Math.round(t.gain * 100)}%</span>
              </div>
            </div>
          ))}
        </div>

        {/* Transport, Interactive Waveform & A-B Loop */}
        <div style={{ ...cardStyle, marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={togglePlay} style={{ background: isPlaying ? 'linear-gradient(90deg, #ef4444, #dc2626)' : 'linear-gradient(90deg, #10b981, #059669)', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                {isPlaying ? <><Pause size={15} /> Pause</> : <><Play size={15} /> Play</>}
              </button>

              <div style={{ display: 'flex', gap: '4px', backgroundColor: '#0f172a', padding: '4px', borderRadius: '10px' }}>
                <button onClick={() => switchTrack('A')} style={{ backgroundColor: activeTrack === 'A' ? '#0284c7' : 'transparent', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '7px', cursor: 'pointer', fontWeight: '700', fontSize: '12px' }}>
                  Track A
                </button>
                <button onClick={() => switchTrack('B')} style={{ backgroundColor: activeTrack === 'B' ? '#9333ea' : 'transparent', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '7px', cursor: 'pointer', fontWeight: '700', fontSize: '12px' }}>
                  Track B
                </button>
              </div>
            </div>

            {/* A-B Section Loop Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#0f172a', padding: '5px 8px', borderRadius: '10px', border: '1px solid #334155' }}>
              <Repeat size={13} color={isLoopActive ? '#f59e0b' : '#64748b'} />
              <button onClick={() => setLoopA(currentTime)} style={{ backgroundColor: '#1e293b', color: '#cbd5e1', border: 'none', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>
                Set A {loopA !== null ? `(${formatTime(loopA)})` : ''}
              </button>
              <button onClick={() => setLoopB(currentTime)} style={{ backgroundColor: '#1e293b', color: '#cbd5e1', border: 'none', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>
                Set B {loopB !== null ? `(${formatTime(loopB)})` : ''}
              </button>
              <button
                onClick={() => setIsLoopActive(!isLoopActive)}
                disabled={loopA === null || loopB === null}
                style={{ backgroundColor: isLoopActive ? '#f59e0b' : '#334155', color: isLoopActive ? '#000' : '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', opacity: (loopA === null || loopB === null) ? 0.5 : 1 }}
              >
                {isLoopActive ? 'Loop ON' : 'Loop OFF'}
              </button>
            </div>
          </div>

          {/* Interactive Waveform Display */}
          <div
            onClick={(e) => {
              if (!duration) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = (e.clientX - rect.left) / rect.width;
              seekTo(ratio * duration);
            }}
            style={{ height: '54px', backgroundColor: '#090d16', borderRadius: '10px', padding: '6px 8px', display: 'flex', alignItems: 'center', gap: '2px', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}
          >
            {activeWaveform.map((val, idx) => {
              const pct = (idx / activeWaveform.length) * 100;
              const playPct = duration ? (currentTime / duration) * 100 : 0;
              const passed = pct <= playPct;
              return (
                <div
                  key={idx}
                  style={{
                    flex: 1,
                    height: `${val}%`,
                    backgroundColor: passed ? activeColor : '#334155',
                    borderRadius: '2px',
                    transition: 'background-color 0.1s'
                  }}
                />
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
            <span>{formatTime(currentTime)}</span>
            <span>Klik grafik gelombang untuk melompat ke bagian lagu</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* TAB 1: STUDIO MIX & MASTER */}
        {activeTab === 'studio' && (
          <>
            {/* Spectrum, Peak & Stereo Correlation */}
            <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>Spektrum & Isolasi Frekuensi</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[
                      { id: 'all', label: 'All' },
                      { id: 'low', label: 'Solo Low' },
                      { id: 'mid', label: 'Solo Mid' },
                      { id: 'high', label: 'Solo High' }
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => setFreqSolo(f.id)}
                        style={{ backgroundColor: freqSolo === f.id ? '#0ea5e9' : '#1e293b', color: '#fff', border: '1px solid #334155', padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700', cursor: 'pointer' }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: '105px', backgroundColor: '#090d16', padding: '10px', borderRadius: '10px', marginBottom: '10px' }}>
                  {['Sub', 'Bass', 'Low-Mid', 'High-Mid', 'Treble'].map((label, i) => (
                    <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '18%' }}>
                      <div style={{ width: '46%', height: `${freqBars[i]}px`, background: activeTrack === 'A' ? 'linear-gradient(180deg, #38bdf8, #0284c7)' : 'linear-gradient(180deg, #e879f9, #9333ea)', borderRadius: '4px 4px 0 0', transition: 'height 0.07s' }} />
                      <span style={{ fontSize: '10px', color: '#94a3b8', marginTop: '5px' }}>{label}</span>
                    </div>
                  ))}
                </div>

                {/* Stereo Phase Correlation Meter */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8', marginBottom: '4px' }}>
                    <span>-1 (Fase Terbalik)</span>
                    <span style={{ fontWeight: '700', color: correlation < 0.2 ? '#ef4444' : '#10b981' }}>Stereo Correlation: {correlation.toFixed(2)}</span>
                    <span>+1 (Mono/Aman)</span>
                  </div>
                  <div style={{ height: '8px', backgroundColor: '#090d16', borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', backgroundColor: '#475569' }} />
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        width: '12px',
                        borderRadius: '4px',
                        backgroundColor: correlation < 0.2 ? '#ef4444' : '#10b981',
                        left: `calc(${((correlation + 1) / 2) * 100}% - 6px)`,
                        transition: 'left 0.1s'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Peak dB Meter */}
              <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>Peak Level</div>
                <div style={{ width: '32px', height: '115px', backgroundColor: '#090d16', borderRadius: '8px', padding: '3px', display: 'flex', alignItems: 'flex-end' }}>
                  <div style={{ width: '100%', height: `${Math.max(5, ((peakDb + 60) / 60) * 100)}%`, backgroundColor: peakDb > -1 ? '#ef4444' : peakDb > -6 ? '#f59e0b' : '#10b981', borderRadius: '5px', transition: 'height 0.07s' }} />
                </div>
                <div style={{ fontSize: '13px', fontWeight: '800', color: peakDb > -1 ? '#ef4444' : '#f8fafc' }}>{peakDb.toFixed(1)} dB</div>
              </div>
            </div>

            {/* Simulasi Perangkat & Mid/Side/Mono Monitor */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', marginBottom: '14px' }}>
              <div style={cardStyle}>
                <div style={{ fontSize: '12px', fontWeight: '700', marginBottom: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>Simulasi Perangkat & Streaming</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  {[
                    { id: 'studio', label: 'Studio Flat', icon: <Headphones size={13} /> },
                    { id: 'spotify', label: 'Spotify -14 LUFS', icon: <Volume2 size={13} /> },
                    { id: 'phone', label: 'Speaker HP', icon: <Smartphone size={13} /> },
                    { id: 'car', label: 'Audio Mobil', icon: <Car size={13} /> },
                    { id: 'club', label: 'Sound Panggung', icon: <Speaker size={13} /> }
                  ].map((d) => (
                    <button key={d.id} onClick={() => setDeviceMode(d.id)} style={{ backgroundColor: deviceMode === d.id ? '#0284c7' : '#1e293b', color: '#fff', border: '1px solid #334155', padding: '8px', borderRadius: '8px', cursor: 'pointer', fontSize: '11px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {d.icon} {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={cardStyle}>
                <div style={{ fontSize: '12px', fontWeight: '700', marginBottom: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>Monitor Kanal (Mono & Mid/Side)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  {[
                    { id: 'stereo', label: 'STEREO (Normal)' },
                    { id: 'mono', label: 'MONO (Cek Fase)' },
                    { id: 'mid', label: 'MID (Vokal/Bass)' },
                    { id: 'side', label: 'SIDE (Gitar/Reverb)' }
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setChannelMode(m.id)}
                      style={{ backgroundColor: channelMode === m.id ? '#f59e0b' : '#1e293b', color: channelMode === m.id ? '#000' : '#fff', border: '1px solid #334155', padding: '9px 8px', borderRadius: '8px', cursor: 'pointer', fontSize: '11px', fontWeight: '700' }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Smart Mix Advisor */}
            <div style={{ ...cardStyle, marginBottom: '14px', borderLeft: advisor.warn ? '4px solid #f59e0b' : '4px solid #10b981', display: 'flex', alignItems: 'center', gap: '10px' }}>
              {advisor.warn ? <AlertTriangle color="#f59e0b" size={20} /> : <CheckCircle2 color="#10b981" size={20} />}
              <div style={{ fontSize: '12px', color: '#e2e8f0' }}>{advisor.text}</div>
            </div>

            {/* Timestamped Mix Notes */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>Catatan Revisi Per Detik Lagu</span>
                {notes.length > 0 && (
                  <button onClick={copyNotesToClipboard} style={{ backgroundColor: '#334155', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {copiedNotes ? <><Check size={12} color="#10b981" /> Tersalin ke Clipboard!</> : <><Copy size={12} /> Salin Laporan WA</>}
                  </button>
                )}
              </div>

              <form onSubmit={addNote} style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <div style={{ backgroundColor: '#0f172a', padding: '8px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', color: '#38bdf8', border: '1px solid #334155' }}>
                  {formatTime(currentTime)}
                </div>
                <input
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="Tulis catatan revisi di detik ini (misal: Vokal kurang naik)..."
                  style={{ flex: 1, backgroundColor: '#0f172a', color: '#fff', border: '1px solid #334155', borderRadius: '8px', padding: '8px 12px', fontSize: '12px' }}
                />
                <button type="submit" style={{ backgroundColor: '#0284c7', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', fontWeight: '700', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <MessageSquarePlus size={14} /> Tandai
                </button>
              </form>

              {notes.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', padding: '10px' }}>Belum ada catatan revisi. Putar lagu dan tandai detik yang perlu diperbaiki.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto' }}>
                  {notes.map((n) => (
                    <div key={n.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0f172a', padding: '8px 12px', borderRadius: '8px', fontSize: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button onClick={() => seekTo(n.time)} style={{ backgroundColor: '#1e293b', color: '#38bdf8', border: 'none', padding: '3px 7px', borderRadius: '5px', fontWeight: '700', cursor: 'pointer', fontSize: '11px' }}>
                          {formatTime(n.time)}
                        </button>
                        <span style={{ color: '#94a3b8', fontSize: '11px' }}>[Track {n.track}]</span>
                        <span>{n.text}</span>
                      </div>
                      <button onClick={() => setNotes(notes.filter(item => item.id !== n.id))} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* TAB 2: STAGE, PROMO & RELEASE CHECKLIST */}
        {activeTab === 'stage' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* Quick TikTok / Reels Snippet Exporter */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Scissors size={16} color="#38bdf8" />
                <span style={{ fontSize: '13px', fontWeight: '700', textTransform: 'uppercase' }}>Pemotong Audio Promo TikTok / Reels (Track A)</span>
              </div>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 12px 0' }}>
                Potong bagian reff paling catchy dari Track A untuk dijadikan file WAV pendek siap unggah ke media sosial.
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                <button onClick={() => setSnippetStart(currentTime)} style={{ backgroundColor: '#334155', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>
                  Mulai dari Detik Saat Ini ({formatTime(snippetStart)})
                </button>

                <select value={snippetLen} onChange={(e) => setSnippetLen(Number(e.target.value))} style={{ backgroundColor: '#0f172a', color: '#fff', border: '1px solid #334155', padding: '8px 12px', borderRadius: '8px', fontSize: '12px' }}>
                  <option value={15}>Durasi: 15 Detik (Story/TikTok)</option>
                  <option value={30}>Durasi: 30 Detik (Reels/Chorus)</option>
                  <option value={60}>Durasi: 60 Detik (Full Teaser)</option>
                </select>

                <button onClick={exportWavSnippet} disabled={isExporting} style={{ backgroundColor: '#10b981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: '700', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Download size={14} /> {isExporting ? 'Memproses...' : 'Unduh Potongan WAV'}
                </button>
              </div>
            </div>

            {/* Live Stage Backing Track & Click Splitter */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Layers size={16} color="#c084fc" />
                <span style={{ fontSize: '13px', fontWeight: '700', textTransform: 'uppercase' }}>Live Backing Track & Click Splitter</span>
              </div>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 12px 0' }}>
                Gunakan saat latihan atau manggung: arahkan sinyal musik ke Kiri (FOH) dan metronom/click ke Kanan (Headphone Drummer).
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {[
                  { val: -1, label: 'Kiri Penuh (L - Sound Panggung)' },
                  { val: 0, label: 'Tengah (Stereo Normal)' },
                  { val: 1, label: 'Kanan Penuh (R - In-Ear Drummer)' }
                ].map(p => (
                  <button
                    key={p.val}
                    onClick={() => setStagePan(p.val)}
                    style={{ backgroundColor: stagePan === p.val ? '#9333ea' : '#1e293b', color: '#fff', border: '1px solid #334155', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Pre-Release Mastering Checklist */}
            <div style={cardStyle}>
              <div style={{ fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '10px', color: '#38bdf8' }}>
                Checklist Sebelum Upload ke SoundOn / Spotify
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {checklist.map(item => (
                  <div
                    key={item.id}
                    onClick={() => setChecklist(checklist.map(c => c.id === item.id ? { ...c, done: !c.done } : c))}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#0f172a', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', color: item.done ? '#64748b' : '#f8fafc', textDecoration: item.done ? 'line-through' : 'none' }}
                  >
                    {item.done ? <CheckSquare size={16} color="#10b981" /> : <Square size={16} color="#64748b" />}
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
