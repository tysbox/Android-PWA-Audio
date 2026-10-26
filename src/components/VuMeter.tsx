import React, { useEffect, useRef, useState } from 'react';

interface VuMeterProps {
  level: number; // linear amplitude, 0.0 to 1.0 (post-fader)
  isDimmed?: boolean;
  className?: string;
}

/**
 * Display range of the meter, in dBFS.
 *
 * <p>The bar is a logarithmic instrument: perceptually and musically, level is
 * judged in decibels, so a linear amplitude scale spends most of its travel in
 * the top few percent. That is why a loud, properly mastered track arriving
 * post-fader — the limiter targets ~0.98, then the master stage multiplies by
 * the volume knob, which is (level/max)^2 — used to sit around 40% of the bar
 * and never approach the top: at a normal listening volume of 0.49 the peak
 * arrives as ~0.44 amplitude, which is only -7 dBFS and nowhere near clipping.
 * The old `pow(x, 0.7)` curve did not fix this, because the shortfall is in
 * where the scale ENDS, not in its curvature.
 *
 * <p>-30..0 dBFS over 20 segments is 1.5 dB per segment, which also gives the
 * colour bands real meaning instead of decoration: red begins at -4.5 dBFS,
 * amber at -10.5 dBFS, and the first green segment at -28.5 dBFS. Red
 * therefore means "genuinely hot" rather than "the music is loud".
 */
const METER_FLOOR_DB = -30;
const METER_CEIL_DB = 0;

/**
 * Maps a linear post-fader amplitude to the meter's 0..1 display scale.
 *
 * <p>Exported for verification. Handles the degenerate inputs the audio path
 * can actually produce: exact silence (log10(0) is -Infinity), a denormal, a
 * non-finite value from a corrupt bridge message, and an over-range peak from
 * a hot master in the bit-perfect path, which is pinned to full scale because
 * the meter has no headroom above 0 dBFS.
 */
export function linearToMeterScale(level: number): number {
  if (!Number.isFinite(level) || level <= 0) return 0;
  const db = 20 * Math.log10(level);
  if (db <= METER_FLOOR_DB) return 0;
  if (db >= METER_CEIL_DB) return 1;
  return (db - METER_FLOOR_DB) / (METER_CEIL_DB - METER_FLOOR_DB);
}

/**
 * Ballistics for the meter.
 *
 * <p>The bridge reports the raw sample peak roughly every 170ms
 * (`playbackTime` -> peakL/peakR). Driving 20 discrete segments straight from
 * that signal makes them flicker between lit and unlit, because each frame is
 * an independent maximum over a different window of audio.
 *
 * <p>Standard meter ballistics fix this: attack is instantaneous so a
 * transient still reads at full height, while the release falls back at a
 * fixed rate in dB/second so the bar behaves like a physical meter instead of
 * noise. The decay runs on requestAnimationFrame in this component only, so it
 * does not re-render the rest of the app on every frame.
 */
const RELEASE_DB_PER_SEC = 22;
const SILENCE_DB = -120;

function linearToDb(level: number): number {
  if (!Number.isFinite(level) || level <= 0) return SILENCE_DB;
  return 20 * Math.log10(level);
}



function dbToMeterScale(db: number): number {
  if (db <= METER_FLOOR_DB) return 0;
  if (db >= METER_CEIL_DB) return 1;
  return (db - METER_FLOOR_DB) / (METER_CEIL_DB - METER_FLOOR_DB);
}

export const VuMeter: React.FC<VuMeterProps> = ({ level, isDimmed = false, className = '' }) => {
  const barCount = 20;

  const targetDbRef = useRef(linearToDb(level));
  const displayDbRef = useRef(linearToDb(level));
  const [meterScale, setMeterScale] = useState(() => linearToMeterScale(level));

  useEffect(() => {
    targetDbRef.current = linearToDb(level);
  }, [level]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      const target = targetDbRef.current;
      const current = displayDbRef.current;
      // Instant attack, linear-in-dB release.
      const next = target >= current ? target : Math.max(target, current - RELEASE_DB_PER_SEC * dt);
      displayDbRef.current = next;
      const nextScale = dbToMeterScale(next);
      setMeterScale((prev) => (Math.abs(prev - nextScale) < 0.002 ? prev : nextScale));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const clampedLevel = meterScale;

  return (
    <div
      className={`w-2 sm:w-2.5 h-full bg-neutral-950/90 rounded-sm p-0.5 border border-black/60 shadow-inner flex flex-col justify-between gap-[1.5px] ${className}`}
    >
      {Array.from({ length: barCount }).map((_, index) => {
        // index 0 is top (loudest, Red), index 19 is bottom (quietest, Green)
        const segmentThreshold = (barCount - index) / barCount;
        const isLit = !isDimmed && clampedLevel >= segmentThreshold;

        let activeColor = 'bg-[#00E676] shadow-[0_0_4px_#00E676]';
        let inactiveColor = 'bg-[#003300]/40';

        if (index < 4) {
          // Top 4: Red
          activeColor = 'bg-[#FF3D00] shadow-[0_0_6px_#FF3D00]';
          inactiveColor = 'bg-[#420000]/40';
        } else if (index < 8) {
          // Next 4: Amber/Yellow
          activeColor = 'bg-[#FFD600] shadow-[0_0_5px_#FFD600]';
          inactiveColor = 'bg-[#424200]/40';
        }

        return (
          <div
            key={index}
            className={`w-full flex-1 min-h-[2px] rounded-[0.5px] transition-colors duration-75 ${
              isLit ? activeColor : inactiveColor
            }`}
          />
        );
      })}
    </div>
  );
};

