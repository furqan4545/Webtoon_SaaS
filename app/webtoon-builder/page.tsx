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
  const [insertLoadingIndex, setInsertLoadingIndex] = useState<number | null>(null);
  const allImagesReady = scenes.length > 0 && scenes.every(s => !!s.imageDataUrl);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState<number>(0);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'system' | 'user' | 'assistant'; text: string }>>([]);
  const quickActions = [
    "More dramatic",
    "Add dialogue",
    "Lighter mood",
    "More romantic",
    "More horror",
    "Wider shot",
    "Close-up",
    "Brighter lighting",
    "Darker lighting",
  ];

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

  const handleInsertAfter = async (index: number) => {
    // Prepare compact scenes JSON payload
    const payload = scenes.map((s, i) => ({
      id: `scene_${i + 1}`,
      Story_Text: s.storyText,
      Scene_Description: s.description,
    }));
    try {
      setInsertLoadingIndex(index);
      const res = await fetch('/api/insert-scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes: payload,
          insertAfterIndex: index,
        })
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to insert scene');
      const newScene = {
        id: `scene_${index + 2}`,
        storyText: data.scene?.Story_Text || '',
        description: data.scene?.Scene_Description || '',
      } as SceneItem;
      // Insert new scene after index and renumber display only
      setScenes(prev => {
        const copy = [...prev];
        copy.splice(index + 1, 0, newScene);
        return copy;
      });
    } catch (e) {
      console.error('Insert scene error', e);
    } finally {
      setInsertLoadingIndex(null);
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
        if (items[0]) {
          setSelectedSceneIndex(0);
          setChatMessages([
            { role: 'system', text: 'You are currently editing Scene 1' },
            { role: 'assistant', text: `Scene description: ${items[0].description}` },
          ]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  useEffect(() => {
    if (!scenes[selectedSceneIndex]) return;
    setChatMessages([
      { role: 'system', text: `You are currently editing Scene ${selectedSceneIndex + 1}` },
      { role: 'assistant', text: `Scene description: ${scenes[selectedSceneIndex].description}` },
    ]);
  }, [selectedSceneIndex]);

  const handleQuick = (q: string) => {
    setChatMessages((prev) => [...prev, { role: 'user', text: q }]);
  };

  const handleSend = (e: any) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const input = form.querySelector('#chat-input') as HTMLInputElement | null;
    const value = input?.value?.trim();
    if (!value) return;
    setChatMessages((prev) => [...prev, { role: 'user', text: value }]);
    if (input) input.value = '';
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0b12] to-[#0f0f1a] text-white">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8 lg:pr-[380px]">
        <h1 className="text-3xl font-bold mb-6">Create Your Webtoon</h1>
        {loading && (
          <div className="text-white/70">Generating scenes...</div>
        )}
        {error && (
          <div className="text-red-400 mb-4">{error}</div>
        )}
        {!loading && !error && (
          <div className="flex gap-6">
            <div className="flex-1 space-y-6">
            {scenes.map((scene, i) => (
              <div key={scene.id} onClick={() => setSelectedSceneIndex(i)}>
              <Card className={`border-white/10 bg-white/5 backdrop-blur-sm cursor-pointer ${selectedSceneIndex === i ? 'ring-2 ring-fuchsia-500/60' : ''}`}>
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
                    <div className="mt-4 flex justify-center">
                      <img src={scene.imageDataUrl} alt={`Scene ${i + 1}`} className="max-w-[480px] w-full rounded-md border border-white/10" />
                    </div>
                  )}
                </CardContent>
              </Card>
              {/* Insert New Scene button between cards */}
              <div className="flex justify-center py-3">
                <Button
                  variant="outline"
                  className="border-white/20 text-white hover:bg-white/10"
                  onClick={() => handleInsertAfter(i)}
                  disabled={insertLoadingIndex === i}
                >
                  {insertLoadingIndex === i ? (
                    <>
                      <div className="h-4 w-4 mr-2 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Inserting...
                    </>
                  ) : (
                    "+ Insert New Scene"
                  )}
                </Button>
              </div>
              </div>
            ))}
            </div>
            <aside className="hidden lg:block fixed top-[64px] right-0 h-[calc(100vh-64px)] w-[360px]">
              <div className="h-full border border-white/10 bg-white/5 backdrop-blur-sm rounded-none flex flex-col">
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                  <div className="font-semibold">Scene Editor</div>
                  <div className="text-xs bg-white/10 rounded-full px-2 py-1">Scene {selectedSceneIndex + 1}</div>
                </div>
                <div className="px-3 py-2 border-b border-white/10 overflow-x-auto whitespace-nowrap space-x-2">
                  {quickActions.map((q) => (
                    <button key={q} onClick={() => handleQuick(q)} className="inline-block text-xs bg-white/10 hover:bg-white/20 rounded-full px-3 py-1 mr-2">{q}</button>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                  {chatMessages.map((m, idx) => (
                    <div key={idx} className={m.role === 'user' ? 'text-right' : 'text-left'}>
                      <div className={`inline-block text-sm px-3 py-2 rounded-lg ${m.role === 'user' ? 'bg-fuchsia-600 text-white' : 'bg-white/10 text-white'}`}>{m.text}</div>
                    </div>
                  ))}
                </div>
                <form onSubmit={handleSend} className="p-3 border-t border-white/10 flex gap-2">
                  <input id="chat-input" name="chat" autoComplete="off" placeholder="Describe your change..." className="flex-1 bg-transparent border border-white/15 rounded-md px-3 py-2 text-sm outline-none focus:border-fuchsia-500/60" />
                  <Button type="submit" className="bg-gradient-to-r from-fuchsia-500 to-indigo-400 text-white">Send</Button>
                </form>
              </div>
            </aside>
          </div>
        )}
        {!loading && (
          <div className="flex justify-center mt-8">
            <Button
              onClick={async () => {
                if (!allImagesReady) return;
                // Convert data URLs to blob URLs to avoid storage quota limits
                const dataUrls = scenes.map(s => s.imageDataUrl).filter(Boolean) as string[];
                const blobUrls: string[] = [];
                for (const src of dataUrls) {
                  const resp = await fetch(src);
                  const blob = await resp.blob();
                  const url = URL.createObjectURL(blob);
                  blobUrls.push(url);
                }
                const win = window.open('/webtoon-builder/preview', '_blank');
                // Fallback: stash tiny blob urls (short) in sessionStorage
                try {
                  sessionStorage.setItem('previewBlobUrls', JSON.stringify(blobUrls));
                } catch {}
                // Post to the new window when ready
                setTimeout(() => {
                  try { win?.postMessage({ type: 'webtoon-preview', images: blobUrls }, window.location.origin); } catch {}
                }, 300);
              }}
              disabled={!allImagesReady}
              className="px-8 bg-white text-black hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Preview Webtoon
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}


