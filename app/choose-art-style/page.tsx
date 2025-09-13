"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/utils/supabase/client";
import StepBar from "@/components/StepBar";

const artStyles = [
  {
    id: "webtoon",
    title: "Webtoon Style",
    description: "Korean webtoon style with clean lines and vibrant colors. Perfect for modern storytelling with expressive characters and dynamic scenes."
  },
  {
    id: "anime",
    title: "Anime Style", 
    description: "Classic anime/manga aesthetic with distinctive character features. Bold expressions and detailed backgrounds create engaging visual narratives."
  },
  {
    id: "realistic",
    title: "Realistic Style",
    description: "Photorealistic art style with detailed textures and natural lighting. Creates immersive, lifelike scenes with authentic character portrayals."
  },
  {
    id: "cartoon",
    title: "Cartoon Style",
    description: "Fun cartoon style with simplified shapes and bright colors. Playful and accessible design perfect for lighthearted storytelling."
  }
];

export default function ChooseArtStyle() {
  const [styleText, setStyleText] = useState<string>("");
  const [charCount, setCharCount] = useState(0);
  const [selectedStyleId, setSelectedStyleId] = useState<string>('custom');
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // Load any existing saved art style from DB (optional prefill)
    (async () => {
      try {
        const projectId = sessionStorage.getItem('currentProjectId');
        if (!projectId) return;
        const res = await fetch(`/api/art-style?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
        const json = await res.json();
        const pre = (json?.artStyle?.description as string | undefined) || '';
        if (pre) {
          setStyleText(pre);
          setCharCount(pre.length);
        }
      } catch {}
    })();
  }, []);

  // Save step index (1) when this page is active
  useEffect(() => {
    (async () => {
      try {
        const projectId = sessionStorage.getItem('currentProjectId');
        if (!projectId) return;
        await fetch('/api/projects', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: projectId, steps: 1 }) });
      } catch {}
    })();
  }, []);

  // Selecting a preset overrides the textarea content instead of appending
  const selectPreset = (id: string, text: string) => {
    setStyleText(text);
    setCharCount(text.length);
    setSelectedStyleId(id);
  };

  // If user types, treat as custom style and reflect selection
  const handleTextChange = (value: string) => {
    setStyleText(value);
    setCharCount(value.length);
    setSelectedStyleId('custom');
  };

  // If textarea becomes empty, auto-select custom card
  useEffect(() => {
    if (!styleText.trim()) setSelectedStyleId('custom');
  }, [styleText]);

  const handleContinue = async () => {
    const text = styleText.trim();
    if (!text) return;
    try { sessionStorage.setItem('pendingArtStyle', text); } catch {}
    // Navigate immediately to loader
    router.push("/analyzing-story");
    // Persist in background
    (async () => {
      try {
        const projectId = sessionStorage.getItem('currentProjectId');
        if (!projectId) return;
        const check = await fetch(`/api/art-style?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
        const j = await check.json();
        if (j?.artStyle) {
          await fetch('/api/art-style', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, description: text }) });
        } else {
          await fetch('/api/art-style', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, description: text }) });
        }
        await fetch('/api/projects', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: projectId, art_style: text }) });
      } catch {}
    })();
  };

  // removed re-analyze action per requirements

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0b12] to-[#0f0f1a] text-white">
      <main className="mx-auto max-w-5xl px-4 py-8">
        {/* Header Section */}
        <div className="mb-8">
          <Link
            href="/import-story"
            className="inline-flex items-center gap-2 text-white/70 hover:text-white mb-4 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <h1 className="text-3xl font-bold mb-2">Choose Your Art Style</h1>
          <p className="text-white/70">Select the visual style for your webtoon characters and scenes</p>
        </div>

        <StepBar currentStep={2} className="mb-6" />

        {/* Top description card */}
        <div className="space-y-8">
          <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-8 w-8 rounded-full bg-fuchsia-500/20 flex items-center justify-center">🎨</div>
                <div>
                  <div className="text-lg font-semibold">Describe Your Art Style</div>
                  <div className="text-white/70 text-sm">Tell us how you want your webtoon to look</div>
                </div>
              </div>
              <Textarea
                placeholder={"Describe your desired art style in detail...\n\nExamples:\n• Korean webtoon style with clean lines, soft shading, and vibrant colors\n• Dark gothic style with dramatic shadows and muted color palette\n• Watercolor style with soft edges and pastel colors\n• Pixel art style reminiscent of 16-bit video games\n• Minimalist line art with bold geometric shapes\n• Studio Ghibli inspired with lush backgrounds and expressive characters"}
                value={styleText}
                onChange={(e) => handleTextChange(e.target.value)}
                className="h-48 bg-black/20 border-white/10 text-white placeholder:text-white/50"
              />
              <div className="mt-2 text-xs text-white/60">{charCount} characters</div>
            </CardContent>
          </Card>

          {/* Quick Style Options */}
          <div>
            <h2 className="text-xl font-semibold mb-4 text-white">Quick Style Options</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {/* Custom style card (default active) */}
              <button
                key="custom"
                onClick={() => setSelectedStyleId('custom')}
                className={
                  `text-left border rounded-md p-3 cursor-pointer transition-colors ${
                    selectedStyleId === 'custom'
                      ? 'bg-gradient-to-r from-fuchsia-500/20 to-indigo-400/20 border-fuchsia-500/40 ring-2 ring-fuchsia-500/50'
                      : 'border-white/10 bg-white/5 hover:bg-white/10'
                  }`
                }
              >
                <div className="text-sm font-semibold mb-1">My Custom Style</div>
                <div className="text-xs text-white/70">Write your own style in the box above</div>
              </button>

              {artStyles.map((s) => {
                const selected = selectedStyleId === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => selectPreset(s.id, s.description)}
                    className={
                      `text-left border rounded-md p-3 cursor-pointer transition-colors ${
                        selected
                          ? 'bg-gradient-to-r from-fuchsia-500/20 to-indigo-400/20 border-fuchsia-500/40 ring-2 ring-fuchsia-500/50'
                          : 'border-white/10 bg-white/5 hover:bg-white/10'
                      }`
                    }
                  >
                    <div className="text-sm font-semibold mb-1">{s.title}</div>
                    <div className="text-xs text-white/70">{s.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 pt-4">
            <Button
              variant="outline"
              onClick={() => router.push("/import-story")}
              className="border-white/20 text-white hover:bg-white/10"
            >
              Back to Import
            </Button>
            <Button
              onClick={handleContinue}
              disabled={styleText.trim().length < 6}
              className="flex-1 bg-gradient-to-r from-fuchsia-500 to-indigo-400 text-white shadow-[0_8px_30px_rgba(168,85,247,0.35)] hover:opacity-95 disabled:opacity-50"
            >
              Continue to Character Creation →
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
