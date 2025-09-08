"use client";

import { useEffect, useRef, useState } from "react";

export default function WebtoonPreview() {
  const [images, setImages] = useState<string[]>([]);
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;
    try {
      // Prefer blob URLs via postMessage
      const handler = (e: MessageEvent) => {
        if (e.origin !== window.location.origin) return;
        if (e.data?.type === 'webtoon-preview' && Array.isArray(e.data?.images)) {
          setImages(e.data.images as string[]);
        }
      };
      window.addEventListener('message', handler);
      // Announce readiness to the opener for handshake-based transfer
      try { window.opener?.postMessage({ type: 'preview-ready' }, window.location.origin); } catch {}
      return () => window.removeEventListener('message', handler);
    } catch (e) {
      // ignore
    }
  }, []);

  return (
    <div style={{ background: '#ffffff' }} className="min-h-screen w-full">
      <div className="mx-auto max-w-[740px] py-8 px-4">
        {images.length > 0 ? (
          images.map((src, idx) => (
            <img key={idx} src={src} alt={`Panel ${idx + 1}`} className="w-full mb-6" />
          ))
        ) : (
          <div className="text-center text-black/70">No panels to preview.</div>
        )}
      </div>
    </div>
  );
}


