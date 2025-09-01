"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Wand2 } from "lucide-react";
import Header from "../dashboard/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SceneItem {
  id: string;
  storyText: string;
  description: string;
  imageDataUrl?: string;
  isGenerating?: boolean;
}

export default function WebtoonBuilder() {
  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasRun = useRef(false);

  const handleGenerateScene = async (index: number) => {
    setScenes(prev => prev.map((s, i) => i === index ? { ...s, isGenerating: true } : s));
    try {
      const characters = JSON.parse(sessionStorage.getItem('characters') || '[]');
      const res = await fetch('/api/generate-scene-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sceneDescription: scenes[index].description,
          storyText: scenes[index].storyText,
          characterImages: characters.map((c: any, idx: number) => ({ name: c.name || `Character ${idx+1}`, dataUrl: c.imageDataUrl }))
        })
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to generate scene image');
      setScenes(prev => prev.map((s, i) => i === index ? { ...s, imageDataUrl: data.image, isGenerating: false } : s));
    } catch (e) {
      console.error(e);
      setScenes(prev => prev.map((s, i) => i === index ? { ...s, isGenerating: false } : s));
    }
  };

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;
    const run = async () => {
      try {
        const story = sessionStorage.getItem('story');
        if (!story) {
          setError('No story found.');
          setLoading(false);
          return;
        }
        const res = await fetch('/api/generate-scenes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ story }),
        });
        const data = await res.json();
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || 'Failed to generate scenes');
        }
        const scenesObj = data.scenes || {};
        const items: SceneItem[] = Object.keys(scenesObj).map((key, idx) => ({
          id: key,
          storyText: scenesObj[key]?.Story_Text || '',
          description: scenesObj[key]?.Scene_Description || '',
        }));
        setScenes(items);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0b12] to-[#0f0f1a] text-white">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Create Your Webtoon</h1>
        {loading && (
          <div className="text-white/70">Generating scenes...</div>
        )}
        {error && (
          <div className="text-red-400 mb-4">{error}</div>
        )}
        {!loading && !error && (
          <div className="space-y-6">
            {scenes.map((scene, i) => (
              <Card key={scene.id} className="border-white/10 bg-white/5 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-white">Scene {i + 1}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="text-xs uppercase text-white/60 mb-1">Scene Description</div>
                    <div className="text-white/90">{scene.description}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-white/60 mb-1">Story Text</div>
                    <div className="text-white/80">{scene.storyText}</div>
                  </div>
                  <div className="pt-2">
                    <Button
                      className="bg-gradient-to-r from-fuchsia-500 to-indigo-400 text-white"
                      disabled={scene.isGenerating}
                      onClick={() => handleGenerateScene(i)}
                    >
                      {scene.isGenerating ? (
                        <>
                          <div className="h-4 w-4 mr-2 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Wand2 className="h-4 w-4 mr-2" />
                          Generate
                        </>
                      )}
                    </Button>
                  </div>
                  {scene.imageDataUrl && (
                    <div className="mt-4">
                      <img src={scene.imageDataUrl} alt={`Scene ${i + 1}`} className="w-full rounded-md border border-white/10" />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}


