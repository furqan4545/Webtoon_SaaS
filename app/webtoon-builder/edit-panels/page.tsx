"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient as createBrowserSupabase } from "@/utils/supabase/client";

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0b12] to-[#0f0f1a] text-white">
      <main className="mx-auto max-w-[1600px] px-4 py-6">
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
          {/* Left: editing canvas */}
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
          {/* Right: control panel scaffold */}
          <aside className="w-[380px] border border-white/10 bg-white/5 backdrop-blur-sm rounded-md p-4 h-[80vh] sticky top-6">
            <div className="text-sm text-white/80 mb-3">Controls</div>
            <div className="space-y-3 text-sm text-white/70">
              <div>Insert Text (coming soon)</div>
              <div>Insert Dialogue PNG (coming soon)</div>
              <div>Font family / size (coming soon)</div>
              <div>Save Layout (coming soon)</div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}


