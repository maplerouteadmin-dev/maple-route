// A player's explicit finish must win over a stale Quest Helper or In Progress reading.
// Older erroneous completion flags in the user's plan are cleared during profile loading.
export function questVisible(name, finished = []) {
  return !finished.includes(name);
}
