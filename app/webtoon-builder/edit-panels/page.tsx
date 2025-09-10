"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Slider } from "@/components/ui/slider";
import { createClient as createBrowserSupabase } from "@/utils/supabase/client";
import ReactCrop, { type Crop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

type PanelItem = {
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type OverlayItem = {
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  isEditing: boolean;
  flipped: boolean;
  fontFamily?: string;
  fontScale?: number; // 0.5 - 2.0
  hBias?: number; // -100 .. 100 (negative -> push left, positive -> push right)
  vBias?: number; // -100 .. 100 (negative -> push up, positive -> push down)
};

export default function EditPanelsPage() {
  const router = useRouter();
  const supabase = createBrowserSupabase();
  const [panels, setPanels] = useState<PanelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [croppingPanelId, setCroppingPanelId] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>({ unit: 'px', x: 10, y: 10, width: 200, height: 200 });
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [croppingImgEl, setCroppingImgEl] = useState<HTMLImageElement | null>(null);
  const [overlays, setOverlays] = useState<OverlayItem[]>([]);
  const [bubbleSrcs, setBubbleSrcs] = useState<string[]>([]);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [isPreviewing, setIsPreviewing] = useState<boolean>(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const canvasWidth = 800;
  const canvasPadding = 24; // equal padding around images

  useEffect(() => {
    (async () => {
      try {
        const projectId = sessionStorage.getItem('currentProjectId');
        if (!projectId) {
          setError('No project selected.');
          setLoading(false);
          return;
        }
        // Fetch ordered generated scene images for this project
        const { data, error } = await supabase
          .from('generated_scene_images')
          .select('scene_no,image_path')
          .eq('project_id', projectId)
          .order('scene_no', { ascending: true });
        if (error) throw error;

        // Sign and load sizes (robust: fetch blob + onerror handling + timeout)
        const TIMEOUT_MS = 8000;
        const signed = await Promise.all((data || []).map(async (row: any) => {
          try {
            if (!row?.image_path) return null;
            const signed = await supabase.storage.from('webtoon').createSignedUrl(row.image_path, 60 * 60);
            const url = signed.data?.signedUrl;
            if (!url) return null;
            const controller = new AbortController();
            const to = setTimeout(() => controller.abort(), TIMEOUT_MS);
            const resp = await fetch(url, { cache: 'no-store', signal: controller.signal }).catch(() => null as any);
            clearTimeout(to);
            if (!resp || !resp.ok) {
              // Fallback default dims if fetch failed but still render item
              return { id: `scene_${row.scene_no}`, src: url, w: canvasWidth, h: Math.round(canvasWidth * 0.6) } as const;
            }
            const blob = await resp.blob();
            const imgDims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
              const objectUrl = URL.createObjectURL(blob);
              const img = new Image();
              img.onload = () => {
                const out = { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height };
                URL.revokeObjectURL(objectUrl);
                resolve(out);
              };
              img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                resolve({ w: canvasWidth, h: Math.round(canvasWidth * 0.6) });
              };
              img.src = objectUrl;
            });
            const scale = Math.min(1, (canvasWidth - canvasPadding * 2) / Math.max(1, imgDims.w));
            const w = Math.round(imgDims.w * scale);
            const h = Math.round(imgDims.h * scale);
            return { id: `scene_${row.scene_no}`, src: url, w, h } as const;
          } catch {
            return null;
          }
        }));
        const filtered = signed.filter(Boolean) as Array<{ id: string; src: string; w: number; h: number }>;
        // Stack vertically within canvas width with vertical gaps
        let y = 0;
        const items: PanelItem[] = filtered.map((p) => {
          const item = { id: p.id, src: p.src, x: Math.floor((canvasWidth - p.w) / 2), y: y + canvasPadding, width: p.w, height: p.h } as PanelItem;
          y += p.h + canvasPadding * 2; // equal top/bottom gap
          return item;
        });
        setPanels(items);
      } catch (e: any) {
        setError(e?.message || 'Failed to load panels');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Safety: ensure loader cannot get stuck indefinitely
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 15000);
    return () => clearTimeout(t);
  }, [loading]);

  // Discover dialog bubble assets from /public/DialogBubbles (PNG only)
  useEffect(() => {
    const base = '/DialogBubbles';
    const pngs = [
      'bub1.png','bub2.png','bub3.png','bub4.png','bub5.png','bub6.png','bub7.png','bub8.png','bub9.png','bub10.png','bub11.png','bub12.png','bub13.png','bub14.png','bub15.png','bub16.png'
    ];
    setBubbleSrcs(pngs.map((n) => `${base}/${n}`));
  }, []);

  const getCanvasHeight = (): number => {
    return Math.max(1200, panels.reduce((m, p) => Math.max(m, p.y + p.height + 200), 0));
  };

  const computeViewportCenteredY = (overlayHeight: number): number => {
    try {
      const rect = canvasRef.current?.getBoundingClientRect();
      const canvasHeight = getCanvasHeight();
      if (!rect) {
        return Math.max(0, Math.round((canvasHeight - overlayHeight) / 2));
      }
      const viewportCenterY = window.innerHeight / 2;
      const yInCanvas = viewportCenterY - rect.top; // convert to canvas coords
      let newY = Math.round(yInCanvas - overlayHeight / 2);
      newY = Math.min(Math.max(0, newY), Math.max(0, canvasHeight - overlayHeight));
      return newY;
    } catch {
      return 24;
    }
  };

  const addOverlayFromSrc = async (src: string) => {
    try {
      // Probe natural dimensions to scale reasonably on 800px canvas
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = src;
      });
      const natW = img.naturalWidth || img.width || 300;
      const natH = img.naturalHeight || img.height || 200;
      const targetW = Math.min( Math.max(160, Math.round(canvasWidth * 0.5)), canvasWidth - 40 );
      const ratio = targetW / Math.max(1, natW);
      const w = Math.round(natW * ratio);
      const h = Math.round(natH * ratio);
      const id = `overlay_${Date.now()}_${Math.floor(Math.random()*1000)}`;
      const centeredY = computeViewportCenteredY(h);
      const item: OverlayItem = {
        id,
        src,
        x: Math.floor((canvasWidth - w) / 2),
        y: centeredY,
        width: w,
        height: h,
        text: '',
        isEditing: false,
        flipped: false,
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        fontScale: 1,
        hBias: 0,
        vBias: 0,
      };
      setOverlays(prev => [...prev, item]);
      setSelectedOverlayId(id);
    } catch {}
  };

  const croppingPanel = useMemo(() => panels.find(p => p.id === croppingPanelId) || null, [panels, croppingPanelId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.key === 'Backspace' || e.key === 'Delete')) return;
      if (!selectedOverlayId) return;
      const active = document.activeElement as HTMLElement | null;
      // If user is typing in an input/textarea/contentEditable, don't intercept
      if (active && (
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.isContentEditable
      )) {
        return;
      }
      const ov = overlays.find(o => o.id === selectedOverlayId);
      if (!ov || ov.isEditing) return;
      e.preventDefault();
      setOverlays(prev => prev.filter(o => o.id !== selectedOverlayId));
      setSelectedOverlayId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedOverlayId, overlays]);

  const onCropComplete = (_: any) => {
    // computed on apply to match current crop state
  };

  const createImageFromBlob = (blob: Blob): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = reject;
    img.src = url;
  });

  const getCroppedDataUrl = async (imageSrc: string, area: { x: number; y: number; width: number; height: number }): Promise<string> => {
    const resp = await fetch(imageSrc);
    const blob = await resp.blob();
    const image = await createImageFromBlob(blob);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unsupported');
    canvas.width = Math.max(1, Math.round(area.width));
    canvas.height = Math.max(1, Math.round(area.height));
    ctx.drawImage(
      image,
      Math.max(0, Math.round(area.x)),
      Math.max(0, Math.round(area.y)),
      Math.max(1, Math.round(area.width)),
      Math.max(1, Math.round(area.height)),
      0,
      0,
      canvas.width,
      canvas.height
    );
    return canvas.toDataURL('image/png');
  };

  const applyCrop = async () => {
    if (!croppingPanel || !crop) { setCroppingPanelId(null); return; }
    try {
      // Map displayed crop (px) to natural image pixels
      let area = { x: 0, y: 0, width: 1, height: 1 };
      if (croppingImgEl) {
        const displayW = croppingImgEl.width || croppingImgEl.clientWidth || (crop.width || 1);
        const displayH = croppingImgEl.height || croppingImgEl.clientHeight || (crop.height || 1);
        const naturalW = croppingImgEl.naturalWidth || displayW;
        const naturalH = croppingImgEl.naturalHeight || displayH;
        const scaleX = naturalW / Math.max(1, displayW);
        const scaleY = naturalH / Math.max(1, displayH);
        area = {
          x: Math.max(0, Math.round((crop.x || 0) * scaleX)),
          y: Math.max(0, Math.round((crop.y || 0) * scaleY)),
          width: Math.max(1, Math.round((crop.width || 1) * scaleX)),
          height: Math.max(1, Math.round((crop.height || 1) * scaleY)),
        };
      }
      const dataUrl = await getCroppedDataUrl(croppingPanel.src, area);
      setPanels(prev => prev.map(p => p.id === croppingPanel.id ? { ...p, src: dataUrl, width: Math.min(p.width, canvasWidth), height: p.height } : p));
    } catch (e) {
      // ignore for now
    } finally {
      setCroppingPanelId(null);
      setCrop({ unit: 'px', x: 10, y: 10, width: 200, height: 200 });
      setCroppingImgEl(null);
    }
  };

  // Compose current layout into a single tall PNG
  const loadImageSafe = async (src: string): Promise<HTMLImageElement> => {
    try {
      if (src.startsWith('data:')) {
        return await createImageFromBlob(await (await fetch(src)).blob());
      }
      const resp = await fetch(src, { cache: 'no-store' });
      const blob = await resp.blob();
      return await createImageFromBlob(blob);
    } catch {
      // Fallback transparent 1x1
      const c = document.createElement('canvas'); c.width = 1; c.height = 1;
      return await createImageFromBlob(await new Promise<Blob>((r)=>c.toBlob(b=>r(b||new Blob()), 'image/png')!));
    }
  };

  const drawContain = (
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    x: number,
    y: number,
    boxW: number,
    boxH: number
  ) => {
    const natW = (img as any).naturalWidth || img.width;
    const natH = (img as any).naturalHeight || img.height;
    if (!natW || !natH || !boxW || !boxH) return;
    const scale = Math.min(boxW / natW, boxH / natH);
    const dw = Math.round(natW * scale);
    const dh = Math.round(natH * scale);
    const dx = Math.round(x + (boxW - dw) / 2);
    const dy = Math.round(y + (boxH - dh) / 2);
    ctx.drawImage(img, 0, 0, natW, natH, dx, dy, dw, dh);
  };

  const generateCompositeDataUrl = async (): Promise<string> => {
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    const bottomPanels = panels.reduce((m, p) => Math.max(m, p.y + p.height), 0);
    const bottomOverlays = overlays.reduce((m, o) => Math.max(m, o.y + o.height), 0);
    canvas.height = Math.max(bottomPanels, bottomOverlays) + canvasPadding;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unsupported');
    // white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // draw panels (object-fit: contain)
    for (const p of panels) {
      try {
        const img = await loadImageSafe(p.src);
        drawContain(ctx, img, p.x, p.y, p.width, p.height);
      } catch {}
    }

    // draw overlays (bubble + text)
    for (const o of overlays) {
      try {
        const img = await loadImageSafe(o.src);
        drawContain(ctx, img, o.x, o.y, o.width, o.height);
      } catch {}

      const sidePad = Math.round(o.width * 0.10);
      const topBase = Math.round(o.height * 0.08);
      const botBase = Math.round(o.height * 0.24);
      const basePx = Math.max(12, Math.min(40, Math.floor((o.height - topBase - botBase) * 0.25)));
      const fontPx = Math.round(basePx * (o.fontScale || 1));
      const biasPct = Math.max(-100, Math.min(100, o.hBias ?? 0));
      const totalPad = sidePad * 2;
      const contentWidth = Math.max(0, o.width - totalPad);
      const halfBias = Math.round((contentWidth * Math.abs(biasPct) / 100) / 2);
      const leftPad  = biasPct > 0 ? sidePad + halfBias : sidePad;
      const rightPad = biasPct < 0 ? sidePad + halfBias : sidePad;
      const vBiasPct = Math.max(-100, Math.min(100, o.vBias ?? 0));
      const contentHeight = Math.max(0, o.height - (topBase + botBase));
      const halfVBias = Math.round((contentHeight * Math.abs(vBiasPct) / 100) / 2);
      const topPad  = topBase  + (vBiasPct > 0 ? halfVBias : 0);
      const bottomPad = botBase + (vBiasPct < 0 ? halfVBias : 0);

      // text box
      const tx = o.x + leftPad;
      const ty = o.y + topPad;
      const tw = Math.max(1, o.width - leftPad - rightPad);
      const th = Math.max(1, o.height - topPad - bottomPad);

      // text settings
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${fontPx}px ${o.fontFamily || 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'}`;

      // word wrap
      const words = String(o.text || '').split(/\s+/);
      const lines: string[] = [];
      let current = '';
      for (const w of words) {
        const test = current ? current + ' ' + w : w;
        const width = ctx.measureText(test).width;
        if (width <= tw) {
          current = test;
        } else {
          if (current) lines.push(current);
          current = w;
        }
      }
      if (current) lines.push(current);
      const lineHeight = Math.round(fontPx * 1.2);
      const totalHeight = lines.length * lineHeight;
      let y = ty + Math.max(0, (th - totalHeight) / 2) + lineHeight / 2;
      for (const line of lines) {
        ctx.fillText(line, Math.round(tx + tw / 2), Math.round(y));
        y += lineHeight;
      }
    }

    return canvas.toDataURL('image/png');
  };

  const handlePreviewComposite = async () => {
    try {
      setIsPreviewing(true);
      const dataUrl = await generateCompositeDataUrl();
      const win = window.open('/webtoon-builder/preview', '_blank');
      const send = () => {
        try { win?.postMessage({ type: 'webtoon-preview-composite', image: dataUrl }, window.location.origin); } catch {}
      };
      const onReady = (e: MessageEvent) => {
        if (e.origin !== window.location.origin) return;
        if (e.data?.type === 'preview-ready') {
          send();
          window.removeEventListener('message', onReady as any);
        }
      };
      window.addEventListener('message', onReady as any);
      // Fallback send in case the ready message is missed due to timing
      setTimeout(send, 400);
      setTimeout(send, 900);
    } finally {
      setIsPreviewing(false);
    }
  };

  const handlePublishComposite = async () => {
    try {
      setIsPublishing(true);
      const dataUrl = await generateCompositeDataUrl();
      // Download PNG
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'webtoon.png';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      // Update project status as published
      try {
        const projectId = sessionStorage.getItem('currentProjectId');
        if (projectId) {
          await fetch('/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }) });
        }
      } catch {}
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0b12] to-[#0f0f1a] text-white">
      <main className="mx-auto max-w-[1600px] px-4 py-6 lg:pr-[460px]">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="outline" className="border-white/20 text-white hover:bg-white/10" onClick={() => router.back()}>Back</Button>
          <h1 className="text-2xl font-semibold">Edit Panels Layout</h1>
        </div>
        {loading && (
          <div className="flex flex-col items-center mb-6">
            <div className="w-10 h-10 border-4 border-fuchsia-500/30 border-t-fuchsia-500 rounded-full animate-spin"></div>
            <div className="mt-3 text-sm text-white/80">Loading panels…</div>
          </div>
        )}
        {error && (
          <div className="text-red-400 mb-4">{error}</div>
        )}
        <div className="flex gap-6">
          {/* Left: editing canvas */
          }
          <div className="flex-1">
            <div
              className="relative bg-white rounded shadow border border-white/10 overflow-hidden"
              style={{ width: `${canvasWidth}px`, minHeight: '80vh', margin: '0 auto' }}
              ref={canvasRef}
              onMouseDown={(e) => {
                const target = e.target as HTMLElement;
                // If clicking inside any overlay, don't clear selection
                if (target.closest('[data-overlay-id]')) return;
                if (target.closest('[data-panel-id]')) return;
                setSelectedOverlayId(null);
                setSelectedPanelId(null);
              }}
            >
              {/* Infinite-feel area via tall spacer with top/bottom padding */}
              <div style={{ width: `${canvasWidth}px`, height: Math.max(1200, panels.reduce((m, p) => Math.max(m, p.y + p.height + canvasPadding), canvasPadding)) }} />
              {panels.map((p) => {
                const isSelected = selectedPanelId === p.id;
                const cornerHandle = isSelected ? { width: '12px', height: '12px', background: '#3b82f6', border: '2px solid #fff', borderRadius: '9999px' } : undefined;
                return (
                <Rnd
                  key={p.id}
                  bounds="parent"
                  size={{ width: p.width, height: p.height }}
                  position={{ x: p.x, y: p.y }}
                  onDragStart={() => { setSelectedPanelId(p.id); setSelectedOverlayId(null); }}
                  onDoubleClick={() => setCroppingPanelId(p.id)}
                  onDragStop={(e, d) => {
                    setPanels(prev => prev.map(pp => pp.id === p.id ? { ...pp, x: d.x, y: d.y } : pp));
                  }}
                  onResizeStart={() => { setSelectedPanelId(p.id); setSelectedOverlayId(null); }}
                  onResizeStop={(e, dir, ref, delta, pos) => {
                    const w = Math.round(ref.offsetWidth);
                    const h = Math.round(ref.offsetHeight);
                    setPanels(prev => prev.map(pp => pp.id === p.id ? { ...pp, width: w, height: h, x: pos.x, y: pos.y } : pp));
                  }}
                  lockAspectRatio
                  enableResizing={{ top:false, right:false, bottom:false, left:false, topRight:true, bottomRight:true, bottomLeft:true, topLeft:true }}
                  resizeHandleStyles={{
                    topRight: cornerHandle,
                    bottomRight: cornerHandle,
                    bottomLeft: cornerHandle,
                    topLeft: cornerHandle,
                  }}
                  style={{ zIndex: isSelected ? 15 : 5, outline: isSelected ? '2px solid #3b82f6' : 'none', border: '2px solid transparent', boxShadow: 'none' }}
                  data-panel-id={p.id}
                >
                  <div className="relative w-full h-full">
                    <img src={p.src} alt={p.id} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
                    <div
                      className="absolute inset-0"
                      data-panel-id={p.id}
                      style={{ cursor: 'move' }}
                      onMouseDown={() => { setSelectedPanelId(p.id); setSelectedOverlayId(null); }}
                    />
                  </div>
                </Rnd>
              );})}
              {/* Overlays on top */}
              {overlays.map((o) => {
                const isSelected = selectedOverlayId === o.id;
                const cornerHandle = isSelected ? { width: '12px', height: '12px', background: '#3b82f6', border: '2px solid #fff', borderRadius: '9999px' } : undefined;
                return (
                <Rnd
                  key={o.id}
                  bounds="parent"
                  data-overlay-id={o.id}
                  size={{ width: o.width, height: o.height }}
                  position={{ x: o.x, y: o.y }}
                  onDragStart={() => setSelectedOverlayId(o.id)}
                  onDragStop={(e, d) => {
                    setOverlays(prev => prev.map(oo => oo.id === o.id ? { ...oo, x: d.x, y: d.y } : oo));
                  }}
                  onResizeStart={() => setSelectedOverlayId(o.id)}
                  onResizeStop={(e, dir, ref, delta, pos) => {
                    const w = Math.round(ref.offsetWidth);
                    const h = Math.round(ref.offsetHeight);
                    setOverlays(prev => prev.map(oo => oo.id === o.id ? { ...oo, width: w, height: h, x: pos.x, y: pos.y } : oo));
                  }}
                  lockAspectRatio
                  enableResizing={{ top:false, right:false, bottom:false, left:false, topRight:true, bottomRight:true, bottomLeft:true, topLeft:true }}
                  resizeHandleStyles={{
                    topRight: cornerHandle,
                    bottomRight: cornerHandle,
                    bottomLeft: cornerHandle,
                    topLeft: cornerHandle,
                  }}
                  style={{ zIndex: isSelected ? 40 : 20, outline: isSelected ? '2px solid #3b82f6' : 'none', border: '2px solid transparent', borderRadius: 8, boxShadow: 'none' }}
                  disableDragging={o.isEditing}
                  dragHandleClassName="overlay-handle"
                >
                  <div className="relative w-full h-full">
                    {/* Bubble image (visual) */}
                    <img
                      src={o.src}
                      alt={o.id}
                      draggable={false}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        userSelect: 'none',
                        pointerEvents: 'none',
                      }}
                    />
                
                    {/* Mask layer — clamps children to the bubble alpha */}
                    <div
                      className="absolute inset-0"
                      style={{
                        WebkitMaskImage: `url(${o.src})`,
                        maskImage: `url(${o.src})`,
                        WebkitMaskSize: '100% 100%',
                        maskSize: '100% 100%',
                        WebkitMaskRepeat: 'no-repeat',
                        maskRepeat: 'no-repeat',
                        WebkitMaskPosition: 'center',
                        maskPosition: 'center',
                      }}
                    >
                      {(() => {
                        // Tweak these 3 paddings if a specific bubble needs more/less space
                        const sidePad = Math.round(o.width * 0.10);   // avoid stroke
                        // const topPad  = Math.round(o.height * 0.10);  // top inset
                        // const botPad  = Math.round(o.height * 0.22);  // bottom inset (tail room)
                        const topBase = Math.round(o.height * 0.08);  // base top inset
                        const botBase = Math.round(o.height * 0.24);  // base bottom inset
                        const basePx  = Math.max(12, Math.min(40,
                                        Math.floor((o.height - topBase - botBase) * 0.25)));
                        const fontPx  = Math.round(basePx * (o.fontScale || 1));
                        const biasPct = Math.max(-100, Math.min(100, o.hBias ?? 0));
                        const totalPad = sidePad * 2;
                        const contentWidth = Math.max(0, o.width - totalPad);
                        const halfBias = Math.round((contentWidth * Math.abs(biasPct) / 100) / 2);
                        const leftPad  = biasPct > 0 ? sidePad + halfBias : sidePad;
                        const rightPad = biasPct < 0 ? sidePad + halfBias : sidePad;

                        const vBiasPct = Math.max(-100, Math.min(100, o.vBias ?? 0));
                        const contentHeight = Math.max(0, o.height - (topBase + botBase));
                        const halfVBias = Math.round((contentHeight * Math.abs(vBiasPct) / 100) / 2);
                        const topPad  = topBase  + (vBiasPct > 0 ? halfVBias : 0);   // >0 move text down
                        const bottomPad = botBase + (vBiasPct < 0 ? halfVBias : 0);   // <0 move text up
                
                        return (
                          <div
                            className="absolute"
                            style={{
                              left: leftPad, right: rightPad, top: topPad, bottom: bottomPad,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              textAlign: 'center',
                            }}
                          >
                            {o.isEditing ? (
                              // EDIT MODE: plain textarea (bidi-proof)
                              <textarea
                                id={`overlay-edit-${o.id}`}
                                value={o.text}
                                onChange={(e) => {
                                  const text = e.currentTarget.value;
                                  setOverlays(prev => prev.map(oo => oo.id === o.id ? { ...oo, text } : oo));
                                }}
                                onBlur={() => {
                                  setOverlays(prev => prev.map(oo => oo.id === o.id ? { ...oo, isEditing: false } : oo));
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') (e.currentTarget as HTMLTextAreaElement).blur();
                                }}
                                className="absolute inset-0 p-3"
                                style={{
                                  background: 'transparent',
                                  color: '#000',
                                  border: 'none',
                                  outline: 'none',
                                  resize: 'none',
                                  width: '100%',
                                  height: '100%',
                                  // bidi-safe:
                                  direction: 'ltr',
                                  unicodeBidi: 'isolate-override' as any,
                                  writingMode: 'horizontal-tb',
                                  // wrapping
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                  overflowWrap: 'anywhere',
                                  overflow: 'hidden',
                                  lineHeight: 1.2,
                                  textAlign: 'center', // horizontal center while editing
                                  fontSize: `${fontPx}px`,
                                }}
                                spellCheck={false}
                                autoFocus
                              />
                            ) : (
                              // VIEW MODE: centered text inside the masked, padded box
                              <div
                                className="pointer-events-none"
                                style={{
                                  width: '100%',
                                  maxHeight: '100%',
                                  color: '#000',
                                  direction: 'ltr',
                                  unicodeBidi: 'isolate-override' as any,
                                  writingMode: 'horizontal-tb',
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                  overflowWrap: 'anywhere',
                                  overflow: 'hidden',
                                  lineHeight: 1.2,
                                  textAlign: 'center',
                                  fontSize: `${fontPx}px`,
                                  display: 'flex',           // flex-center in view mode
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontFamily: o.fontFamily,
                                }}
                              >
                                {o.text || ''}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                
                    {/* Full-cover drag handle; disabled while editing */}
                    <div
                      className="overlay-handle absolute inset-0"
                      style={{ cursor: o.isEditing ? 'text' : 'move', pointerEvents: o.isEditing ? 'none' : 'auto' }}
                      onMouseDown={() => { setSelectedOverlayId(o.id); }}
                      onDoubleClick={() => {
                        setOverlays(prev => prev.map(oo => oo.id === o.id ? { ...oo, isEditing: true } : oo));
                        setTimeout(() => document.getElementById(`overlay-edit-${o.id}`)?.focus(), 0);
                      }}
                    />
                  </div>
                </Rnd>
              );})}
            </div>
          </div>
          {/* Right: control panel matching chat panel */}
          <aside className="hidden lg:block fixed top-[64px] right-0 h-[calc(100vh-64px)] w-[420px]">
            <div className="h-full border border-white/10 bg-white/5 backdrop-blur-sm rounded-none p-4 overflow-y-auto">
              <div className="text-sm text-white/80 mb-3">Controls</div>

              {/* Collapsible: Dialog Bubbles */}
              <Collapsible open>
                <CollapsibleTrigger chevron className="w-full text-left px-3 py-2 rounded border border-white/10 bg-white/10 text-white hover:bg-white/15">
                  Dialog Bubbles
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3" maxHeight={260}>
                  <div className="grid grid-cols-2 gap-3 pr-1 overflow-y-auto" style={{ maxHeight: 240 }}>
                    {bubbleSrcs.map((src, idx) => (
                      <button key={idx} className="bg-white/10 hover:bg-white/20 rounded p-2 flex items-center justify-center" onClick={() => addOverlayFromSrc(src)}>
                        <img src={src} alt={`bubble_${idx}`} className="max-h-24 object-contain" />
                      </button>
                    ))}
                    {bubbleSrcs.length === 0 && (
                      <div className="col-span-2 text-white/60 text-sm">No bubbles found in /public/DialogBubbles</div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Collapsible: Font Presets */}
              <div className="mt-4">
                <Collapsible>
                  <CollapsibleTrigger chevron className="w-full text-left px-3 py-2 rounded border border-white/10 bg-white/10 text-white hover:bg-white/15">
                    Font Presets
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3" maxHeight={220}>
                    <div className="grid grid-cols-2 gap-2 pr-1 overflow-y-auto" style={{ maxHeight: 200 }}>
                      {[
                        { label: 'Sans', value: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif' },
                        { label: 'Serif', value: 'Georgia, Cambria, Times New Roman, Times, serif' },
                        { label: 'Mono', value: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },
                        { label: 'Comic', value: 'Comic Sans MS, Comic Sans, cursive, sans-serif' },
                        { label: 'Impact', value: 'Impact, Haettenschweiler, Arial Narrow Bold, sans-serif' },
                        { label: 'Cooper', value: 'Cooper Black, Georgia, serif' },
                      ].map(preset => (
                        <button
                          key={preset.label}
                          className="rounded border border-white/10 bg-white/10 hover:bg-white/20 text-white px-2 py-3"
                          onClick={() => {
                            if (!selectedOverlayId) return;
                            setOverlays(prev => prev.map(o => o.id === selectedOverlayId ? { ...o, fontFamily: preset.value } : o));
                          }}
                        >
                          <div style={{ fontFamily: preset.value }} className="text-center select-none">
                            <div className="text-xs text-white/70">{preset.label}</div>
                            <div className="text-base">Aa Bb</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              {/* Collapsible: Text Size & Horizontal Bias */}
              <div className="mt-4">
                <Collapsible>
                  <CollapsibleTrigger chevron className="w-full text-left px-3 py-2 rounded border border-white/10 bg-white/10 text-white hover:bg-white/15">
                    Text Options
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3 space-y-4" maxHeight={200}>
                    <div>
                      <div className="text-xs text-white/70 mb-1">Text Size</div>
                      <Slider
                        value={Math.round(((overlays.find(o => o.id === selectedOverlayId)?.fontScale ?? 1) - 0.5) * 100)}
                        min={0}
                        max={150}
                        step={1}
                        onChange={(val) => {
                          if (!selectedOverlayId) return;
                          const scale = 0.5 + (val / 100);
                          setOverlays(prev => prev.map(o => o.id === selectedOverlayId ? { ...o, fontScale: Math.max(0.5, Math.min(2, scale)) } : o));
                        }}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="text-xs text-white/70 mb-1">Horizontal Bias</div>
                      <Slider
                        value={(overlays.find(o => o.id === selectedOverlayId)?.hBias ?? 0) + 100}
                        min={0}
                        max={200}
                        step={1}
                        onChange={(val) => {
                          if (!selectedOverlayId) return;
                          const bias = val - 100; // -100..100
                          setOverlays(prev => prev.map(o => o.id === selectedOverlayId ? { ...o, hBias: bias } : o));
                        }}
                        className="w-full"
                      />
                      <div className="text-[10px] text-white/50 mt-1">Left ◄  Center  ► Right</div>
                    </div>
                    <div>
                      <div className="text-xs text-white/70 mb-1">Vertical Bias</div>
                      <Slider
                        value={(overlays.find(o => o.id === selectedOverlayId)?.vBias ?? 0) + 100}
                        min={0}
                        max={200}
                        step={1}
                        onChange={(val) => {
                          if (!selectedOverlayId) return;
                          const bias = val - 100; // -100..100
                          setOverlays(prev => prev.map(o => o.id === selectedOverlayId ? { ...o, vBias: bias } : o));
                        }}
                        className="w-full"
                      />
                      <div className="text-[10px] text-white/50 mt-1">Up ▲  Center  ▼ Down</div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              <div className="mt-6 text-sm text-white/80">Tips</div>
              <ul className="text-xs text-white/60 list-disc pl-5 space-y-1 mt-1">
                <li>Click a bubble to add it to the canvas.</li>
                <li>Drag inside to move, use corner dots to resize.</li>
                <li>Double-click a bubble to edit text.</li>
                <li>Press Backspace/Delete to remove selected bubble.</li>
              </ul>
            </div>
          </aside>
        </div>
      </main>
      {/* Footer actions */}
      <div className="mx-auto max-w-[1600px] px-4 pb-10">
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" className="border-white/20 text-white hover:bg-white/10 disabled:opacity-60" onClick={handlePreviewComposite} disabled={isPreviewing}>
            {isPreviewing ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Building…
              </span>
            ) : (
              'Preview Webtoon'
            )}
          </Button>
          <Button className="bg-gradient-to-r from-fuchsia-500 to-indigo-400 text-white disabled:opacity-60" onClick={handlePublishComposite} disabled={isPublishing}>
            {isPublishing ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Generating…
              </span>
            ) : (
              'Publish Webtoon'
            )}
          </Button>
        </div>
      </div>
      {croppingPanel && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center px-4">
          <div className="w-full max-w-[900px] bg-[#0f0f1a] border border-white/10 rounded-md overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <div className="font-semibold text-white">Crop Panel</div>
              <div className="text-xs text-white/60">Double-clicked: {croppingPanel.id}</div>
            </div>
            <div className="relative" style={{ height: 520 }}>
              <ReactCrop crop={crop} onChange={(c) => setCrop(c)} keepSelection>
                <img
                  src={croppingPanel.src}
                  alt="crop"
                  style={{ maxHeight: '520px', objectFit: 'contain' }}
                  onLoad={(e) => setCroppingImgEl(e.currentTarget)}
                />
              </ReactCrop>
            </div>
            <div className="px-4 py-3 border-t border-white/10 flex items-center gap-3 justify-end">
              <div className="flex items-center gap-2">
                <Button variant="outline" className="border-white/20 text-white hover:bg-white/10" onClick={() => { setCroppingPanelId(null); setCrop({ unit: 'px', x: 10, y: 10, width: 200, height: 200 }); setCroppedAreaPixels(null); setCroppingImgEl(null); }}>Cancel</Button>
                <Button className="bg-gradient-to-r from-fuchsia-500 to-indigo-400 text-white" onClick={applyCrop}>Apply Crop</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


