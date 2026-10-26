import React, { useState, useEffect, useRef } from 'react';
import { getAlbumArtBase64 } from '../utils/upnpClient';

interface NativeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  fallback?: React.ReactNode;
  /** Defer network fetch until the element scrolls into view (big lists). */
  lazy?: boolean;
}

/**
 * Global rate limit for LIST artwork.
 *
 * MEASURED CAUSE (device STPDU19515004014): browsing a 16,993-item folder
 * pushed 956 image requests through the single 127.0.0.1:9600 origin in 70s
 * (13.6 req/s). The primary album cover is served from that SAME origin, so
 * its request sat in the WebView's per-origin FIFO and only completed after
 * 70.07s - exactly when the flood ended. Every other link in the chain was
 * measured as fine: React commit immediate, request issued immediately,
 * rendererTrack null, single image 98ms, server backlog 0.
 *
 * A concurrency cap alone does NOT help here: at ~98ms per image, even 4
 * concurrent slots sustain ~40 req/s. This is a RATE limit (token bucket),
 * which is what actually bounds the queue.
 *
 * Eager images (lazy=false) - notably the main cover in AlbumArtFrame -
 * bypass the limiter entirely and never queue behind list thumbnails.
 */
const LAZY_TOKENS_PER_SEC = 4;
const LAZY_BUCKET_SIZE = 4;
let lazyTokens = LAZY_BUCKET_SIZE;
let lastRefillMs = Date.now();
const lazyWaiters: Array<() => void> = [];

function refillLazyTokens() {
  const now = Date.now();
  lazyTokens = Math.min(LAZY_BUCKET_SIZE, lazyTokens + ((now - lastRefillMs) / 1000) * LAZY_TOKENS_PER_SEC);
  lastRefillMs = now;
}

function drainLazyWaiters() {
  refillLazyTokens();
  while (lazyTokens >= 1 && lazyWaiters.length > 0) {
    lazyTokens -= 1;
    const next = lazyWaiters.shift();
    if (next) next();
  }
}

if (typeof setInterval === 'function') {
  setInterval(drainLazyWaiters, 200);
}

function acquireLazyToken(): Promise<void> {
  refillLazyTokens();
  if (lazyTokens >= 1) {
    lazyTokens -= 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    lazyWaiters.push(resolve);
  });
}

/**
 * Image component that uses Android Native Proxy to bypass CORS/Mixed Content.
 * For network art (UPnP), it uses a proxy URL via the native bridge.
 * For local art (SAF), it directly requests the local 127.0.0.1 proxy.
 * With lazy=true, resolution starts only when visible AND a rate-limit token
 * is available; eager images bypass the limiter.
 */
export const NativeImage: React.FC<NativeImageProps> = ({ src, fallback, lazy = false, ...props }) => {
  const [displaySrc, setDisplaySrc] = useState<string>('');
  const [error, setError] = useState(false);
  const [visible, setVisible] = useState(!lazy);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const probeRef = useRef<HTMLSpanElement | null>(null);


  // Lazy visibility gate.
  // NOTE: the wrapper is `display: contents`, which generates NO box, so an
  // IntersectionObserver attached to it can never report an intersection and
  // lazy thumbnails would stay on the fallback forever. We therefore observe a
  // tiny absolutely-positioned sentinel that IS a box but, being out of flow,
  // cannot affect layout.
  useEffect(() => {
    if (!lazy || visible) return;
    const el = probeRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '120px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [lazy, visible]);

  useEffect(() => {
    if (!src) {
      setDisplaySrc('');
      return;
    }
    if (lazy && !visible) return; // wait until scrolled into view

    const issue = () => {
      // Safe URLs used directly
      if (src.startsWith('https://') || src.startsWith('data:') || src.startsWith('blob:') || src.includes('127.0.0.1:9600')) {
        setDisplaySrc(src);
        return;
      }

      let isMounted = true;
      getAlbumArtBase64(src).then((res: string | undefined) => {
        if (isMounted) setDisplaySrc(res || src);
      }).catch(() => {
        if (isMounted) setError(true);
      });
    };

    // Eager images (the primary album cover) bypass the list rate limit so
    // they can never queue behind list thumbnails on the shared origin.
    if (!lazy) {
      issue();
      return;
    }

    let cancelled = false;
    acquireLazyToken().then(() => {
      if (!cancelled) issue();
    });
    return () => {
      cancelled = true;
    };
  }, [src, lazy, visible]);

  // A LAZY image must not render an <img> at all until it has been issued.
// The previous condition only checked `!displaySrc && !src`, so on the very
// first render `displaySrc` was '' while `src` was a real URL: the early
// return was skipped and `<img src={displaySrc || src}>` rendered with the raw
// `src`. The browser then fetched EVERY list thumbnail immediately, which
// defeated `lazy` completely and flooded the shared 127.0.0.1:9600 origin
// (measured: 3,256 image requests; the primary album cover then waited 58-70s
// in the WebView's per-origin FIFO). It also bypassed the rate limiter, since
// that only gates `displaySrc`.
const shouldRenderImg = Boolean(src) && !error && (!lazy || Boolean(displaySrc));

  // Sentinel for the visibility observer (see the lazy gate above). Out of
  // flow, 1x1, invisible: it gives IntersectionObserver a real box to measure
  // without altering the layout at all.
  const probe = (
    <span
      ref={probeRef}
      aria-hidden="true"
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
    />
  );

  if (!shouldRenderImg) {
    return (
      <div ref={containerRef} style={{ display: 'contents' }}>
        {probe}
        {fallback}
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ display: 'contents' }}>
      {probe}
      <img
        {...props}
        src={displaySrc || src}
        onError={(e) => {
          setError(true);
          props.onError?.(e);
        }}
        onLoad={props.onLoad}
        alt={props.alt || "Artwork"}
        loading="eager"
      />
    </div>
  );
};
