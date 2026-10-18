import { useEffect, useRef } from 'react';

const IDLE_MS = 60_000;
const ACTIVITY_EVENTS = ['keydown', 'mousedown', 'mousemove', 'wheel', 'touchstart'] as const;

// Net working time: counts a second while the tab is visible and the reviewer did something
// in the last minute, or the player is playing (listening is work too).
// A ref, not state: it ticks every second and is only read when saving.
export default function useActiveSeconds(initial: number, playing: boolean) {
  const seconds = useRef(initial);
  const lastActivity = useRef(Date.now());
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    const touch = () => {
      lastActivity.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const id = setInterval(() => {
      const active = playingRef.current || Date.now() - lastActivity.current < IDLE_MS;
      if (document.visibilityState === 'visible' && active) seconds.current++;
    }, 1000);
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, touch));
      clearInterval(id);
    };
  }, []);

  return seconds;
}
