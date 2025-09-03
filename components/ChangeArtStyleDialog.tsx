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

  useEffect(() => {
    setText(initialStyle || presetList[0]);
    setSelectedPreset(initialStyle || presetList[0]);
    setDirty(false);
  }, [open]);

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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={buttonClassName || "bg-gradient-to-r from-fuchsia-500 to-indigo-400 text-white"}>Change Art Style</Button>
      </DialogTrigger>
      <DialogContent className="w-[min(92vw,880px)] max-w-[880px] rounded-xl border-white/15 bg-[#0f0f16] p-6 md:p-7">
        <DialogHeader>
          <DialogTitle className="text-xl md:text-2xl">Edit Art Style</DialogTitle>
          <DialogDescription>
            Changes will apply to newly generated panels. Existing panels will keep their current style.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-3">
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
              onClick={handleSave}
              disabled={!dirty}
              className="flex-[2] bg-fuchsia-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Changes
            </Button>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              className="flex-1 border-white/20 text-white hover:bg-white/10"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


