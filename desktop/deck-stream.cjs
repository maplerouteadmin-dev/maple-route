const { execFile, spawn } = require('node:child_process');
const { join } = require('node:path');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

function findGamescopeNode(dump) {
  if (!Array.isArray(dump)) return null;
  const node = dump.find(item => item?.type === 'PipeWire:Interface:Node' &&
    item.info?.props?.['node.name'] === 'gamescope' &&
    item.info?.props?.['media.class'] === 'Video/Source');
  return Number.isInteger(node?.id) && node.id >= 0 ? node.id : null;
}

async function lookupGamescopeNode() {
  const { stdout } = await execFileAsync('pw-dump', [], { timeout: 4000, maxBuffer: 16 * 1024 * 1024 });
  return findGamescopeNode(JSON.parse(stdout));
}

function parseFrames(onFrame) {
  let pending = Buffer.alloc(0);
  return chunk => {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= 12) {
      const size = pending.readUInt32LE(0), width = pending.readUInt32LE(4), height = pending.readUInt32LE(8);
      if (!width || !height || width > 4096 || height > 4096 || size !== width * height * 4)
        throw new Error('Invalid capture frame header');
      if (pending.length < 12 + size) break;
      onFrame({ width, height, pixels: pending.subarray(12, 12 + size) });
      pending = pending.subarray(12 + size);
    }
  };
}

class DeckStream {
  constructor(onState = () => {}) {
    this.onState = onState;
    this.child = null;
    this.frame = null;
    this.state = 'off';
    this.error = null;
    this.frames = 0;
  }
  async start() {
    if (this.child) return;
    this.error = null;
    this.frame = null;
    this.frames = 0;
    const node = await lookupGamescopeNode();
    if (node === null) throw new Error('The gamescope screen stream is unavailable. Return to Gaming Mode and try again.');
    this.state = 'starting'; this.onState(this.status());
    const env = { ...process.env, XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid()}` };
    const child = spawn('python3', [require('./unpacked.cjs').unpacked(join(__dirname, 'deck-pipewire.py')), String(node)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    this.child = child;
    const consume = parseFrames(frame => {
      if (this.child !== child) return;
      this.frame = frame; this.frames++;
      if (this.state !== 'reading') { this.state = 'reading'; this.onState(this.status()); }
    });
    child.stdout.on('data', chunk => {
      try { consume(chunk); } catch (error) { this.error = error.message; this.stop(); }
    });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-2000); });
    child.on('error', error => { this.error = error.message; this.stop(); });
    child.on('exit', (code, signal) => {
      if (this.child !== child) return;
      this.child = null; this.frame = null;
      this.state = 'off';
      this.error = this.error || (code ? `Capture stopped (${code}): ${stderr.trim().slice(-250)}` : signal ? `Capture stopped (${signal})` : null);
      this.onState(this.status());
    });
    // A negotiated link with no pixels is not a working reader. Stop promptly.
    setTimeout(() => {
      if (this.child === child && !this.frame) {
        this.error = 'No game frames arrived. Capture stopped; the gamescope node may need a Gaming Mode restart.';
        this.stop();
      }
    }, 7000).unref();
  }
  stop() {
    const child = this.child;
    this.child = null; this.frame = null; this.state = 'off';
    child?.kill('SIGTERM');
    this.onState(this.status());
  }
  status() { return { state: this.state, error: this.error, frames: this.frames, width: this.frame?.width ?? null, height: this.frame?.height ?? null }; }
}

module.exports = { findGamescopeNode, parseFrames, DeckStream };
