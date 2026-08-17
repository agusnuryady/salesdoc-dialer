export function formatElapsed(startedAtIso: string, referenceMs: number): string {
  const startedMs = new Date(startedAtIso).getTime();
  const deltaSeconds = Math.max(0, Math.floor((referenceMs - startedMs) / 1000));
  const minutes = Math.floor(deltaSeconds / 60);
  const seconds = deltaSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
