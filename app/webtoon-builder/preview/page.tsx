"use client";

import { useEffect, useRef, useState } from "react";

export default function WebtoonPreview() {
  const [images, setImages] = useState<string[]>([]);
  const [composite, setComposite] = useState<string | null>(null);
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
          setComposite(null);
        }
        if (e.data?.type === 'webtoon-preview-composite' && typeof e.data?.image === 'string') {
          setComposite(e.data.image as string);
          setImages([]);
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
    <div className="min-h-screen w-full" style={{ background: '#000000' }}>
      <div className="mx-auto" style={{ width: 800 }}>
        <div className="py-8" style={{ background: '#ffffff' }}>
          {composite ? (
            <img src={composite} alt="Webtoon" style={{ width: 800, display: 'block', margin: '0 auto' }} />
          ) : images.length > 0 ? (
            images.map((src, idx) => (
              <img key={idx} src={src} alt={`Panel ${idx + 1}`} className="w-full mb-6" />
            ))
          ) : (
            <div className="text-center text-black/70 py-20">No panels to preview.</div>
          )}
        </div>
      </div>
    </div>
  );
}


