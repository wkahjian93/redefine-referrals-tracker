/* Photo privacy: shrink the photo, find faces on the phone, and draw the covered version.
   Boxes are fractions of the photo (x, y, w, h in 0..1) so they work at any size.
   kinds: private (AI found contact/age/remarks...), face, manual (agent drew it). */
var REDACT = (function () {
  var FACE_LIB = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  var FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
  var detector = null;

  function loadImage(file) {
    return new Promise(function (ok, bad) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { ok(img); };
      img.onerror = function () { bad(new Error('Could not open this photo. Please try a JPG or PNG photo.')); };
      img.src = url;
    });
  }
  function toCanvas(img, maxSide) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, k = Math.min(1, maxSide / Math.max(w, h));
    var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  function b64(canvas, q) { return canvas.toDataURL('image/jpeg', q || 0.85).split(',')[1]; }

  async function faces(canvas) {
    if (!detector) {
      var v = await import(FACE_LIB + '/vision_bundle.mjs');
      var fs = await v.FilesetResolver.forVisionTasks(FACE_LIB + '/wasm');
      detector = await v.FaceDetector.createFromOptions(fs, {baseOptions: {modelAssetPath: FACE_MODEL, delegate: 'CPU'}, runningMode: 'IMAGE', minDetectionConfidence: 0.55});   // 0.55: real faces score ~0.9; the referral book's faded circles scored 0.39
    }
    var out = [];
    // look at the whole photo, then at four overlapping quarters so small faces in group photos are found too
    var parts = [[0, 0, 1, 1], [0, 0, .6, .6], [.4, 0, .6, .6], [0, .4, .6, .6], [.4, .4, .6, .6]];
    parts.forEach(function (p) {
      var c = document.createElement('canvas'), W = canvas.width, H = canvas.height;
      c.width = Math.round(W * p[2]); c.height = Math.round(H * p[3]);
      c.getContext('2d').drawImage(canvas, W * p[0], H * p[1], c.width, c.height, 0, 0, c.width, c.height);
      (detector.detect(c).detections || []).forEach(function (d) {
        var b = d.boundingBox;
        out.push({kind: 'face', x: p[0] + b.originX / W, y: p[1] + b.originY / H, w: b.width / W, h: b.height / H});
      });
    });
    return out;
  }

  function pad(b, k) {
    var px = b.w * k + 0.008, py = b.h * k + 0.006;
    var x = Math.max(0, b.x - px), y = Math.max(0, b.y - py);
    return {x: x, y: y, w: Math.min(1 - x, b.w + 2 * px), h: Math.min(1 - y, b.h + 2 * py)};
  }
  /* draws the covered photo; returns the canvas */
  function render(src, boxes, out) {
    out = out || document.createElement('canvas');
    out.width = src.width; out.height = src.height;
    var g = out.getContext('2d'), W = out.width, H = out.height;
    g.drawImage(src, 0, 0);
    boxes.forEach(function (b) {
      if (b.off) return;
      if (b.kind === 'face') {
        var f = pad(b, 0.25), cx = (f.x + f.w / 2) * W, cy = (f.y + f.h / 2) * H, r = Math.max(f.w * W, f.h * H) / 2;
        g.fillStyle = '#E8B04B'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
        g.font = Math.round(r * 1.3) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🙂', cx, cy + r * 0.06);
        return;
      }
      var p = pad(b, 0.06);
      g.fillStyle = '#111318'; g.fillRect(p.x * W, p.y * H, p.w * W, p.h * H);
      var fs = Math.min(p.h * H * 0.5, 22);
      if (fs >= 9 && p.w * W > fs * 4) { g.fillStyle = '#E8B04B'; g.font = '600 ' + Math.round(fs) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('PRIVATE', (p.x + p.w / 2) * W, (p.y + p.h / 2) * H); }
    });
    return out;
  }
  /* the box (if any) under a point, for tap-to-remove */
  function hit(boxes, x, y) {
    for (var i = boxes.length - 1; i >= 0; i--) { var b = boxes[i]; if (!b.off && x >= b.x - .01 && x <= b.x + b.w + .01 && y >= b.y - .01 && y <= b.y + b.h + .01) return i; }
    return -1;
  }
  return {loadImage: loadImage, toCanvas: toCanvas, b64: b64, faces: faces, render: render, hit: hit};
})();
