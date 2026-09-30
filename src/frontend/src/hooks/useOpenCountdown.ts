// useOpenCountdown — computes a live HH:MM:SS countdown to the store's next
// opening time, given openHour/openMinute from getStoreHours(). Store hours
// are always interpreted in Vietnam local time (UTC+7, no DST), matching the
// backend's isStoreOpen (lib/store-hours-config.mo) — so this works correctly
// regardless of the customer's own device timezone.

import { useEffect, useState } from "react";

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface OpenCountdown {
  /** Milliseconds remaining until the store opens. 0 once reached. */
  remainingMs: number;
  /** "HH:MM:SS" formatted remaining time. */
  formatted: string;
}

// Next UTC epoch ms at which the VN wall-clock reads openHour:openMinute:00,
// strictly after `nowMs`. Shifting by the fixed +7h offset before reading
// UTC date/time fields is a standard trick to compute a fixed-offset
// timezone's wall-clock without a timezone database.
function nextOpenTimestamp(
  openHour: number,
  openMinute: number,
  nowMs: number,
): number {
  const shiftedNow = new Date(nowMs + VN_OFFSET_MS);
  const candidateShifted = Date.UTC(
    shiftedNow.getUTCFullYear(),
    shiftedNow.getUTCMonth(),
    shiftedNow.getUTCDate(),
    openHour,
    openMinute,
    0,
    0,
  );
  let candidateUtc = candidateShifted - VN_OFFSET_MS;
  if (candidateUtc <= nowMs) {
    candidateUtc += DAY_MS;
  }
  return candidateUtc;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * Live countdown to the store's next opening time. Ticks every second.
 * Pass `undefined` while store hours are still loading — the hook then
 * reports a zeroed countdown without starting a timer.
 */
export function useOpenCountdown(
  openHour: number | undefined,
  openMinute: number | undefined,
): OpenCountdown {
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    if (openHour === undefined || openMinute === undefined) {
      setRemainingMs(0);
      return;
    }

    function tick() {
      const now = Date.now();
      const target = nextOpenTimestamp(
        openHour as number,
        openMinute as number,
        now,
      );
      setRemainingMs(target - now);
    }

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [openHour, openMinute]);

  return { remainingMs, formatted: formatDuration(remainingMs) };
}
