export function deckDirectionSummary({ headline = '', hint = '', current = null, destination = null, uncertain = false }) {
  const words = [headline, hint].filter(Boolean).join(' · ').slice(0, 180);
  if (words) return words;
  if (!uncertain && current && destination && current === destination) return 'You have arrived.';
  return 'Waiting for a route';
}
