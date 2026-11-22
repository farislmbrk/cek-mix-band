import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Upload, Volume2, Smartphone, Car, Speaker, Headphones, Activity } from 'lucide-react';

export default function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTrack, setActiveTrack] = useState('A');
  const [isMono, setIsMono] = useState(false);
  const [deviceMode, setDeviceMode] = useState('studio');
  const [trackAName, setTrackAName] = useState('Belum ada file Mix Band');
  const [trackBName, setTrackBName] = useState('Belum ada file Referensi');
  const [freqBars, setFreqBars] = useState([10, 10, 10, 10, 10]);

  const audioCtxRef = useRef(null);
  const bufferARef = useRef(null);
  const bufferBRef = useRef(null);
  const sourceRef = useRef(null);
  const analyserRef = useRef(null);
  const filterLowRef = useRef(null);
  const filterHighRef = useRef(null);
  const animRef = useRef(null);

  const initAudio = () => {
    if (!audioCtxRef.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new AudioContext();
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
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
    } else {
      bufferBRef.current = audioBuffer;
      setTrackBName(file.name);
    }
  };

  useEffect(() => {
    if (!filterLowRef.current || !filterHighRef.current || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    if (deviceMode === 'phone') {
      filterLowRef.current.type = 'highpass';
      filterLowRef.current.frequency.setValueAtTime(300, ctx.currentTime);
      filterHighRef.current.type = 'lowpass';
      filterHighRef.current.frequency.setValueAtTime(4000, ctx.currentTime);
    } else if (deviceMode === 'car') {
      filterLowRef.current.type = 'peaking';
      filterLowRef.current.frequency.setValueAtTime(120, ctx.currentTime);
      filterLowRef.current.gain.setValueAtTime(6, ctx.currentTime);
      filterHighRef.current.type = 'lowpass';
      filterHighRef.current.frequency.setValueAtTime(12000, ctx.currentTime);
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

  const togglePlay = (targetTrack = activeTrack) => {
    initAudio();
    const ctx = audioCtxRef.current;
    if (sourceRef.current) {
      sourceRef.current.stop();
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (isPlaying && targetTrack === activeTrack) {
      setIsPlaying(false);
      cancelAnimationFrame(animRef.current);
      return;
    }
    const selectedBuffer = targetTrack === 'A' ? bufferARef.current : bufferBRef.current;
    if (!selectedBuffer) {
      alert(`Unggah dulu file audio untuk Track ${targetTrack}!`);
      return;
    }
    const source = ctx.createBufferSource();
    source.buffer = selectedBuffer;
    source.loop = true;
    source.channelCount = isMono ? 1 : 2;
    source.channelCountMode = isMono ? 'explicit' : 'max';

    source.connect(filterLowRef.current);
    filterLowRef.current.connect(filterHighRef.current);
    filterHighRef.current.connect(analyserRef.current);
    analyserRef.current.connect(ctx.destination);

    source.start(0);
    sourceRef.current = source;
    setActiveTrack(targetTrack);
    setIsPlaying(true);
    updateVisualizer();
  };
  const updateVisualizer = () => {
    if (!analyserRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    setFreqBars([
      Math.max(8, (dataArray[2] / 255) * 100),
      Math.max(8, (dataArray[6] / 255) * 100),
      Math.max(8, (dataArray[16] / 255) * 100),
      Math.max(8, (dataArray[40] / 255) * 100),
      Math.max(8, (dataArray[85] / 255) * 100),
    ]);
    animRef.current = requestAnimationFrame(updateVisualizer);
  };

  const switchTrack = (track) => {
    setActiveTrack(track);
    if (isPlaying) togglePlay(track);
  };

  const box = { backgroundColor: '#1e293b', padding: '16px', borderRadius: '12px', marginBottom: '16px' };
  const btn = (active, color = '#0284c7') => ({
    backgroundColor: active ? color : '#334155', color: '#fff', border: 'none',
    padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px'
  });

  return (
    <div style={{ backgroundColor: '#0f172a', color: '#f8fafc', minHeight: '100vh', padding: '24px', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: '680px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '22px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity color="#38bdf8" /> Mix & Master Diagnostic Tool
        </h1>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          {[
            { id: 'A', title: 'TRACK A: Mix Band', name: trackAName, color: '#38bdf8' },
            { id: 'B', title: 'TRACK B: Referensi', name: trackBName, color: '#c084fc' }
          ].map((t) => (
            <div key={t.id} style={{ ...box, marginBottom: 0, border: activeTrack === t.id ? `2px solid ${t.color}` : '1px solid #334155' }}>
              <div style={{ fontWeight: 'bold', color: t.color, marginBottom: '6px' }}>{t.title}</div>
              <div style={{ fontSize: '12px', color: '#cbd5e1', marginBottom: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#334155', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                <Upload size={14} /> Pilih WAV/MP3
                <input type="file" accept="audio/*" onChange={(e) => handleFileUpload(e, t.id)} style={{ display: 'none' }} />
              </label>
            </div>
          ))}
        </div>

        <div style={{ ...box, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <button onClick={() => togglePlay(activeTrack)} style={btn(true, isPlaying ? '#ef4444' : '#22c55e')}>
            {isPlaying ? 'Stop Audio' : 'Putar Audio'}
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => switchTrack('A')} style={btn(activeTrack === 'A', '#0284c7')}>Track A (Band)</button>
            <button onClick={() => switchTrack('B')} style={btn(activeTrack === 'B', '#9333ea')}>Track B (Ref)</button>
          </div>
        </div>

        <div style={box}>
          <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '12px' }}>Grafik Keseimbangan Frekuensi</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: '120px', backgroundColor: '#0f172a', padding: '12px', borderRadius: '8px' }}>
            {['Sub-Bass', 'Bass', 'Low-Mid', 'High-Mid', 'Treble'].map((label, i) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '18%' }}>
                <div style={{ width: '50%', height: `${freqBars[i]}px`, backgroundColor: activeTrack === 'A' ? '#38bdf8' : '#c084fc', borderRadius: '4px 4px 0 0', transition: 'height 0.08s' }} />
                <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
          <div style={{ ...box, marginBottom: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '10px' }}>Simulasi Perangkat</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {[
                { id: 'studio', label: 'Studio Asli' },
                { id: 'phone', label: 'Speaker HP' },
                { id: 'car', label: 'Audio Mobil' },
                { id: 'club', label: 'Sound Panggung' }
              ].map((d) => (
                <button key={d.id} onClick={() => setDeviceMode(d.id)} style={btn(deviceMode === d.id)}>{d.label}</button>
              ))}
            </div>
          </div>

          <div style={{ ...box, marginBottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '13px', fontWeight: 'bold' }}>Cek Fase Mono</div>
            <button onClick={() => setIsMono(!isMono)} style={{ ...btn(isMono, '#f59e0b'), color: isMono ? '#000' : '#fff', marginTop: '10px' }}>
              {isMono ? 'Mode: MONO' : 'Mode: STEREO'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
