"use client";

import { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface ChangeArtStyleDialogProps {
  initialStyle?: string;
  presets?: string[];
  onSave?: (style: string) => void;
  buttonClassName?: string;
}

const DEFAULT_PRESETS = [
  "Webtoon comic",
  "Korean webtoon style",
  "Anime/Manga style",
  "Cartoon",
  "Semi-realistic",
  "Watercolor",
  "Pixel art",
  "3D render",
];

export default function ChangeArtStyleDialog({ initialStyle, presets, onSave, buttonClassName }: ChangeArtStyleDialogProps) {
  const presetList = useMemo(() => (presets && presets.length ? presets : DEFAULT_PRESETS), [presets]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(initialStyle || presetList[0]);
  const [selectedPreset, setSelectedPreset] = useState<string>(initialStyle || presetList[0]);
  const [dirty, setDirty] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewImages, setPreviewImages] = useState<Record<string, string | null | undefined>>({});
  const hasAnyPreview = useMemo(() => Object.values(previewImages).some(Boolean), [previewImages]);
  const [characterList, setCharacterList] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);

  useEffect(() => {
    setText(initialStyle || presetList[0]);
    setSelectedPreset(initialStyle || presetList[0]);
    setDirty(false);
    setGenerating(false);
    setPreviewImages({});
    // Load characters from DB on open
    if (open) {
      (async () => {
        try {
          const projectId = typeof window !== 'undefined' ? sessionStorage.getItem('currentProjectId') : null;
          if (!projectId) { setCharacterList([]); return; }
          const res = await fetch(`/api/characters?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
          const json = await res.json();
          const list = Array.isArray(json.characters) ? json.characters : [];
          const minimal = list.map((c: any) => ({ id: c.id, name: c.name, description: c.description || '' }));
          setCharacterList(minimal);
        } catch { setCharacterList([]); }
      })();
    }
  }, [open, initialStyle, presetList]);

  useEffect(() => {
    const base = initialStyle || presetList[0];
    setDirty(text.trim() !== base.trim() || selectedPreset.trim() !== base.trim());
  }, [text, selectedPreset, initialStyle, presetList]);

  const handleChipClick = (p: string) => {
    setSelectedPreset(p);
    setText(p);
  };

  const handleSave = () => {
    const value = text.trim();
    if (!value) return;
    onSave?.(value);
    setOpen(false);
  };

  const regenerateWithNewStyle = async () => {
    const style = text.trim();
    if (!style || generating) return;
    setGenerating(true);
    // Initialize all slots as undefined (show loader)
    const initial: Record<string, string | null | undefined> = {};
    for (const ch of characterList) initial[ch.id] = undefined;
    setPreviewImages(initial);
    // Run sequentially: one character at a time
    const projectId = typeof window !== 'undefined' ? sessionStorage.getItem('currentProjectId') : null;
    for (const ch of characterList) {
      try {
        const res = await fetch('/api/generate-character-with-newArt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, name: ch.name, description: ch.description, artStyle: style }),
        });
        const data = await res.json();
        if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed');
        setPreviewImages((prev) => ({ ...prev, [ch.id]: data.image as string }));
        // Notify header to refresh credits after each successful generation
        try { window.dispatchEvent(new Event('credits:refresh')); } catch {}
      } catch (e) {
        setPreviewImages((prev) => ({ ...prev, [ch.id]: null }));
      }
    }
    setGenerating(false);
  };

  const saveNewImagesAsReferences = () => {
    onSave?.(text.trim());
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={buttonClassName || "bg-gradient-to-r from-fuchsia-500 to-indigo-400 text-white"}>Change Art Style</Button>
      </DialogTrigger>
      <DialogContent className="w-[min(92vw,820px)] max-w-[820px] h-[min(90vh,700px)] rounded-xl border-white/15 bg-[#0f0f16] p-6 md:p-7 flex flex-col">
        {hasAnyPreview && !generating && (
          <div className="flex justify-end mb-2">
            <Button
              onClick={saveNewImagesAsReferences}
              className="h-9 rounded-full px-5 bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white shadow-[0_8px_30px_rgba(168,85,247,0.35)] hover:opacity-95"
            >
              Save
            </Button>
          </div>
        )}
        <DialogHeader>
          <DialogTitle className="text-xl md:text-2xl">Edit Art Style</DialogTitle>
          <DialogDescription>
            Changes will apply to newly generated panels. Existing panels will keep their current style.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-3 flex-1 overflow-y-auto pr-1">
          <div className="text-sm font-medium">Your Custom Art Style</div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[140px] border-fuchsia-500/40 focus-visible:ring-0 focus-visible:border-fuchsia-500 bg-black/20"
            placeholder="Describe your preferred art style..."
          />
          <div className="text-xs uppercase text-white/60">Quick styles</div>
          <div className="-mx-1 px-1 overflow-x-auto">
            <div className="flex items-center gap-2 pb-1">
              {presetList.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleChipClick(p)}
                  className={`shrink-0 text-xs rounded-full px-3 py-1.5 ${selectedPreset === p ? 'bg-fuchsia-600 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              onClick={regenerateWithNewStyle}
              disabled={!dirty || generating || characterList.length === 0}
              className="flex-[2] bg-fuchsia-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generating ? 'Regenerating...' : 'Regenerate characters with new art style'}
            </Button>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              className="flex-1 border-white/20 text-white hover:bg-white/10"
            >
              Cancel
            </Button>
          </div>

          {generating || Object.keys(previewImages).length > 0 ? (
            <div className="pt-3 space-y-3">
              <div className="text-sm font-medium">Preview</div>
              <div className="overflow-x-auto">
                <div className="flex items-stretch gap-3">
                  {characterList.map((ch) => {
                    const img = previewImages[ch.id];
                    return (
                      <div key={ch.id} className="shrink-0 w-[220px] border border-white/10 rounded-md bg-white/5 p-2">
                        <div className="text-xs text-white/80 mb-2 truncate">{ch.name}</div>
                        <div className="aspect-[3/4] w-full rounded-sm border border-white/10 overflow-hidden flex items-center justify-center bg-black/20">
                          {generating && img === undefined ? (
                            <div className="h-6 w-6 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          ) : img ? (
                            <img onClick={() => setZoomUrl(img)} src={img} alt={ch.name} className="w-full h-full object-cover cursor-zoom-in" />
                          ) : (
                            <div className="text-xs text-white/50">Failed</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              
            </div>
          ) : null}
        </div>
        {zoomUrl && (
          <div
            className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center"
            onClick={() => setZoomUrl(null)}
          >
            <img src={zoomUrl} alt="Preview" className="max-w-[92vw] max-h-[92vh] rounded-md border border-white/20" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


