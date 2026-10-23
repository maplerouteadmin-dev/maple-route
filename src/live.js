// One screen-share for a whole play session. The game is never touched: the browser receives the
// same video a streaming app would, and the app samples a frame from it about once a second.
export async function startCapture() {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Screen sharing is unavailable in this browser. Use Chrome or Edge on a desktop.');
  // Suggest the game window: a window share sees the game even with the pop-out on top of it.
  // Sharing normally pulls the shared window (or a browser window) to the front; ask the browser
  // to leave window focus alone (CaptureController, Chrome/Edge 122+).
  const controller = typeof CaptureController !== 'undefined' ? new CaptureController() : null;
  try { controller?.setFocusBehavior?.('no-focus-change'); } catch { /* older browsers */ }
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 5, max: 10 }, displaySurface: 'window' }, audio: false, selfBrowserSurface: 'exclude', surfaceSwitching: 'include', monitorTypeSurfaces: 'include', ...(controller ? { controller } : {}) });
  // Older Chrome only accepts the focus choice right after the share starts, in the same task.
  try { controller?.setFocusBehavior?.('no-focus-change'); } catch { /* already set */ }
  const track = stream.getVideoTracks()[0];
  const capture = typeof ImageCapture !== 'undefined' ? new ImageCapture(track) : null;
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.srcObject = stream;
  await video.play().catch(() => {});
  return {
    track,
    async grab() {
      // grabFrame waits for the *next* frame and can wait forever when the shared window stops
      // repainting (a still death screen, a minimised window): give up after 1.5 s and use the
      // video element's last frame instead.
      if (capture) {
        try {
          const bitmap = await Promise.race([capture.grabFrame(), new Promise((_, reject) => setTimeout(() => reject(new Error('frame timeout')), 1500))]);
          return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close?.() };
        } catch { /* fall back to the video element */ }
      }
      if (!video.videoWidth) throw new Error('Waiting for the first video frame.');
      return { source: video, width: video.videoWidth, height: video.videoHeight, release() {} };
    },
    stop() { stream.getTracks().forEach(t => t.stop()); video.srcObject = null; }
  };
}

// Timers on a hidden page are throttled hard (you are looking at the game, not this tab), but a
// worker's timer keeps its pace, so it drives the sampling loop.
export function ticker(ms, onTick) {
  const url = URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${Number(ms)});`], { type: 'text/javascript' }));
  const worker = new Worker(url);
  worker.onmessage = onTick;
  return () => { worker.terminate(); URL.revokeObjectURL(url); };
}
