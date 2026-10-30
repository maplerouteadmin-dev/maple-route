// The pairing card is optional. Reading continues when the card or pop-up is hidden.
function shouldShowPairing({ hasQr, phoneConnected, early, reading, dismissed, forced = false }) {
  return Boolean(hasQr && !phoneConnected && !dismissed && (forced || early || !reading));
}

module.exports = { shouldShowPairing };
