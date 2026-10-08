// "Ends in 3 h" for a deal's end; empty when it has no end (or has ended)
export function dealEnds(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const left = new Date(iso).getTime() - now;
  if (!(left > 0)) return '';
  const minutes = Math.ceil(left / 60_000);
  if (minutes < 60) return `Ends in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Ends in ${hours} h`;
  return 'Ends ' + new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
