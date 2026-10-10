// Minimal WAV helpers for voice clips. Phone lines carry 8 kHz audio, so the dashboard
// records 16 kHz mono 16-bit PCM WAV: small files that Twilio <Play> accepts as-is.

const MAX_SECONDS = 30;

/** Parse a PCM WAV buffer. Throws a friendly error if it isn't one we can use. */
function parse(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Recording must be a WAV file');
  }
  let fmt = null, data = null;
  for (let off = 12; off + 8 <= buf.length;) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === 'fmt ') {
      fmt = { format: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), sampleRate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    } else if (id === 'data') {
      data = { offset: body, length: Math.min(size, buf.length - body) };
      break;
    }
    off = body + size + (size % 2); // chunks are word-aligned
  }
  if (!fmt || !data) throw new Error('Recording is incomplete');
  if (fmt.format !== 1 || fmt.bits !== 16 || fmt.channels !== 1) throw new Error('Recording must be 16-bit mono PCM');
  if (fmt.sampleRate < 8000 || fmt.sampleRate > 48000) throw new Error('Unsupported sample rate');
  const durationMs = Math.round((data.length / 2 / fmt.sampleRate) * 1000);
  if (durationMs < 300) throw new Error('Recording is too short');
  if (durationMs > MAX_SECONDS * 1000) throw new Error(`Recording is longer than ${MAX_SECONDS} seconds`);
  return { ...fmt, dataOffset: data.offset, dataLength: data.length, durationMs };
}

/** A compact waveform (0..1 per bar) for drawing in the dashboard. */
function peaks(buf, info = parse(buf), bars = 56) {
  const samples = info.dataLength / 2;
  const per = Math.max(1, Math.floor(samples / bars));
  const out = [];
  let loudest = 0;
  for (let b = 0; b < bars; b++) {
    let max = 0;
    const start = b * per;
    for (let i = start; i < Math.min(samples, start + per); i++) {
      const v = Math.abs(buf.readInt16LE(info.dataOffset + i * 2));
      if (v > max) max = v;
    }
    out.push(max);
    loudest = Math.max(loudest, max);
  }
  return out.map((v) => Math.round((loudest ? v / loudest : 0) * 100) / 100);
}

/** Wrap raw 16-bit mono PCM (e.g. from a voice API) in a WAV header. */
function fromPcm(pcm, sampleRate = 16000) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

module.exports = { parse, peaks, fromPcm, MAX_SECONDS };
