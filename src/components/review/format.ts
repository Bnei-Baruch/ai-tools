// "m:ss"
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const formatMinutes = (seconds: number) => `${Math.round(seconds / 60)} דק׳`;