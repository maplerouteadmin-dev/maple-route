// The Linux wrapper owns natural offline speech; Windows keeps Edge's installed voices.
export const usesLocalVoice = platform => platform === 'linux';
