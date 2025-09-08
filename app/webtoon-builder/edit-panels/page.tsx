"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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

export default function EditPanelsPage() {
  const router = useRouter();
  const supabase = createBrowserSupabase();
  const [panels, setPanels] = useState<PanelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [croppingPanelId, setCroppingPanelId] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>({ unit: 'px', x: 10, y: 10, width: 200, height: 200 });
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const canvasWidth = 800;

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

        // Sign and load sizes
        const signed = await Promise.all((data || []).map(async (row: any) => {
          if (!row?.image_path) return null;
          const signed = await supabase.storage.from('webtoon').createSignedUrl(row.image_path, 60 * 60);
          const url = signed.data?.signedUrl;
          if (!url) return null;
          // Probe natural size
          const dims = await new Promise<{ w: number; h: number }>((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
            img.src = url;
          });
          const scale = Math.min(1, canvasWidth / Math.max(1, dims.w));
          const w = Math.round(dims.w * scale);
          const h = Math.round(dims.h * scale);
          return { id: `scene_${row.scene_no}`, src: url, w, h } as const;
        }));
        const filtered = signed.filter(Boolean) as Array<{ id: string; src: string; w: number; h: number }>;
        // Stack vertically within 800px width
        let y = 0;
        const items: PanelItem[] = filtered.map((p) => {
          const item = { id: p.id, src: p.src, x: Math.floor((canvasWidth - p.w) / 2), y, width: p.w, height: p.h } as PanelItem;
          y += p.h + 24; // 24px gap
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

  const croppingPanel = useMemo(() => panels.find(p => p.id === croppingPanelId) || null, [panels, croppingPanelId]);

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
      const area = { x: Math.max(0, Math.round(crop.x || 0)), y: Math.max(0, Math.round(crop.y || 0)), width: Math.max(1, Math.round(crop.width || 0)), height: Math.max(1, Math.round(crop.height || 0)) };
      const dataUrl = await getCroppedDataUrl(croppingPanel.src, area);
      setPanels(prev => prev.map(p => p.id === croppingPanel.id ? { ...p, src: dataUrl, width: Math.min(p.width, canvasWidth), height: p.height } : p));
    } catch (e) {
      // ignore for now
    } finally {
      setCroppingPanelId(null);
      setCrop({ unit: 'px', x: 10, y: 10, width: 200, height: 200 });
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
            <div className="relative bg-white rounded shadow border border-white/10 overflow-hidden" style={{ width: `${canvasWidth}px`, minHeight: '80vh', margin: '0 auto' }}>
              {/* Infinite-feel area via tall spacer */}
              <div style={{ width: `${canvasWidth}px`, height: Math.max(1200, panels.reduce((m, p) => Math.max(m, p.y + p.height + 200), 0)) }} />
              {panels.map((p) => (
                <Rnd
                  key={p.id}
                  bounds="parent"
                  size={{ width: p.width, height: p.height }}
                  position={{ x: p.x, y: p.y }}
                  onDoubleClick={() => setCroppingPanelId(p.id)}
                  onDragStop={(e, d) => {
                    setPanels(prev => prev.map(pp => pp.id === p.id ? { ...pp, x: d.x, y: d.y } : pp));
                  }}
                  onResizeStop={(e, dir, ref, delta, pos) => {
                    const w = Math.round(ref.offsetWidth);
                    const h = Math.round(ref.offsetHeight);
                    setPanels(prev => prev.map(pp => pp.id === p.id ? { ...pp, width: w, height: h, x: pos.x, y: pos.y } : pp));
                  }}
                  lockAspectRatio
                  enableResizing={{ top:false, right:true, bottom:true, left:false, topRight:true, bottomRight:true, bottomLeft:true, topLeft:true }}
                  className="shadow-lg"
                >
                  <img src={p.src} alt={p.id} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
                </Rnd>
              ))}
            </div>
          </div>
          {/* Right: control panel matching chat panel */}
          <aside className="hidden lg:block fixed top-[64px] right-0 h-[calc(100vh-64px)] w-[420px]">
            <div className="h-full border border-white/10 bg-white/5 backdrop-blur-sm rounded-none p-4 overflow-y-auto">
              <div className="text-sm text-white/80 mb-3">Controls</div>
              <div className="space-y-3 text-sm text-white/70">
                <div>Insert Text (coming soon)</div>
                <div>Insert Dialogue PNG (coming soon)</div>
                <div>Font family / size (coming soon)</div>
                <div>Save Layout (coming soon)</div>
              </div>
            </div>
          </aside>
        </div>
      </main>
      {croppingPanel && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center px-4">
          <div className="w-full max-w-[900px] bg-[#0f0f1a] border border-white/10 rounded-md overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <div className="font-semibold text-white">Crop Panel</div>
              <div className="text-xs text-white/60">Double-clicked: {croppingPanel.id}</div>
            </div>
            <div className="relative" style={{ height: 520 }}>
              <ReactCrop crop={crop} onChange={(c) => setCrop(c)} keepSelection>
                <img src={croppingPanel.src} alt="crop" style={{ maxHeight: '520px', objectFit: 'contain' }} />
              </ReactCrop>
            </div>
            <div className="px-4 py-3 border-t border-white/10 flex items-center gap-3 justify-end">
              <div className="flex items-center gap-2">
                <Button variant="outline" className="border-white/20 text-white hover:bg-white/10" onClick={() => { setCroppingPanelId(null); setZoom(1); setCrop({ x: 0, y: 0 }); setCroppedAreaPixels(null); }}>Cancel</Button>
                <Button className="bg-gradient-to-r from-fuchsia-500 to-indigo-400 text-white" onClick={applyCrop}>Apply Crop</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


