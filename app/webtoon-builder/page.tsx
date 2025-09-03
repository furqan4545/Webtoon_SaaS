"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Wand2, ChevronLeft, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import ChangeArtStyleDialog from "@/components/ChangeArtStyleDialog";
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
  const router = useRouter();
  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasRun = useRef(false);
  const [insertLoadingIndex, setInsertLoadingIndex] = useState<number | null>(null);
  const allImagesReady = scenes.length > 0 && scenes.every(s => !!s.imageDataUrl);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState<number>(0);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'system' | 'user' | 'assistant'; text: string }>>([]);
  const [chatDraft, setChatDraft] = useState<string>("");
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [chipActive, setChipActive] = useState<boolean>(false);
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

  const handleGenerateScene = async (index: number, overrideDescription?: string) => {
    setScenes(prev => prev.map((s, i) => i === index ? { ...s, isGenerating: true } : s));
    try {
      const characters = JSON.parse(sessionStorage.getItem('characters') || '[]');
      const artStyle = sessionStorage.getItem('artStyle') || undefined;
      const res = await fetch('/api/generate-scene-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sceneDescription: overrideDescription ?? scenes[index].description,
          storyText: scenes[index].storyText,
          characterImages: characters.map((c: any, idx: number) => ({ name: c.name || `Character ${idx+1}`, dataUrl: c.imageDataUrl })),
          artStyle,
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

  useEffect(() => {
    try {
      const stored = localStorage.getItem('webtoonChatChipActive');
      if (stored != null) setChipActive(stored === '1');
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem('webtoonChatChipActive', chipActive ? '1' : '0'); } catch {}
  }, [chipActive]);

  function isValidSceneDescription(text: string): { valid: boolean; reason?: string } {
    const t = (text || '').toLowerCase().trim();
    if (!t) return { valid: false, reason: 'empty' };
    // Obvious chit-chat / small talk / unrelated
    const smallTalk = [
      'how are you', 'what\'s up', 'whats up', 'hello', 'hi', 'hey', 'thank you', 'thanks', 'ok', 'okay', 'good morning', 'good night', 'who are you'
    ];
    if (smallTalk.some(p => t === p || t.startsWith(p))) return { valid: false, reason: 'smalltalk' };
    // If it's a question directly to assistant
    if (t.includes('?') && /\byou\b/.test(t)) return { valid: false, reason: 'question' };

    // Special-case: background removal/segmentation/extraction or white background directives
    const backgroundDirectivePatterns = [
      /\b(remove|erase|delete|cut|clear|drop|strip|segment|mask|matte|clip) (the )?background\b/,
      /\b(make|set|turn) (the )?background (to )?(white|blank|plain)\b/,
      /\bbackground( is)? (all )?(white|blank|plain|solid white)\b/,
      /\bno background\b/,
      /\b(backgroundless|bg-less|bg less)\b/,
      /\b(extract|isolate) (the )?(character|characters|subject)s?\b/,
      /\b(subject only|characters? only)\b/,
      /\btransparent background\b/,
    ];
    if (backgroundDirectivePatterns.some((re) => re.test(t))) {
      return { valid: true };
    }
    // Very short directives we still allow (quick actions like "close-up", "wider shot")
    const directional = [
      'close-up', 'close up', 'wider shot', 'wide shot', 'brighter lighting', 'darker lighting', 'more romantic', 'more horror', 'more dramatic', 'add dialogue',
      'remove background', 'white background', 'make background white', 'no background', 'transparent background', 'segment background', 'extract characters', 'isolate character', 'characters only', 'subject only'
    ];
    if (directional.includes(t)) return { valid: true };
    // Basic heuristic: has at least a few words and at least one action/visual cue
    const wordCount = t.split(/\s+/).filter(Boolean).length;
    const verbs = [
      'walk', 'run', 'look', 'stare', 'smile', 'cry', 'hug', 'kiss', 'sit', 'stand', 'hold', 'say', 'shout', 'whisper', 'fight', 'open', 'close', 'enter', 'leave', 'approach', 'turn', 'glance', 'reveal', 'show', 'pan', 'zoom'
    ];
    const visuals = [
      'night', 'rain', 'sunset', 'street', 'room', 'alley', 'school', 'cafe', 'city', 'forest', 'beach', 'sky', 'camera', 'panel', 'scene', 'lighting', 'shadow', 'moon', 'sunlight'
    ];
    const hasVerb = verbs.some(v => new RegExp(`\\b${v}(s|ed|ing)?\\b`).test(t));
    const hasVisual = visuals.some(v => new RegExp(`\\b${v}\\b`).test(t));
    if (wordCount >= 6 && (hasVerb || hasVisual)) return { valid: true };
    // Allow imperative mood starting with verbs like "make", "show", "add" if long enough
    if (/^(make|show|add|change|turn|set)\b/.test(t) && wordCount >= 5) return { valid: true };
    return { valid: false, reason: 'too-vague' };
  }

  const processUserText = async (text: string) => {
    const { valid } = isValidSceneDescription(text);
    setChatMessages((prev) => [...prev, { role: 'user', text }]);
    if (!valid) {
      setChatMessages((prev) => [...prev, { role: 'assistant', text: 'Sorry, I am designed to help with only webtoon generation. Try modifying your prompt.' }]);
      return;
    }
    // Update the selected scene's description and regenerate
    setScenes(prev => prev.map((s, i) => i === selectedSceneIndex ? { ...s, description: text } : s));
    setChatMessages((prev) => [...prev, { role: 'assistant', text: 'Updated the scene description. Regenerating the image...' }]);
    await handleGenerateScene(selectedSceneIndex, text);
  };

  const handleQuick = (q: string) => {
    setChatDraft((prev) => (prev ? `${prev} ${q}` : q));
    setTimeout(() => chatInputRef.current?.focus(), 0);
  };

  const handleSend = (e: any) => {
    e.preventDefault();
    const value = chatDraft.trim();
    if (!value) return;
    processUserText(value);
    setChatDraft('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0b12] to-[#0f0f1a] text-white">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8 lg:pr-[460px]">
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="outline"
            className="border-white/20 text-white hover:bg-white/10"
            onClick={() => router.push('/generate-characters')}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="text-3xl font-bold">Create Your Webtoon</h1>
          <div className="ml-auto">
            <ChangeArtStyleDialog
              initialStyle={"Webtoon comic"}
              onSave={(style) => {
                try { sessionStorage.setItem('artStyle', style); } catch {}
              }}
            />
          </div>
        </div>
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
            <aside className="hidden lg:block fixed top-[64px] right-0 h-[calc(100vh-64px)] w-[420px]">
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
                <div className="px-3 pt-3 pb-3 border-t border-white/10">
                  <div className="mb-2">
                    <button
                      type="button"
                      onClick={() => setChipActive((v) => !v)}
                      className={`text-xs rounded-full px-3 py-1 ${chipActive ? 'bg-fuchsia-600 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                    >
                      {chipActive ? 'Chip: Active' : 'Chip: Inactive'}
                    </button>
                  </div>
                  <form onSubmit={handleSend} className="flex items-start">
                    <div className="relative flex-1">
                      <textarea
                        id="chat-input"
                        ref={chatInputRef}
                        name="chat"
                        rows={3}
                        value={chatDraft}
                        onChange={(e) => setChatDraft(e.target.value)}
                        placeholder="Describe your change..."
                        className="w-full bg-transparent border border-white/15 rounded-md pl-3 pr-12 py-2 text-sm outline-none focus:border-fuchsia-500/60 resize-none overflow-y-auto overflow-x-hidden min-h-[84px] max-h-[84px] whitespace-pre-wrap"
                      />
                      <button
                        type="submit"
                        aria-label="Send"
                        className="absolute bottom-2 right-2 h-8 w-8 rounded-full bg-gradient-to-r from-fuchsia-500 to-indigo-400 text-white flex items-center justify-center hover:opacity-90"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </form>
                </div>
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


