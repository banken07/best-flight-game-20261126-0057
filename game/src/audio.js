// ATOLL RUN — procedural sound.
// Everything is synthesised with WebAudio: engine hum, ring chimes, the
// trap clunk and the low-fuel alarm. No audio files, so nothing to fetch.
// Every method is safe to call before ensure() runs (it just does nothing).

export function createAudio() {
  let ctx = null;
  let master = null;
  let hum = null;
  let silent = false;

  function limit01(v) {
    const n = Number(v) || 0;
    return n < 0 ? 0 : n > 1 ? 1 : n;
  }

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = silent ? 0 : 0.5;
    master.connect(ctx.destination);

    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscB.type = 'sawtooth';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    filter.Q.value = 5;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    oscA.frequency.value = 52;
    oscB.frequency.value = 52.8;
    oscA.start();
    oscB.start();
    hum = { oscA, oscB, filter, gain };
  }

  function setMuted(m) {
    silent = !!m;
    if (ctx && master) {
      master.gain.setTargetAtTime(silent ? 0 : 0.5, ctx.currentTime, 0.02);
    }
  }

  function engine(throttle01, speed01) {
    if (!ctx || !hum) return;
    const t = ctx.currentTime;
    const th = limit01(throttle01);
    const sp = limit01(speed01);
    const freq = 46 + th * 100;
    hum.oscA.frequency.setTargetAtTime(freq, t, 0.09);
    hum.oscB.frequency.setTargetAtTime(freq * 1.014, t, 0.09);
    hum.filter.frequency.setTargetAtTime(200 + th * 650 + sp * 450, t, 0.12);
    hum.gain.gain.setTargetAtTime(0.02 + sp * 0.15, t, 0.14);
  }

  function tone(freq, start, dur, type, vol) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(vol, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g);
    g.connect(master);
    o.start(start);
    o.stop(start + dur + 0.03);
  }

  function beep(freq, durSeconds) {
    if (!ctx) return;
    const dur = Math.max(0.02, Number(durSeconds) || 0.08);
    tone(Number(freq) || 440, ctx.currentTime, dur, 'square', 0.18);
  }

  function chime() {
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(880, t, 0.12, 'triangle', 0.2);
    tone(1320, t + 0.11, 0.2, 'triangle', 0.2);
  }

  function clunk() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.25);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const nf = ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.setValueAtTime(1000, t);
    nf.frequency.exponentialRampToValueAtTime(160, t + 0.25);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.35, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    src.connect(nf);
    nf.connect(ng);
    ng.connect(master);
    src.start(t);
    src.stop(t + 0.26);

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.22);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(0.4, t + 0.012);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(og);
    og.connect(master);
    o.start(t);
    o.stop(t + 0.32);
  }

  function alarm() {
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(440, t, 0.14, 'square', 0.2);
    tone(440, t + 0.2, 0.14, 'square', 0.2);
  }

  return {
    get muted() {
      return silent;
    },
    set muted(v) {
      setMuted(v);
    },
    ensure,
    setMuted,
    engine,
    beep,
    chime,
    clunk,
    alarm,
  };
}
