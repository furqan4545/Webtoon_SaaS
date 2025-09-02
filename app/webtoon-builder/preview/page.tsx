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
      // Fallback: read blob urls from sessionStorage (short strings)
      const raw = sessionStorage.getItem('previewBlobUrls');
      if (raw) setImages((JSON.parse(raw) as string[]).filter(Boolean));
      return () => window.removeEventListener('message', handler);
    } catch (e) {
      // ignore
    }
  }, []);

  return (
    <div style={{ background: '#ffffff' }} className="min-h-screen w-full">
      <div className="mx-auto max-w-[720px] py-8 px-4">
        {images.map((src, idx) => (
          <div key={idx} className="mb-6">
            <img src={src} alt={`Panel ${idx + 1}`} className="w-full rounded-md" />
          </div>
        ))}
        {images.length === 0 && (
          <div className="text-center text-black/70">No panels to preview.</div>
        )}
      </div>
    </div>
  );
}


