// Compression des médias pour l'aperçu et l'archive. Les ORIGINAUX ne sont jamais modifiés : on ne fait que les lire.
// Aucune dépendance : tout passe par le navigateur (canvas, MediaRecorder).

const canvasDe = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const vers = (c, q) => new Promise(r => c.toBlob(r, 'image/jpeg', q));
export const dataUrl = blob => new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = () => rej(f.error); f.readAsDataURL(blob); });
export const depuisDataUrl = u => { const m = /^data:([^;,]+)[^,]*;base64,(.*)$/.exec(u || ''); if (!m) return null; const b = atob(m[2]), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return { type: m[1], bytes: a }; };

/** Dessine `src` (image, canvas, vidéo) en JPEG, en réduisant taille puis qualité jusqu'à passer sous `maxBytes`. */
export async function jpegSousLimite(src, sw, sh, { max = 480, maxBytes = 20000 } = {}) {
  let dernier = null;
  for (const m of [max, Math.round(max * .83), Math.round(max * .67), Math.round(max * .53), Math.round(max * .42)]) {
    const k = Math.min(1, m / Math.max(sw, sh)), w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
    const c = canvasDe(w, h), x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, w, h); x.drawImage(src, 0, 0, w, h);
    for (const q of [.72, .6, .5, .4, .3]) { const b = await vers(c, q); dernier = { blob: b, w, h }; if (b.size <= maxBytes) return dernier; }
  }
  return dernier;
}
export async function miniatureImage(file, opts) {
  const bmp = await createImageBitmap(file);
  try { return await jpegSousLimite(bmp, bmp.width, bmp.height, opts); } finally { bmp.close?.(); }
}
const attendre = (ms, p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('vidéo illisible (délai dépassé)')), ms))]);
async function ouvrirVideo(file) {
  const url = URL.createObjectURL(file), v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  await attendre(15000, new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('vidéo illisible')); }));
  return { v, url };
}
export async function miniatureVideo(file, opts) {
  const { v, url } = await ouvrirVideo(file);
  try {
    const t = Math.min(1.5, (v.duration || 2) * 0.3);
    if (t > 0.05) await attendre(10000, new Promise(res => { v.onseeked = res; v.currentTime = t; }));
    return await jpegSousLimite(v, v.videoWidth, v.videoHeight, opts);
  } finally { URL.revokeObjectURL(url); }
}
/** Plusieurs images côte à côte en une seule miniature (carrousel). */
export async function mosaique(files, { max = 480, maxBytes = 20000 } = {}) {
  const l = files.slice(0, 5), bmps = await Promise.all(l.map(f => createImageBitmap(f)));
  try {
    const W = max, H = Math.round(max * .5), cw = W / bmps.length, c = canvasDe(W, H), x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    bmps.forEach((b, i) => { const k = Math.max(cw / b.width, H / b.height), sw = cw / k, sh = H / k; x.drawImage(b, (b.width - sw) / 2, (b.height - sh) / 2, sw, sh, i * cw, 0, cw - 2, H); });
    return await jpegSousLimite(c, W, H, { max, maxBytes });
  } finally { bmps.forEach(b => b.close?.()); }
}

/** Petite vidéo : 480 p, débit adapté pour rester autour de `maxBytes`. Se joue en temps réel (durée de la vidéo) : garder la fenêtre visible. */
export async function compresserVideo(file, { hauteur = 480, maxBytes = 3000000, onProgress = () => {} } = {}) {
  if (typeof MediaRecorder === 'undefined') throw new Error('Ce navigateur ne sait pas compresser une vidéo (utilise Chrome ou Edge)');
  const { v, url } = await ouvrirVideo(file); v.muted = false;
  let ac = null;
  try {
    const dur = v.duration; if (!isFinite(dur) || dur <= 0) throw new Error('durée de la vidéo inconnue');
    const h = Math.min(hauteur, v.videoHeight) & ~1, w = Math.round(v.videoWidth * h / v.videoHeight / 2) * 2, abps = 64000;
    const vbps = Math.max(200000, Math.min(900000, Math.floor(maxBytes * 8 * 0.8 / dur) - abps));
    const c = canvasDe(w, h), x = c.getContext('2d');
    ac = new AudioContext(); const src = ac.createMediaElementSource(v), dest = ac.createMediaStreamDestination(); src.connect(dest);   // non relié aux haut-parleurs : silence pendant la compression
    const stream = new MediaStream([...c.captureStream(25).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const mime = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
    if (!mime) throw new Error('aucun format de compression disponible');
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: vbps, audioBitsPerSecond: abps }), morceaux = [];
    rec.ondataavailable = e => e.data.size && morceaux.push(e.data);
    const arrete = new Promise(res => { rec.onstop = res; });
    const fini = new Promise(res => { v.onended = res; });
    x.drawImage(v, 0, 0, w, h); rec.start(1000); await ac.resume(); await v.play();
    const t = setInterval(() => { x.drawImage(v, 0, 0, w, h); onProgress(Math.min(1, v.currentTime / dur)); }, 40);
    try { await attendre(dur * 1500 + 15000, fini); } finally { clearInterval(t); }
    x.drawImage(v, 0, 0, w, h); await new Promise(r => setTimeout(r, 200)); rec.stop(); await arrete;
    const blob = new Blob(morceaux, { type: mime.split(';')[0] });
    return { blob, ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm', octets: blob.size, duree: dur, trop_gros: blob.size > maxBytes * 1.2 };
  } finally { URL.revokeObjectURL(url); try { await ac?.close(); } catch {} }
}
