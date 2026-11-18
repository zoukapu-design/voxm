// writes synthetic "voices" (vowel-like pulse trains) as WAV for the friend-profile flow test
const fs = require('fs');
function synth(sr, sec, f0, fs_, seed) {
  const n = sr * sec, src = new Float32Array(n); let ph = 0, r = seed;
  for (let i = 0; i < n; i++) { const env = Math.sin(Math.PI * ((i / sr) % 1.6) / 1.6) > 0.15 ? 1 : 0; const f = f0 * (1 + 0.04 * Math.sin(2 * Math.PI * 0.7 * i / sr)); ph += f / sr; if (ph >= 1) { ph -= 1; src[i] = env; } r = (r * 16807) % 2147483647; src[i] += (r / 2147483647 - 0.5) * 0.01; }
  let sig = src;
  for (const [f, bw] of [[730, 90], [1090, 110], [2440, 160]]) { const rr = Math.exp(-Math.PI * bw * fs_ / sr), c = 2 * rr * Math.cos(2 * Math.PI * f * fs_ / sr), d = -rr * rr, y = new Float32Array(n); for (let i = 0; i < n; i++) y[i] = sig[i] * (1 - rr) + c * (y[i - 1] || 0) + d * (y[i - 2] || 0); sig = y; }
  let pk = 0; for (const v of sig) pk = Math.max(pk, Math.abs(v)); return sig.map((v) => v / pk * 0.6);
}
function wav(samples, sr) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2)); return b;
}
fs.writeFileSync(__dirname + '/me.wav', wav(synth(44100, 8, 118, 1.0, 3), 44100));
fs.writeFileSync(__dirname + '/friend.wav', wav(synth(44100, 14, 215, 1.16, 9), 44100));
console.log('ok');
