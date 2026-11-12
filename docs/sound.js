/* Background music and alert sounds, made live with Web Audio (no music files, no copyright issues).
   Phones only allow sound after a tap, so music starts on the first tap when it is switched on. */
var SOUND = (function () {
  var ctx = null, master = null, playing = false;
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
  /* Background music = the team song (music.mp3, "转介绍", made by the leader with Suno), looped.
     Phones only allow sound after the first tap, so if play() is refused it starts on the first touch. */
  var song = null, wanted = false;
  function startMusic() {
    wanted = true;
    if (!song) { song = new Audio('music.mp3'); song.loop = true; song.volume = 0.45; song.preload = 'auto'; }
    if (!song.paused) { playing = true; return; }
    var p = song.play();
    if (p && p.then) p.then(function () { playing = true; }).catch(function () { playing = false; });   // blocked until a tap
    else playing = true;
  }
  function stopMusic() { wanted = false; playing = false; if (song) song.pause(); }
  document.addEventListener('visibilitychange', function () {   // pause when the app is in the background, resume when back
    if (ctx) { if (document.hidden) ctx.suspend(); else ctx.resume(); }
    if (song && wanted) { if (document.hidden) song.pause(); else song.play().catch(function () {}); }
  });
  return {
    unlock: ac, startMusic: startMusic, stopMusic: stopMusic, isPlaying: function () { return !!song && !song.paused; },
    ding: function () { if (!ac()) return; var t = ctx.currentTime; tone(988, t, 0.18, 'sine', 0.25); tone(1319, t + 0.12, 0.3, 'sine', 0.22); },
    /* "Cash in" (about 2 s): register drawer clack, ka-ching bell, then coins jingling. Plays when your bonus is approved. */
    cash: function () {
      if (!ac()) return; var t = ctx.currentTime;
      var len = Math.floor(ctx.sampleRate * 0.09), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      var src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8; g.gain.value = 0.55;
      src.connect(bp); bp.connect(g); g.connect(master); src.start(t);                       // "ka" (drawer)
      [2093, 2637, 3136, 4186].forEach(function (f, k) { tone(f, t + 0.07, 1.25 - k * 0.15, 'sine', 0.16 - k * 0.025); });   // "ching" (bell)
      [1047, 1319].forEach(function (f) { tone(f, t + 0.07, 0.5, 'triangle', 0.08); });
      for (var c = 0; c < 14; c++) {                                                         // coins
        var at = t + 0.25 + c * 0.1 + Math.random() * 0.05, f2 = 2800 + Math.random() * 2600;
        tone(f2, at, 0.12, 'triangle', 0.09 * (1 - c / 16)); tone(f2 * 1.5, at + 0.01, 0.08, 'sine', 0.04 * (1 - c / 16));
      }
    },
    cheer: function () { if (!ac()) return; var t = ctx.currentTime; [72, 76, 79, 84].forEach(function (m, i) { tone(hz(m), t + i * 0.09, 0.5, 'triangle', 0.18); }); }
  };
})();
