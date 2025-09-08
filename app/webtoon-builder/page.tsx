"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Wand2, ChevronLeft, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import ChangeArtStyleDialog from "@/components/ChangeArtStyleDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient as createBrowserSupabase } from "@/utils/supabase/client";
import { Info } from "lucide-react";
import StepBar from "@/components/StepBar";

interface SceneItem {
  id: string;
  storyText: string;
  description: string;
  imageDataUrl?: string;
  isGenerating?: boolean;
  generationPhase?: 'image' | 'sfx' | null;
}

export default function WebtoonBuilder() {
  const router = useRouter();
  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasRun = useRef(false);
  const isReloadRef = useRef(false);
  const autoTriggeredRef = useRef(false);
  const [insertLoadingIndex, setInsertLoadingIndex] = useState<number | null>(null);
  const allImagesReady = scenes.length > 0 && scenes.every(s => !!s.imageDataUrl);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState<number>(0);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'system' | 'user' | 'assistant'; text: string }>>([]);
  const [chatDraft, setChatDraft] = useState<string>("");
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  type ActiveBadge = 'none' | 'remove' | 'edit';
  const [activeBadge, setActiveBadge] = useState<ActiveBadge>('none');
  const supabase = createBrowserSupabase();
  const [artStyle, setArtStyle] = useState<string>("");
  const [refImages, setRefImages] = useState<Array<{ name: string; dataUrl: string }>>([]);
  const [isFirstLoad, setIsFirstLoad] = useState<boolean>(true);
  const [credits, setCredits] = useState<{ remaining: number; resetsAt?: string } | null>(null);
  const [blockingFirstPanel, setBlockingFirstPanel] = useState<boolean>(false);

  const applyGeneratedSceneImages = async (projectId: string) => {
    try {
      const { data, error } = await supabase
        .from('generated_scene_images')
        .select('scene_no,image_path')
        .eq('project_id', projectId)
        .order('scene_no', { ascending: true });
      if (error || !data) return;
      const signTasks = data.map(async (row) => {
        if (!row?.image_path) return [row?.scene_no, undefined] as const;
        const signed = await supabase.storage.from('webtoon').createSignedUrl(row.image_path, 60 * 60);
        return [row.scene_no, signed.data?.signedUrl] as const;
      });
      const signedList = await Promise.all(signTasks);
      const results: Record<number, string | undefined> = {};
      for (const [sceneNo, url] of signedList) {
        if (sceneNo) results[Number(sceneNo)] = url;
      }
      setScenes(prev => prev.map((s, i) => ({ ...s, imageDataUrl: results[i + 1] || s.imageDataUrl })));
    } catch {}
  };
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

  // Trim reference images to keep client → API payload under serverless limits (~4.5MB)
  const pickSafeRefsForPayload = (refs: Array<{ name: string; dataUrl: string }>): Array<{ name: string; dataUrl: string }> => {
    try {
      let approxBytes = 0;
      const out: Array<{ name: string; dataUrl: string }> = [];
      // Leave headroom for JSON overhead; target ~2.8MB
      const MAX_BYTES = 2_800_000;
      for (const r of refs) {
        const b64 = String(r.dataUrl || '').split(',')[1] || '';
        const bytes = Math.floor(b64.length * 0.75);
        if (!b64) continue;
        if (approxBytes + bytes > MAX_BYTES) break;
        approxBytes += bytes;
        out.push(r);
      }
      return out;
    } catch {
      return refs.slice(0, 1);
    }
  };

  const handleGenerateScene = async (index: number, overrideDescription?: string) => {
    setScenes(prev => prev.map((s, i) => i === index ? { ...s, isGenerating: true, generationPhase: 'image' } : s));
    try {
      const projectId = sessionStorage.getItem('currentProjectId');
      const characterImages: Array<{ name: string; dataUrl: string }> = pickSafeRefsForPayload(refImages);
      const res = await fetch('/api/generate-scene-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sceneDescription: overrideDescription ?? scenes[index].description,
          storyText: scenes[index].storyText,
          characterImages,
          artStyle: artStyle || undefined,
          projectId: projectId || undefined,
          sceneIndex: index + 1,
        })
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to generate scene image');

      // Update with the freshly generated image first
      setScenes(prev => prev.map((s, i) => i === index ? { ...s, imageDataUrl: data.image } : s));

      // Immediately chain sound-effects enhancement
      let secondSucceeded = false;
      try {
        // Switch phase to SFX while the second call runs
        setScenes(prev => prev.map((s, i) => i === index ? { ...s, generationPhase: 'sfx' } : s));
        const res2 = await fetch('/api/add-image-soundEffects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageDataUrl: data.image,
            instruction: 'add webtoon style sound effects based on the whats going on in the scene. Sound effects can go out of frame as well. Make sure to add not more than 4 sound effects. Some small text, some big text.',
            projectId: projectId || undefined,
            sceneNo: index + 1,
          })
        });
        const data2 = await res2.json();
        if (res2.ok && data2?.success && data2?.image) {
          secondSucceeded = true;
          setScenes(prev => prev.map((s, i) => i === index ? { ...s, imageDataUrl: data2.image } : s));
        }
      } catch (err) {
        console.error('add-image-soundEffects failed', err);
      }

      // Finalize UI state and credits
      setScenes(prev => prev.map((s, i) => i === index ? { ...s, isGenerating: false, generationPhase: null } : s));
      setChatMessages(prev => [...prev, { role: 'assistant', text: 'Done' }]);
      setCredits((prev) => {
        if (!prev) return prev;
        const decrement = secondSucceeded ? 2 : 1;
        return { ...prev, remaining: Math.max(0, (prev.remaining || 0) - decrement) };
      });
      window.dispatchEvent(new Event('credits:refresh'));
    } catch (e) {
      console.error(e);
      setScenes(prev => prev.map((s, i) => i === index ? { ...s, isGenerating: false, generationPhase: null } : s));
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
        try {
          const nav: any = (performance.getEntriesByType('navigation') as any)[0];
          isReloadRef.current = nav?.type === 'reload';
        } catch {}
        const projectId = sessionStorage.getItem('currentProjectId');
        if (!projectId) {
          setError('No project selected.');
          setLoading(false);
          return;
        }

        // Load art style (optional)
        try {
          const as = await fetch(`/api/art-style?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
          const js = await as.json();
          const pre = (js?.artStyle?.description as string | undefined) || '';
          if (pre) setArtStyle(pre);
        } catch {}

        // Load story strictly from DB
        let story: string | undefined;
        try {
          const resProj = await fetch(`/api/projects?id=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
          const j = await resProj.json();
          const s = j?.project?.story as string | undefined;
          if (s && typeof s === 'string' && s.trim()) {
            story = s;
          }
        } catch {}

        // Local cache first for instant reloads
        const cacheKeyScenes = `scenes:${projectId}`;
        const cachedScenes = (() => {
          try { return JSON.parse(localStorage.getItem(cacheKeyScenes) || 'null') as SceneItem[] | null; } catch { return null; }
        })();
        if (cachedScenes && Array.isArray(cachedScenes) && cachedScenes.length > 0) {
          setScenes(cachedScenes);
          setSelectedSceneIndex(0);
          setIsFirstLoad(false);
        }

        // Check for existing generated scenes in DB first
        let existingScenes: any[] = [];
        try {
          const r = await fetch(`/api/generated-scenes?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
          const j = await r.json();
          existingScenes = Array.isArray(j.scenes) ? j.scenes : [];
        } catch {}

        // Kick off character reference image preload in background (non-blocking)
        try {
          const cacheKey = `projectRefImages:${projectId}`;
          const cached = (() => { try { return JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch { return null; } })();
          if (cached && Array.isArray(cached)) {
            setRefImages(cached);
          }
          (async () => {
            try {
              const r = await fetch(`/api/characters?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
              const j = await r.json();
              const list = Array.isArray(j.characters) ? j.characters : [];
              const signedTasks = list.map(async (c: any, idx: number) => {
                if (!c?.image_path) return null;
                const signed = await supabase.storage.from('webtoon').createSignedUrl(c.image_path, 60 * 60);
                const url = signed.data?.signedUrl;
                if (!url) return null;
                try {
                  const resp = await fetch(url);
                  const blob = await resp.blob();
                  const b64 = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(blob); });
                  return { name: c.name || `Character ${idx+1}`, dataUrl: b64 };
                } catch { return null; }
              });
              const results = (await Promise.all(signedTasks)).filter(Boolean) as Array<{ name: string; dataUrl: string }>;
              if (results.length > 0) {
                setRefImages(results);
                try { localStorage.setItem(cacheKey, JSON.stringify(results)); } catch {}
              }
            } catch {}
          })();
        } catch {}

        if (existingScenes.length > 0) {
          const items: SceneItem[] = existingScenes.map((s: any) => ({ id: `scene_${s.scene_no}`, storyText: s.story_text || '', description: s.scene_description || '' }));
          setScenes(items);
          setSelectedSceneIndex(0);
          try { localStorage.setItem(cacheKeyScenes, JSON.stringify(items)); } catch {}
          setChatMessages([
            { role: 'system', text: 'You are currently editing Scene 1' },
            { role: 'assistant', text: `Scene description: ${items[0]?.description || ''}` },
          ]);
          // Merge in any previously generated images from DB
          await applyGeneratedSceneImages(projectId);
        } else {
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
          setSelectedSceneIndex(0);
          setChatMessages([
            { role: 'system', text: 'You are currently editing Scene 1' },
            { role: 'assistant', text: `Scene description: ${items[0]?.description || ''}` },
          ]);
          // Persist to DB
          try {
            const payload = items.map((s, i) => ({ scene_no: i + 1, story_text: s.storyText, scene_description: s.description }));
            await fetch('/api/generated-scenes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, scenes: payload }) });
          } catch {}
          // No images yet for a new generation; nothing to merge
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  // Auto-generate first scene image only on first navigation (not on reload), once per project per session
  useEffect(() => {
    if (loading) return;
    if (!scenes || scenes.length === 0) return;
    if (autoTriggeredRef.current) return;
    if (isReloadRef.current) return;
    if (credits && credits.remaining <= 0) return;
    try {
      const projectId = sessionStorage.getItem('currentProjectId');
      if (!projectId) return;
      const flagKey = `autoGenFirst:${projectId}`;
      if (sessionStorage.getItem(flagKey)) return;
      if (!scenes[0]?.imageDataUrl) {
        autoTriggeredRef.current = true;
        sessionStorage.setItem(flagKey, '1');
        setBlockingFirstPanel(true);
        (async () => {
          try {
            await handleGenerateScene(0);
          } finally {
            setBlockingFirstPanel(false);
          }
        })();
      }
    } catch {}
  }, [loading, scenes, credits]);

  // Load credits for UI guard via Supabase profile
  useEffect(() => {
    (async () => {
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('plan, month_start, monthly_base_limit, monthly_bonus_credits, monthly_used')
          .single();
        const plan = (prof as any)?.plan || 'free';
        const now = new Date();
        const start = (prof as any)?.month_start ? new Date(String((prof as any).month_start)) : null;
        const monthIsCurrent = !!start && start.getUTCFullYear() === now.getUTCFullYear() && start.getUTCMonth() === now.getUTCMonth();
        const base = Number.isFinite((prof as any)?.monthly_base_limit) ? Number((prof as any)?.monthly_base_limit) : (plan === 'pro' ? 500 : 50);
        const bonus = monthIsCurrent ? (Number((prof as any)?.monthly_bonus_credits) || 0) : 0;
        const used = monthIsCurrent ? (Number((prof as any)?.monthly_used) || 0) : 0;
        const limit = Math.max(0, base + bonus);
        const remaining = Math.max(0, limit - used);
        const resetsAt = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
        setCredits({ remaining, resetsAt });
      } catch {
        setCredits(null);
      }
    })();
  }, []);

  useEffect(() => {
    if (!scenes[selectedSceneIndex]) return;
    setChatMessages([
      { role: 'system', text: `You are currently editing Scene ${selectedSceneIndex + 1}` },
      { role: 'assistant', text: `Scene description: ${scenes[selectedSceneIndex].description}` },
    ]);
    // Auto-disable badges if no image for this scene
    if (!scenes[selectedSceneIndex]?.imageDataUrl) {
      setActiveBadge('none');
    }
  }, [selectedSceneIndex]);
  // Removed localStorage persistence for activeBadge

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
    // Badge modes bypass validation
    if (activeBadge === 'remove') {
      setChatMessages((prev) => [...prev, { role: 'user', text }]);
      setChatMessages((prev) => [...prev, { role: 'assistant', text: 'Removing background from the current scene...' }]);
      await handleRemoveBackground(selectedSceneIndex);
      return;
    } else if (activeBadge === 'edit') {
      setChatMessages((prev) => [...prev, { role: 'user', text }]);
      setChatMessages((prev) => [...prev, { role: 'assistant', text: 'Applying your edit to the current scene...' }]);
      await handleEditScene(selectedSceneIndex, text);
      return;
    }
    const { valid } = isValidSceneDescription(text);
    setChatMessages((prev) => [...prev, { role: 'user', text }]);
    if (!valid) {
      setChatMessages((prev) => [...prev, { role: 'assistant', text: 'Sorry, I am designed to help with only webtoon generation. Try modifying your prompt.' }]);
      return;
    }
    // Update the selected scene's description and regenerate
    setScenes(prev => prev.map((s, i) => i === selectedSceneIndex ? { ...s, description: text } : s));
    try {
      const projectId = sessionStorage.getItem('currentProjectId');
      if (projectId) {
        await fetch('/api/generated-scenes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, scene_no: selectedSceneIndex + 1, scene_description: text }) });
      }
    } catch {}
    setChatMessages((prev) => [...prev, { role: 'assistant', text: 'Updated the scene description. Regenerating the image...' }]);
    await handleGenerateScene(selectedSceneIndex, text);
  };

  const handleRemoveBackground = async (index: number) => {
    const scene = scenes[index];
    if (!scene?.imageDataUrl) return;
    setScenes(prev => prev.map((s, i) => i === index ? { ...s, isGenerating: true } : s));
    try {
      const projectId = sessionStorage.getItem('currentProjectId');
      const res = await fetch('/api/remove-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: scene.imageDataUrl, projectId: projectId || undefined, sceneNo: index + 1 }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to remove background');
      setScenes(prev => prev.map((s, i) => i === index ? { ...s, imageDataUrl: data.image, isGenerating: false } : s));
      setChatMessages(prev => [...prev, { role: 'assistant', text: 'Done' }]);
      // Optimistically decrement and notify header
      setCredits((prev) => prev ? { ...prev, remaining: Math.max(0, (prev.remaining || 0) - 1) } : prev);
      window.dispatchEvent(new Event('credits:refresh'));
    } catch (e) {
      console.error('remove background error', e);
      setScenes(prev => prev.map((s, i) => i === index ? { ...s, isGenerating: false } : s));
    }
  };

  const handleEditScene = async (index: number, instruction: string) => {
    const scene = scenes[index];
    if (!scene?.imageDataUrl) return;
    setScenes(prev => prev.map((s, i) => i === index ? { ...s, isGenerating: true } : s));
    try {
      const projectId = sessionStorage.getItem('currentProjectId');
      const res = await fetch('/api/edit-scene-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: scene.imageDataUrl, instruction, projectId: projectId || undefined, sceneNo: index + 1 }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to edit scene image');
      setScenes(prev => prev.map((s, i) => i === index ? { ...s, imageDataUrl: data.image, isGenerating: false } : s));
      setChatMessages(prev => [...prev, { role: 'assistant', text: 'Done' }]);
      // Optimistically decrement and notify header
      setCredits((prev) => prev ? { ...prev, remaining: Math.max(0, (prev.remaining || 0) - 1) } : prev);
      window.dispatchEvent(new Event('credits:refresh'));
    } catch (e) {
      console.error('edit scene error', e);
      setScenes(prev => prev.map((s, i) => i === index ? { ...s, isGenerating: false } : s));
    }
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
      <main className="mx-auto max-w-[1600px] px-4 py-8 lg:pr-[460px]">
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
              initialStyle={artStyle || "Webtoon comic"}
              onSave={async (style) => {
                setArtStyle(style);
                try {
                  const projectId = sessionStorage.getItem('currentProjectId');
                  if (!projectId) return;
                  const check = await fetch(`/api/art-style?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
                  const j = await check.json();
                  if (j?.artStyle) {
                    await fetch('/api/art-style', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, description: style }) });
                  } else {
                    await fetch('/api/art-style', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, description: style }) });
                  }
                  await fetch('/api/projects', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: projectId, art_style: style }) });
                } catch {}
              }}
            />
          </div>
        </div>
        <StepBar currentStep={4} className="mb-6" />

        {(loading || blockingFirstPanel) && (
          <div className="flex flex-col items-center mb-6">
            <div className="w-10 h-10 border-4 border-fuchsia-500/30 border-t-fuchsia-500 rounded-full animate-spin"></div>
            <div className="mt-3 text-sm text-white/80">{blockingFirstPanel ? 'Generating first panel…' : 'Generating scenes…'}</div>
          </div>
        )}
        {error && (
          <div className="text-red-400 mb-4">{error}</div>
        )}
        {!error && (
          <div className="flex gap-6">
            <div className="flex-1 space-y-6">
            {(((loading || blockingFirstPanel) && isFirstLoad) ? Array.from({ length: 4 }) : scenes).map((scene: any, i: number) => (
              <div key={scene?.id || `skeleton_${i}`} onClick={() => !loading && setSelectedSceneIndex(i)}>
              <Card className={`border-white/10 bg-white/5 backdrop-blur-sm ${loading ? '' : 'cursor-pointer'} ${!loading && selectedSceneIndex === i ? 'ring-2 ring-fuchsia-500/60' : ''}`}>
                <CardHeader>
                  <CardTitle className="text-white">Scene {i + 1}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {loading && isFirstLoad ? (
                    <>
                      <div className="h-5 w-32 bg-white/10 rounded animate-pulse" />
                      <div className="h-4 w-full bg-white/10 rounded animate-pulse" />
                      <div className="h-4 w-5/6 bg-white/10 rounded animate-pulse" />
                      <div className="mt-4 h-48 w-full bg-white/10 rounded animate-pulse" />
                    </>
                  ) : (
                    <>
                      <div>
                        <div className="text-xs uppercase text-white/60 mb-1">Scene Description</div>
                        <div className="text-white/90">{scene.description}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase text-white/60 mb-1">Story Text</div>
                        <div className="text-white/80">{scene.storyText}</div>
                      </div>
                      <div className="pt-2">
                        <div className="flex items-center gap-2">
                          <Button
                          className="bg-gradient-to-r from-fuchsia-500 to-indigo-400 text-white disabled:opacity-60 disabled:cursor-not-allowed"
                          disabled={scene.isGenerating || (credits && credits.remaining <= 0)}
                          title={credits && credits.remaining <= 0 && credits.resetsAt ? `Out of credits. Resets on ${new Date(credits.resetsAt).toLocaleDateString()}` : undefined}
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
                              {credits && credits.remaining <= 0 ? 'Out of credits' : 'Generate'}
                            </>
                          )}
                          </Button>
                          {scene.isGenerating && (
                            <div className={`inline-flex items-center gap-2 text-xs px-2 py-1 rounded-full ${scene.generationPhase === 'sfx' ? 'bg-gradient-to-r from-sky-400 to-blue-400 text-black' : 'bg-white/10 text-white'}`}>
                              <div className="h-3 w-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                              {scene.generationPhase === 'sfx' ? 'Adding Sound Effects' : 'Generating Image'}
                            </div>
                          )}
                        </div>
                        {credits && credits.remaining <= 0 && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-white/70">
                            <Info className="h-3.5 w-3.5" />
                            <span>Resets on {new Date(credits.resetsAt || '').toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                      {scene.imageDataUrl && (
                        <div className="mt-4 flex justify-center">
                          <img src={scene.imageDataUrl} alt={`Scene ${i + 1}`} className="max-w-[480px] w-full rounded-md border border-white/10" />
                        </div>
                      )}
                    </>
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
                <div className="shimmer-line ${scenes[selectedSceneIndex]?.isGenerating ? 'active' : ''}"></div>
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                  {chatMessages.map((m, idx) => (
                    <div key={idx} className={m.role === 'user' ? 'text-right' : 'text-left'}>
                      <div className={`inline-block text-sm px-3 py-2 rounded-lg ${m.role === 'user' ? 'bg-fuchsia-600 text-white' : 'bg-white/10 text-white'}`}>{m.text}</div>
                    </div>
                  ))}
                </div>
                <div className={`px-3 pt-3 pb-3 border-t border-white/10`}>
                  <div className="mb-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!scenes[selectedSceneIndex]?.imageDataUrl) return;
                        setActiveBadge((b) => (b === 'remove' ? 'none' : 'remove'));
                      }}
                      disabled={!scenes[selectedSceneIndex]?.imageDataUrl}
                      className={`text-xs rounded-full px-3 py-1 ${!scenes[selectedSceneIndex]?.imageDataUrl ? 'bg-white/5 text-white/40 cursor-not-allowed' : activeBadge === 'remove' ? 'bg-fuchsia-600 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                    >
                      {activeBadge === 'remove' ? 'Remove Background: On' : 'Remove Background'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!scenes[selectedSceneIndex]?.imageDataUrl) return;
                        setActiveBadge((b) => (b === 'edit' ? 'none' : 'edit'));
                      }}
                      disabled={!scenes[selectedSceneIndex]?.imageDataUrl}
                      className={`text-xs rounded-full px-3 py-1 ${!scenes[selectedSceneIndex]?.imageDataUrl ? 'bg-white/5 text-white/40 cursor-not-allowed' : activeBadge === 'edit' ? 'bg-fuchsia-600 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                    >
                      {activeBadge === 'edit' ? 'Edit: On' : 'Edit'}
                    </button>
                  </div>
                  <form onSubmit={handleSend} className="flex items-start" onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      handleSend(e);
                    }
                  }}>
                    <div className="relative flex-1">
                      <textarea
                        id="chat-input"
                        ref={chatInputRef}
                        name="chat"
                        rows={3}
                        value={chatDraft}
                        onChange={(e) => setChatDraft(e.target.value)}
                        placeholder="Describe your change..."
                        disabled={!!scenes[selectedSceneIndex]?.isGenerating}
                        className={`w-full bg-transparent rounded-md pl-3 pr-12 py-2 text-sm outline-none resize-none overflow-y-auto overflow-x-hidden min-h-[84px] max-h-[84px] whitespace-pre-wrap animated-border ${scenes[selectedSceneIndex]?.isGenerating ? 'active' : ''}`}
                      />
                      <button
                        type="submit"
                        aria-label="Send"
                        disabled={!!scenes[selectedSceneIndex]?.isGenerating}
                        className={`absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-gradient-to-r from-fuchsia-500 to-indigo-400 text-white flex items-center justify-center ${scenes[selectedSceneIndex]?.isGenerating ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90'}`}
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
          <div className="flex justify-center gap-3 mt-8">
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
                // Post to the new window when ready
                setTimeout(() => {
                  try { win?.postMessage({ type: 'webtoon-preview', images: blobUrls }, window.location.origin); } catch {}
                }, 300);
              }}
              disabled={!allImagesReady}
              className="px-8 bg-white text.black hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Preview Webtoon
            </Button>
            <Button
              onClick={async () => {
                if (!allImagesReady || isPublishing) return;
                setIsPublishing(true);
                try {
                  // Update project status to published first
                  try {
                    const projectId = sessionStorage.getItem('currentProjectId');
                    if (projectId) await fetch('/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }) });
                  } catch {}
                  const srcs = scenes.map(s => s.imageDataUrl).filter(Boolean) as string[];

                  // Convert all sources to same-origin blob URLs to avoid canvas tainting
                  const toBlobUrl = async (src: string): Promise<string> => {
                    const resp = await fetch(src);
                    const blob = await resp.blob();
                    return URL.createObjectURL(blob);
                  };
                  const blobUrls = await Promise.all(srcs.map(toBlobUrl));

                  // Load all images from blob URLs
                  const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = reject;
                    img.src = src;
                  });
                  const images = await Promise.all(blobUrls.map(loadImage));

                  // Layout params (match preview vibe): 24px vertical gap and 24px outer padding
                  const panelGap = 24; // px
                  const edgePadding = 24; // px

                  const canvasWidth = Math.max(...images.map(img => img.naturalWidth || img.width));
                  const totalHeight = images.reduce((sum, img, idx) => sum + (img.naturalHeight || img.height) + (idx > 0 ? panelGap : 0), 0) + edgePadding * 2;

                  const canvas = document.createElement('canvas');
                  canvas.width = canvasWidth + edgePadding * 2; // include side padding
                  canvas.height = totalHeight;
                  const ctx = canvas.getContext('2d');
                  if (!ctx) throw new Error('Failed to get canvas context');

                  // White background
                  ctx.fillStyle = '#ffffff';
                  ctx.fillRect(0, 0, canvas.width, canvas.height);

                  // Draw each panel centered horizontally
                  let y = edgePadding;
                  for (const img of images) {
                    const w = img.naturalWidth || img.width;
                    const h = img.naturalHeight || img.height;
                    const x = Math.floor((canvas.width - w) / 2);
                    ctx.drawImage(img, x, y, w, h);
                    y += h + panelGap;
                  }

                  // Export PNG and download
                  const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                  if (!blob) throw new Error('Failed to export image');
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'webtoon.png';
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                  // Cleanup blob URLs used for sources
                  blobUrls.forEach((u) => URL.revokeObjectURL(u));
                } catch (e) {
                  console.error('Publish webtoon failed', e);
                } finally {
                  setIsPublishing(false);
                }
              }}
              disabled={!allImagesReady || isPublishing}
              className="px-8 bg-gradient-to-r from-fuchsia-500 to-indigo-400 text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPublishing ? (
                <>
                  <div className="h-4 w-4 mr-2 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Publishing...
                </>
              ) : (
                'Publish Webtoon'
              )}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}


