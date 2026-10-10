// Voice adaptation provider (optional). Learns a family member's voice from the lines they
// recorded, then speaks lines they haven't recorded in that same voice: a new medicine,
// the typed message for Amma, and so on.
//
// Uses ElevenLabs Instant Voice Cloning. To use another provider, implement these three functions.
// Only ever clone the voice of the person who recorded it, with their consent (the dashboard asks).
const config = require('../config');
const wav = require('../services/wav');

const API = 'https://api.elevenlabs.io/v1';

const enabled = () => !!config.elevenlabs.apiKey;
const headers = () => ({ 'xi-api-key': config.elevenlabs.apiKey });

/** Create a voice from recorded WAV samples. Returns the provider's voice id. */
async function createVoice(name, samples) {
  const form = new FormData();
  form.append('name', name);
  form.append('description', 'Amma Check-in family voice (recorded with consent)');
  form.append('remove_background_noise', 'true');
  samples.forEach((buf, i) => form.append('files', new Blob([buf], { type: 'audio/wav' }), `sample-${i + 1}.wav`));
  const res = await fetch(`${API}/voices/add`, { method: 'POST', headers: headers(), body: form });
  if (!res.ok) throw new Error(`Voice adaptation failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).voice_id;
}

/** Speak `text` in the adapted voice. Returns a 16 kHz mono WAV buffer. */
async function synthesize(providerVoiceId, text) {
  const res = await fetch(`${API}/text-to-speech/${encodeURIComponent(providerVoiceId)}?output_format=pcm_16000`, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: config.elevenlabs.model,
      voice_settings: { stability: 0.6, similarity_boost: 0.85 }, // calm and recognisable
    }),
  });
  if (!res.ok) throw new Error(`Speech failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return wav.fromPcm(Buffer.from(await res.arrayBuffer()), 16000);
}

/** Forget a voice at the provider (when the family deletes it). */
async function deleteVoice(providerVoiceId) {
  const res = await fetch(`${API}/voices/${encodeURIComponent(providerVoiceId)}`, { method: 'DELETE', headers: headers() });
  if (!res.ok && res.status !== 404) throw new Error(`Could not delete voice (${res.status})`);
}

module.exports = { enabled, createVoice, synthesize, deleteVoice };
