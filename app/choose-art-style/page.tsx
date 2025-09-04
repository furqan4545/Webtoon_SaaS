"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "../dashboard/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/utils/supabase/client";

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
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // Load any existing saved art style from DB (optional prefill)
    (async () => {
      try {
        const projectId = sessionStorage.getItem('currentProjectId');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !projectId) return;
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

  const appendStyle = (text: string) => {
    const next = styleText ? `${styleText}\n${text}` : text;
    setStyleText(next);
    setCharCount(next.length);
  };

  const handleContinue = async () => {
    const text = styleText.trim();
    if (!text) return;
    // Persist to new art_styles table and project
    try {
      const projectId = sessionStorage.getItem('currentProjectId');
      const { data: { user } } = await supabase.auth.getUser();
      if (user && projectId) {
        // Update existing art style row (no upsert)
        const res = await fetch('/api/art-style', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, description: text }) });
        // If not found, optionally create once here, but per request we won't upsert.
        // Mirror to projects.art_style for convenience
        await fetch('/api/projects', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: projectId, art_style: text }) });
        // If characters already exist for this project, skip generation and go straight to editor
        try {
          const resChars = await fetch(`/api/characters?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
          const json = await resChars.json();
          if (Array.isArray(json.characters) && json.characters.length > 0) {
            router.push('/generate-characters');
            return;
          }
        } catch {}
      }
    } catch {}
    router.push("/analyzing-story");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0b12] to-[#0f0f1a] text-white">
      <Header />
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
                onChange={(e) => { setStyleText(e.target.value); setCharCount(e.target.value.length); }}
                className="h-48 bg-black/20 border-white/10 text-white placeholder:text-white/50"
              />
              <div className="mt-2 text-xs text-white/60">{charCount} characters</div>
            </CardContent>
          </Card>

          {/* Quick Style Options */}
          <div>
            <h2 className="text-xl font-semibold mb-4 text-white">Quick Style Options</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {artStyles.map((s) => (
                <button key={s.id} onClick={() => appendStyle(s.description)} className="text-left border border-white/10 bg-white/5 hover:bg-white/10 rounded-md p-4 cursor-pointer">
                  <div className="font-semibold mb-1">{s.title}</div>
                  <div className="text-sm text-white/70">{s.description}</div>
                </button>
              ))}
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
              disabled={!styleText.trim()}
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
