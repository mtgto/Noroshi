// 依存ゼロで短い WAV (44.1kHz/16bit/mono PCM) を合成する。
const fs = require("fs");
const path = require("path");

const SAMPLE_RATE = 44100;

/** samples: Float32 相当の数値配列 (-1..1) を 16bit PCM WAV Buffer に変換 */
function pcm16Wav(samples, sampleRate = SAMPLE_RATE) {
  const dataLen = samples.length * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate = rate * blockAlign
  buf.writeUInt16LE(2, 32); // block align = channels * bytesPerSample
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36);
  buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

/** freq(Hz) を dur(秒) 鳴らす。attack/release エンベロープでクリック音を防ぐ。 */
function tone(freq, dur, gain = 0.5) {
  const n = Math.floor(SAMPLE_RATE * dur);
  const out = [];
  const atk = Math.floor(SAMPLE_RATE * 0.008);
  const rel = Math.floor(SAMPLE_RATE * 0.05);
  for (let i = 0; i < n; i++) {
    let env = 1;
    if (i < atk) env = i / atk;
    else if (i > n - rel) env = Math.max(0, (n - i) / rel);
    out.push(Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE) * gain * env);
  }
  return out;
}

function concat(...chunks) {
  return chunks.flat();
}

// 応答待ち: 落ち着いた 2 音 (ソ→ミ 風)。控えめ。
const waiting = concat(tone(660, 0.14, 0.45), tone(530, 0.2, 0.4));
// 完了: 上昇するトライアド (ド→ミ→ソ)。達成感。
const done = concat(tone(523, 0.11, 0.4), tone(659, 0.11, 0.4), tone(784, 0.24, 0.45));

const outDir = path.join(__dirname, "..", "media", "sounds");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "waiting.wav"), pcm16Wav(waiting));
fs.writeFileSync(path.join(outDir, "done.wav"), pcm16Wav(done));

// 生成物の健全性を自己チェック (RIFF/WAVE ヘッダ)。
for (const f of ["waiting.wav", "done.wav"]) {
  const b = fs.readFileSync(path.join(outDir, f));
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`generated ${f} has invalid WAV header`);
  }
  console.log(`wrote media/sounds/${f} (${b.length} bytes)`);
}
