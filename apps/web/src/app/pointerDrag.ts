// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { PointerEvent as ReactPointerEvent } from 'react';

/** One captured pointer; cleanup also covers cancellation, lost capture and unmount. */
export function pointerDrag(event: ReactPointerEvent<HTMLElement>, move: (event: PointerEvent) => void, end: (event?: PointerEvent) => void) {
  const target = event.currentTarget;
  const id = event.pointerId;
  let stopped = false;
  const onMove = (next: PointerEvent) => { if (next.pointerId === id) move(next); };
  const stop = (event?: PointerEvent) => {
    if (stopped) return;
    stopped = true;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onEnd);
    window.removeEventListener('pointercancel', onEnd);
    target.removeEventListener('lostpointercapture', onEnd);
    if (target.hasPointerCapture(id)) target.releasePointerCapture(id);
    end(event);
  };
  const onEnd = (next: PointerEvent) => { if (next.pointerId === id) stop(next); };
  target.setPointerCapture(id);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onEnd);
  window.addEventListener('pointercancel', onEnd);
  target.addEventListener('lostpointercapture', onEnd);
  return stop;
}
