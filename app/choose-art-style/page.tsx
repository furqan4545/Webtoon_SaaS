"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "../dashboard/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

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
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const router = useRouter();

  const handleContinue = () => {
    if (selectedStyle) {
      // Store art style and navigate to analyzing screen
      sessionStorage.setItem('artStyle', selectedStyle);
      router.push("/analyzing-story");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0b12] to-[#0f0f1a] text-white">
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-8">
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

        {/* Style Selection Cards */}
        <div className="space-y-8">
          <div>
            <h2 className="text-xl font-semibold mb-6 text-white">Quick Style Options</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {artStyles.map((style) => (
                <Card
                  key={style.id}
                  className={`cursor-pointer transition-all duration-200 border-2 ${
                    selectedStyle === style.id
                      ? "border-fuchsia-500 bg-fuchsia-500/10 shadow-[0_0_20px_rgba(168,85,247,0.3)]"
                      : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                  } backdrop-blur-sm`}
                  onClick={() => setSelectedStyle(style.id)}
                >
                  <CardContent className="p-6">
                    <h3 className="text-lg font-semibold text-white mb-3">{style.title}</h3>
                    <p className="text-white/70 text-sm leading-relaxed">{style.description}</p>
                    {selectedStyle === style.id && (
                      <div className="mt-4 flex items-center gap-2 text-fuchsia-400 text-sm font-medium">
                        <div className="w-2 h-2 bg-fuchsia-400 rounded-full"></div>
                        Selected
                      </div>
                    )}
                  </CardContent>
                </Card>
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
              disabled={!selectedStyle}
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
