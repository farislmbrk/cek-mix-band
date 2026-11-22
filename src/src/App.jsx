import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Upload, Volume2, Smartphone, Car, Speaker, Headphones, Activity, Sliders, AlertTriangle, CheckCircle2, Edit3 } from 'lucide-react';

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

  const audioCtxRef = useRef(null);
  const bufferARef = useRef(null);
  const bufferBRef = useRef(null);
  const sourceRef = useRef(null);
  const gainNodeRef = useRef(null);
  const analyserRef = useRef(null);
  const filterLowRef = useRef(null);
  const filterHighRef = useRef(null);
  const animRef = useRef(null);
  const startTimeRef = useRef(0);
  const offsetRef = useRef(0);

  const initAudio = () => {
    if (!audioCtxRef.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new AudioContext();
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      gainNodeRef.current = audioCtxRef.current.createGain();
      filterLowRef.current = audioCtxRef.current.createBiquadFilter();
      filterHighRef.current = audioCtxRef.current.createBiquadFilter();
    }
  };

  const handleFileUpload = async (e, track) => {
    const file = e.target.files[0];
    if (!file) return;
    initAudio();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioCtxRef.current.decodeAudioData(arrayBuffer);
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
    gainNodeRef.current.connect(filterLowRef.current);
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

    setFreqBars([
      Math.max(8, (dataArray[2] / 255) * 100),
      Math.max(8, (dataArray[6] / 255) * 100),
      Math.max(8, (dataArray[16] / 255) * 100),
      Math.max(8, (dataArray[45] / 255) * 100),
      Math.max(8, (dataArray[90] / 255) * 100),
    ]);

    animRef.current = requestAnimationFrame(() => updateVisualizer(trackDur));
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

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const getAdvisorMessage = () => {
    if (peakDb > -0.5) return { warn: true, text: 'Peringatan Clipping! Sinyal melewati -0.5 dB. Turunkan Limiter atau Volume Master.' };
    if (isMono) return { warn: false, text: 'Mode Mono Aktif: Dengarkan apakah gitar ritem atau vokal terdengar menipis/hilang.' };
    if (freqBars[2] > freqBars[3] + 18) return { warn: true, text: 'Area Low-Mid (250-500 Hz) cukup padat. Cek apakah suara mix terdengar agak mendem.' };
    return { warn: false, text: 'Keseimbangan spektrum dan headroom terpantau aman untuk standar streaming.' };
  };

  const advisor = getAdvisorMessage();
  const cardStyle = {
    background: 'linear-gradient(145deg, rgba(30,41,59,0.85), rgba(15,23,42,0.95))',
    border: '1px solid rgba(148,163,184,0.15)',
    borderRadius: '16px',
    padding: '18px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.25)'
  };

  return (
    <div style={{ background: 'radial-gradient(circle at top, #1e1b4b 0%, #090d16 65%)', color: '#f8fafc', minHeight: '100vh', padding: '20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        
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
            <p style={{ color: '#94a3b8', fontSize: '12px', margin: '4px 0 0 0' }}>Mix & Master Diagnostic Console v2.0</p>
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
            <input type="range" min="0" max={duration || 100} step="0.1" value={currentTime} onChange={handleSeek} style={{ flex: 1, accentColor: activeTrack === 'A' ? '#38bdf8' : '#c084fc', cursor: 'pointer' }} />
            <span>{formatTime(duration)}</span>
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
