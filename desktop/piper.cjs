// Natural voices on the Steam Deck / Linux: Piper (MIT, github.com/rhasspy/piper) running on this
// device, with a few voices whose licences allow this use (credited in the README). Downloaded once
// into ~/.local/share/MapleRoute/piper; nothing is bundled. One Piper process stays running with the
// voice loaded, so a line starts in well under a second; it plays through PipeWire (pw-play).
const { spawn, execFile } = require('node:child_process');
const { createWriteStream, existsSync, mkdirSync, rmSync, renameSync, unlink } = require('node:fs');
const { join } = require('node:path');
const { homedir, tmpdir } = require('node:os');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');

const PROGRAM = 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz';
const VOICE_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main';
// Only voices whose model cards allow this use: public domain, CC0, CC BY, CC BY-SA.
const VOICES = {
  kristin: { lang: 'en_US', label: 'Kristin (US, female)', licence: 'public domain' },
  joe: { lang: 'en_US', label: 'Joe (US, male)', licence: 'CC0' },
  alba: { lang: 'en_GB', label: 'Alba (UK, female)', licence: 'CC BY 4.0' },
  northern_english_male: { lang: 'en_GB', label: 'Northern English Male (UK)', licence: 'CC BY-SA 4.0' }
};
const DEFAULT_VOICE = 'kristin';

const dataDir = () => join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'MapleRoute', 'piper');
const programPath = () => join(dataDir(), 'piper', 'piper');
const voiceFile = name => join(dataDir(), 'voices', `${VOICES[name].lang}-${name}-medium.onnx`);
const voiceUrl = name => { const { lang } = VOICES[name]; return `${VOICE_BASE}/${lang.slice(0, 2)}/${lang}/${name}/medium/${lang}-${name}-medium.onnx`; };
const voiceReady = name => Boolean(VOICES[name]) && existsSync(voiceFile(name)) && existsSync(voiceFile(name) + '.json');
const programReady = () => existsSync(programPath());

async function download(url, to) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status})`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(to + '.part'));
  renameSync(to + '.part', to);
}

let installing = null;
// Program and one voice; safe to call again (does nothing once installed).
function install(name = DEFAULT_VOICE) {
  if (!VOICES[name]) name = DEFAULT_VOICE;
  if (programReady() && voiceReady(name)) return Promise.resolve(true);
  installing ??= (async () => {
    mkdirSync(join(dataDir(), 'voices'), { recursive: true });
    if (!programReady()) {
      const archive = join(dataDir(), 'piper.tar.gz');
      await download(PROGRAM, archive);
      await new Promise((resolve, reject) => execFile('tar', ['-xzf', archive, '-C', dataDir()], error => error ? reject(error) : resolve()));
      rmSync(archive, { force: true });
    }
    if (!voiceReady(name)) {
      await download(voiceUrl(name) + '.json', voiceFile(name) + '.json');
      await download(voiceUrl(name), voiceFile(name));
    }
    return true;
  })().finally(() => { installing = null; });
  return installing;
}

// One running Piper per voice + speed; each line becomes a WAV that pw-play plays, newest first.
let engine = null, player = null, lineNumber = 0;
function startEngine(name, rate) {
  engine?.child.kill();
  const lengthScale = Math.max(.6, Math.min(1.6, 1 / (Number(rate) || 1)));
  const child = spawn(programPath(), ['--model', voiceFile(name), '--json-input', '--length_scale', String(lengthScale)], { stdio: ['pipe', 'pipe', 'ignore'] });
  const current = { child, name, rate, pending: '' };
  child.stdout.on('data', chunk => {
    current.pending += String(chunk);
    let at;
    while ((at = current.pending.indexOf('\n')) >= 0) {
      const file = current.pending.slice(0, at).trim(); current.pending = current.pending.slice(at + 1);
      if (file.endsWith('.wav') && file === current.latest) play(file);
      else if (file.endsWith('.wav')) unlink(file, () => {});
    }
  });
  child.on('exit', () => { if (engine === current) engine = null; });
  child.stdin.on('error', () => {});
  engine = current;
  return current;
}
function play(file) {
  player?.kill();
  player = spawn('pw-play', [file], { stdio: 'ignore' });
  const mine = player;
  mine.on('exit', () => { unlink(file, () => {}); if (player === mine) player = null; });
  mine.on('error', () => { unlink(file, () => {}); });
}

// Speak with Piper; false when it is not installed (the caller falls back to espeak-ng).
function speak(text, rate = 1, name = DEFAULT_VOICE) {
  if (!VOICES[name] || !voiceReady(name)) name = Object.keys(VOICES).find(voiceReady) ?? null;
  if (!name || !programReady()) return false;
  const words = String(text ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 500);
  if (!words) return true;
  const running = engine && engine.name === name && engine.rate === rate ? engine : startEngine(name, rate);
  const file = join(tmpdir(), `maple-route-voice-${process.pid}-${++lineNumber}.wav`);
  running.latest = file;
  running.child.stdin.write(JSON.stringify({ text: words, output_file: file }) + '\n');
  return true;
}

function stop() { engine?.child.kill(); engine = null; player?.kill(); player = null; }
const voiceList = () => Object.entries(VOICES).map(([id, v]) => ({ id, label: v.label, licence: v.licence, ready: voiceReady(id) }));

module.exports = { VOICES, DEFAULT_VOICE, voiceUrl, voiceList, install, speak, stop, programReady, voiceReady };
