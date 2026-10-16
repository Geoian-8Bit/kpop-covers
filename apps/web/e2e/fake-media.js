/**
 * Browser test helper (never shipped: outside src/, not imported by the app).
 *
 * Gives a desktop browser without a webcam a fake camera (1920×1080 moving picture with the abilities of a
 * Chrome-on-Android camera: lens zoom, torch, focus, exposure, white balance) and a fake microphone, and
 * mutes everything the page plays so tests are silent.
 *
 * Load it before the app runs, e.g. from DevTools / Puppeteer as an init script:
 *   const x = new XMLHttpRequest(); x.open('GET', '/@fs/<repo>/apps/web/e2e/fake-media.js', false); x.send(); eval(x.responseText);
 * Options (set before loading): window.__fakeCam = { width, height, fps, zoom: false, torch: false }.
 */
(() => {
  if (window.__fakeMedia) return;
  window.__fakeMedia = true;
  const opts = Object.assign({ width: 1920, height: 1080, fps: 30, zoom: true, torch: true }, window.__fakeCam);

  // ── Silence: nothing reaches the speakers while testing ──
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...a) {
    this.volume = 0;
    return play.apply(this, a);
  };
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...rest) {
    if (target instanceof AudioDestinationNode) {
      const ctx = target.context;
      if (!ctx.__mute) {
        ctx.__mute = ctx.createGain();
        ctx.__mute.gain.value = 0;
        connect.call(ctx.__mute, target);
      }
      return connect.call(this, ctx.__mute, ...rest);
    }
    return connect.call(this, target, ...rest);
  };

  // ── Fake camera ──
  const W = opts.width;
  const H = opts.height;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  let f = 0;
  setInterval(() => {
    f++;
    ctx.fillStyle = `hsl(${f % 360},40%,30%)`;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.font = `${Math.round(H / 9)}px sans-serif`;
    ctx.fillText('FAKE CAM ' + f, W * 0.1 + ((f * 7) % (W * 0.4)), H / 2);
    ctx.fillRect((f * 13) % W, H * 0.75, H / 9, H / 9);
  }, 1000 / opts.fps);

  // ── Fake microphone: a quiet tone, plus a "clap" on demand (window.__fakeClap()) ──
  let ac;
  let dst;
  let gain;
  const mic = () => {
    if (!ac) {
      ac = new AudioContext();
      const o = ac.createOscillator();
      o.frequency.value = 220;
      gain = ac.createGain();
      gain.gain.value = 0.02;
      dst = ac.createMediaStreamDestination();
      o.connect(gain);
      gain.connect(dst);
      o.start();
    }
    return dst.stream.getAudioTracks()[0].clone();
  };
  let base = 0.02;
  window.__fakeClap = () => {
    if (!ac) return;
    void ac.resume();
    const t = ac.currentTime;
    gain.gain.setValueAtTime(1, t);
    gain.gain.setValueAtTime(base, t + 0.04);
  };
  // F7 tests: two claps `gapMs` apart (0.2–0.8 s fires the armed recorder), and the room's background level.
  window.__fakeDoubleClap = (gapMs = 400) => {
    window.__fakeClap();
    setTimeout(window.__fakeClap, gapMs);
  };
  window.__fakeMicLevel = (level) => {
    base = level;
    if (ac) gain.gain.setValueAtTime(level, ac.currentTime);
  };

  const md = navigator.mediaDevices;
  md.getUserMedia = async (cons) => {
    const s = new MediaStream();
    if (cons && cons.video) {
      const t = canvas.captureStream(opts.fps).getVideoTracks()[0];
      const caps = {
        width: { min: 1, max: W },
        height: { min: 1, max: H },
        frameRate: { min: 1, max: opts.fps },
        focusMode: ['continuous', 'single-shot', 'manual'],
        exposureMode: ['continuous', 'manual'],
        exposureCompensation: { min: -2, max: 2, step: 0.1 },
        whiteBalanceMode: ['continuous', 'manual'],
        colorTemperature: { min: 2500, max: 7500, step: 100 },
      };
      if (opts.zoom) caps.zoom = { min: 1, max: 8, step: 0.1 };
      if (opts.torch) caps.torch = true;
      const set = { zoom: 1, torch: false };
      t.getCapabilities = () => caps;
      const gs = t.getSettings.bind(t);
      t.getSettings = () => ({ ...gs(), width: W, height: H, frameRate: opts.fps, ...set, deviceId: 'fake0' });
      t.applyConstraints = async (k) => {
        for (const a of (k && k.advanced) || [k || {}]) Object.assign(set, a);
        (window.__constraints ||= []).push(k);
      };
      Object.defineProperty(t, 'label', { value: 'camera2 0, facing back' });
      s.addTrack(t);
    }
    if (cons && cons.audio) s.addTrack(mic());
    return s;
  };
  md.getSupportedConstraints = () => ({
    zoom: true,
    torch: true,
    pointsOfInterest: true,
    focusMode: true,
    exposureCompensation: true,
    whiteBalanceMode: true,
    colorTemperature: true,
    width: true,
    height: true,
    frameRate: true,
    deviceId: true,
    facingMode: true,
  });
  md.enumerateDevices = async () => [
    { kind: 'videoinput', deviceId: 'fake0', label: 'camera2 0, facing back', groupId: 'g' },
    { kind: 'videoinput', deviceId: 'fake2', label: 'camera2 2, facing back', groupId: 'g' },
    { kind: 'videoinput', deviceId: 'fake1', label: 'camera2 1, facing front', groupId: 'g' },
    { kind: 'audioinput', deviceId: 'mic', label: 'Fake mic', groupId: 'g' },
  ];
})();
