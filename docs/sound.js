/* Background music and alert sounds, made live with Web Audio (no music files, no copyright issues).
   Phones only allow sound after a tap, so music starts on the first tap when it is switched on. */
var SOUND = (function () {
  var ctx = null, master = null, musicGain = null, timer = null, nextAt = 0, step = 0, playing = false;
  function ac() {
    if (!ctx) {
      var C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
      ctx = new C(); master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, at, dur, type, vol, dest) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + Math.min(0.08, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(dest || master); o.start(at); o.stop(at + dur + 0.05);
  }
  var hz = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };
  // warm, slow loop: Fmaj7 - Em7 - Dm7 - Cmaj7 (two bars each at 76 bpm)
  var CHORDS = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]];
  var ARP = [0, 2, 1, 3, 2, 1, 3, 2];
  var BEAT = 60 / 76 / 2;   // eighth notes
  function schedule() {
    while (nextAt < ctx.currentTime + 0.4) {
      var bar = Math.floor(step / 16) % CHORDS.length, ch = CHORDS[bar], i = step % 16;
      if (i === 0) ch.forEach(function (m) { tone(hz(m), nextAt, BEAT * 16, 'triangle', 0.035, musicGain); });
      if (i === 0 || i === 8) tone(hz(ch[0] - 12), nextAt, BEAT * 7, 'sine', 0.08, musicGain);
      if (i % 2 === 0 || Math.random() < 0.25) tone(hz(ch[ARP[(i >> 1) % 8]] + 12), nextAt, BEAT * 2.5, 'sine', 0.03, musicGain);
      nextAt += BEAT; step++;
    }
  }
  function startMusic() {
    if (playing || !ac()) return;
    musicGain = ctx.createGain(); musicGain.gain.value = 0.0001; musicGain.connect(master);
    musicGain.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 2);
    nextAt = ctx.currentTime + 0.1; playing = true; schedule(); timer = setInterval(schedule, 150);
  }
  function stopMusic() {
    if (!playing) return; playing = false; clearInterval(timer);
    var g = musicGain; g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    setTimeout(function () { g.disconnect(); }, 800);
  }
  document.addEventListener('visibilitychange', function () {   // pause when the app is in the background
    if (!ctx) return; if (document.hidden) ctx.suspend(); else ctx.resume();
  });
  return {
    unlock: ac, startMusic: startMusic, stopMusic: stopMusic, isPlaying: function () { return playing; },
    ding: function () { if (!ac()) return; var t = ctx.currentTime; tone(988, t, 0.18, 'sine', 0.25); tone(1319, t + 0.12, 0.3, 'sine', 0.22); },
    cheer: function () { if (!ac()) return; var t = ctx.currentTime; [72, 76, 79, 84].forEach(function (m, i) { tone(hz(m), t + i * 0.09, 0.5, 'triangle', 0.18); }); }
  };
})();
