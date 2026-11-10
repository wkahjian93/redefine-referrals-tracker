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
    cheer: function () { if (!ac()) return; var t = ctx.currentTime; [72, 76, 79, 84].forEach(function (m, i) { tone(hz(m), t + i * 0.09, 0.5, 'triangle', 0.18); }); }
  };
})();
