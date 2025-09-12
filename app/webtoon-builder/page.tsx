"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Wand2, ChevronLeft, Send } from "lucide-react";
import { Undo2, Redo2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import ChangeArtStyleDialog from "@/components/ChangeArtStyleDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient as createBrowserSupabase } from "@/utils/supabase/client";
import { Info } from "lucide-react";
import StepBar from "@/components/StepBar";


// ==== IndexedDB: Undo/Redo stacks (per project/panel) ====
type IdbStackRecord = {
  key: string;            // `${projectId}::${panelKey}`
  projectId: string;
  panelKey: string;
  images: string[];       // immutable Data URLs
  index: number;
  updatedAt: number;      // ms
  approxBytes: number;    // quick LRU/GC metric
};

const UNDO_DB = { NAME: 'webtoon_undo', STORE: 'stacks', VERSION: 1 };
const nowMs = () => Date.now();
const approxBytesOfDataUrls = (arr: string[]) => arr.reduce((sum, s) => sum + Math.floor((s?.length || 0) * 0.75), 0);

const openUndoDb = (): Promise<IDBDatabase | null> =>
  new Promise((resolve) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) return resolve(null);
    const req = indexedDB.open(UNDO_DB.NAME, UNDO_DB.VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(UNDO_DB.STORE)) {
        const store = db.createObjectStore(UNDO_DB.STORE, { keyPath: 'key' });
        store.createIndex('by_project', 'projectId', { unique: false });
        store.createIndex('by_updated', 'updatedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });

const txDone = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('IDB transaction aborted'));
    tx.onerror = () => reject(tx.error || new Error('IDB transaction error'));
  });

const idbPutStack = async (projectId: string, panelKey: string, images: string[], index: number) => {
  try {
    const db = await openUndoDb(); if (!db) return;
    const tx = db.transaction(UNDO_DB.STORE, 'readwrite');
    const store = tx.objectStore(UNDO_DB.STORE);
    const rec: IdbStackRecord = {
      key: `${projectId}::${panelKey}`,
      projectId,
      panelKey,
      images,
      index,
      updatedAt: nowMs(),
      approxBytes: approxBytesOfDataUrls(images),
    };
    store.put(rec);
    await txDone(tx);   // ⟵ wait for commit
    db.close();
  } catch {}
};

const idbGetStacksByProject = async (projectId: string): Promise<IdbStackRecord[]> => {
  try {
    const db = await openUndoDb(); if (!db) return [];
    const tx = db.transaction(UNDO_DB.STORE, 'readonly');
    const store = tx.objectStore(UNDO_DB.STORE);
    const idx = store.index('by_project');
    const req = idx.getAll(IDBKeyRange.only(projectId));
    const res: IdbStackRecord[] = await new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
    await txDone(tx);   // ⟵ ensure clean finish
    db.close();
    return res;
  } catch { return []; }
};

const idbDeleteProject = async (projectId: string) => {
  try {
    const db = await openUndoDb(); if (!db) return;
    const tx = db.transaction(UNDO_DB.STORE, 'readwrite');
    const store = tx.objectStore(UNDO_DB.STORE);
    const idx = store.index('by_project');
    const req = idx.getAllKeys(IDBKeyRange.only(projectId));
    const keys: IDBValidKey[] = await new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
    for (const k of keys) store.delete(k);
    await txDone(tx);   // ⟵ wait for deletes to commit
    db.close();
  } catch {}
};

const idbDeletePanel = async (projectId: string, panelKey: string) => {
  try {
    const db = await openUndoDb(); if (!db) return;
    const tx = db.transaction(UNDO_DB.STORE, 'readwrite');
    tx.objectStore(UNDO_DB.STORE).delete(`${projectId}::${panelKey}`);
    await txDone(tx);   // ⟵ wait for commit
    db.close();
  } catch {}
};

const idbClearAll = async () => {
  try {
    const db = await openUndoDb(); if (!db) return;
    const tx = db.transaction(UNDO_DB.STORE, 'readwrite');
    tx.objectStore(UNDO_DB.STORE).clear();
    await txDone(tx);   // ⟵ wait for commit
    db.close();
  } catch {}
};

// GC sweep across ALL projects (TTL + per-panel trim + global budget)
const idbGcSweep = async (opts?: { ttlMs?: number; maxPerPanel?: number; globalBudgetBytes?: number }) => {
  const ttlMs = opts?.ttlMs ?? 48 * 60 * 60 * 1000;
  const maxPerPanel = opts?.maxPerPanel ?? 10;
  const globalBudget = opts?.globalBudgetBytes ?? 150 * 1024 * 1024;

  try {
    const db = await openUndoDb(); if (!db) return;
    const tx = db.transaction(UNDO_DB.STORE, 'readwrite');
    const store = tx.objectStore(UNDO_DB.STORE);
    const req = store.getAll();
    const records: IdbStackRecord[] = await new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    let totalBytes = 0;
    const now = nowMs();

    for (const r of records) {
      if (now - r.updatedAt > ttlMs) {
        store.delete(r.key);
        continue;
      }
      if (r.images.length > maxPerPanel) {
        const keep = r.images.slice(-maxPerPanel);
        r.images = keep;
        r.index = Math.min(r.index, keep.length - 1);
        r.approxBytes = approxBytesOfDataUrls(keep);
        r.updatedAt = now;
        store.put(r);
      }
      totalBytes += r.approxBytes || approxBytesOfDataUrls(r.images);
    }

    if (totalBytes > globalBudget) {
      const aliveReq = store.getAll();
      const alive: IdbStackRecord[] = await new Promise((resolve) => {
        aliveReq.onsuccess = () => resolve(aliveReq.result || []);
        aliveReq.onerror = () => resolve([]);
      });
      alive.sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0));
      let bytes = alive.reduce((s, r) => s + (r.approxBytes || approxBytesOfDataUrls(r.images)), 0);
      for (const r of alive) {
        if (bytes <= globalBudget) break;
        store.delete(r.key);
        bytes -= (r.approxBytes || approxBytesOfDataUrls(r.images));
      }
    }

    await txDone(tx);   // ⟵ wait for all puts/deletes
    db.close();
  } catch {}
};




interface SceneItem {
  id: string;
  storyText: string;
  description: string;
  imageDataUrl?: string;
  isGenerating?: boolean;
  generationPhase?: 'image' | 'sfx' | null;
  sceneNo?: number;
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
  const [deletingSceneNos, setDeletingSceneNos] = useState<number[]>([]);
  const deleteQueueProcessingRef = useRef<boolean>(false); // legacy; not used with new approach
  const [savingSceneNos, setSavingSceneNos] = useState<string[]>([]);
  const [saveSuppressedByScene, setSaveSuppressedByScene] = useState<Record<string, boolean>>({});
  // Simple per-panel retry counter for image load hiccups
  const [imgRetryByPanel, setImgRetryByPanel] = useState<Record<string, number>>({});
  const [historyByScene, setHistoryByScene] = useState<Record<string, { images: string[]; index: number }>>({});


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
      setScenes(prev => prev.map((s, i) => {
        const parsed = Number(String(s.id || '').split('_')[1]);
        const sceneNo = Number.isFinite(s.sceneNo) ? Number(s.sceneNo) : (Number.isFinite(parsed) ? parsed : (i + 1));
        return { ...s, imageDataUrl: results[sceneNo] || s.imageDataUrl };
      }));
      try { await seedBaselinesFromCurrentScenes(); } catch {}
    } catch {}
  };

  const getProjectId = () => {
    try {
      if (typeof window === 'undefined') return '';
      return sessionStorage.getItem('currentProjectId') || '';
    } catch {
      return '';
    }
  };
  const getScenesCacheKey = (pid: string) => `scenes:${pid}`;
  const getDeletingFlagKey = (pid: string) => `deletingScenes:${pid}`;
  const getDeletingCountKey = (pid: string) => `deletingScenesCount:${pid}`;
  const getDeletingCount = (pid: string): number => {
    try { return Number(sessionStorage.getItem(getDeletingCountKey(pid)) || '0'); } catch { return 0; }
  };
  const setDeletingCount = (pid: string, n: number) => {
    try { sessionStorage.setItem(getDeletingCountKey(pid), String(Math.max(0, Math.floor(n)))); } catch {}
  };
  const incDeletingCount = (pid: string) => setDeletingCount(pid, getDeletingCount(pid) + 1);
  const decDeletingCount = (pid: string) => setDeletingCount(pid, Math.max(0, getDeletingCount(pid) - 1));
  
  // Push exactly one immutable image per action (SFX or base), seeded with the pre-action visible image
  // Push exactly one immutable image per action and persist to IDB (if projectId present)
  const pushFinalSnapshot = async (panelKey: string, finalSrc?: string, previousSrc?: string, projectId?: string) => {
    if (!finalSrc) return;

    const [finalSnap, prevSnap] = await Promise.all([toDataURL(finalSrc), toDataURL(previousSrc)]);
    if (!finalSnap) return;

    // Compute next state from current (no races in this UI path)
    const entry = historyByScene[panelKey] || { images: [], index: -1 };
    let images = entry.images.slice();
    let index = entry.index;

    if (index < images.length - 1) images = images.slice(0, index + 1);
    if (images.length === 0) {
      if (prevSnap && prevSnap !== finalSnap) { images = [prevSnap, finalSnap]; index = 1; }
      else { images = [finalSnap]; index = 0; }
    } else {
      if (images[images.length - 1] !== finalSnap) { images.push(finalSnap); index = images.length - 1; }
      else { index = images.length - 1; }
    }

    // Commit to memory
    setHistoryByScene(prev => ({ ...prev, [panelKey]: { images, index } }));
    setSaveSuppressedByScene(m => ({ ...m, [panelKey]: false }));

    // Persist to IDB (best effort)
    try {
      if (projectId) await idbPutStack(projectId, panelKey, images, index);
    } catch {}
  };

  const getSceneNoForIndex = (scene: any, index: number) => {
    const parsed = Number(String(scene?.id || '').split('_')[1]);
    return Number.isFinite(scene?.sceneNo) ? Number(scene.sceneNo) : (Number.isFinite(parsed) ? parsed : (index + 1));
  };

  // Stable panel key (prefer explicit .id like "scene_5"; fallback to index-based id)
  const getPanelKey = (scene: any, index: number): string => {
    const id = (scene && typeof scene.id === 'string' && scene.id.trim()) ? scene.id : `scene_${index + 1}`;
    return String(id);
  };

  // Return the snapshot the user is currently seeing for this panel
  const getCurrentSnapshotForPanel = (panelKey: string, scene: SceneItem | undefined): string | undefined => {
    const entry = historyByScene[panelKey];
    if (entry && entry.images?.length) {
      const idx = Math.max(0, Math.min(entry.index ?? 0, entry.images.length - 1));
      return entry.images[idx];
    }
    // fall back to what's on the scene (may be data URL or remote URL)
    return scene?.imageDataUrl || undefined;
  };

  // Immutable snapshot helpers for history (avoid remote URLs that get overwritten)
  // const isDataUrl = (s?: string) => !!s && /^data:image\//i.test(s);
  const isDataUrl = (s?: string) => !!s && /^data:image\//i.test(s || '');

  const toDataURL = async (src?: string): Promise<string | undefined> => {
    if (!src) return undefined;
    if (isDataUrl(src)) return src; // already immutable
    try {
      const resp = await fetch(src);
      const blob = await resp.blob();
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      return dataUrl;
    } catch {
      // Fallback to original (may still be mutable, but best effort)
      return src;
    }
  };

  // Seed [baseline] snapshots for any panels that currently display an image
  // but have no history yet (index < 0 or no images). Persists to IDB (best effort).
  const seedBaselinesFromCurrentScenes = async () => {
    try {
      if (!scenes || scenes.length === 0) return;
      const pid = sessionStorage.getItem('currentProjectId') || '';

      // Build updates in one pass (convert to immutable Data URLs)
      const updates: Record<string, { images: string[]; index: number }> = {};
      for (let i = 0; i < scenes.length; i++) {
        const s = scenes[i];
        const k = getPanelKey(s, i);
        const entry = historyByScene[k];

        // Already has a history baseline? skip.
        if (entry && entry.images?.length) continue;

        // Need an image present on the scene to seed.
        if (!s?.imageDataUrl) continue;

        // Convert to data URL for immutability
        const snap = await toDataURL(s.imageDataUrl);
        if (!snap) continue;

        updates[k] = { images: [snap], index: 0 };
      }

      if (Object.keys(updates).length === 0) return;

      // Commit to memory
      setHistoryByScene(prev => ({ ...prev, ...updates }));

      // Persist to IDB (best effort)
      if (pid) {
        for (const [k, v] of Object.entries(updates)) {
          try { await idbPutStack(pid, k, v.images, v.index); } catch {}
        }
      }
    } catch {}
  };

  // Initialize empty stacks once we know how many scenes exist
  const initializeHistoryForScenes = (items: SceneItem[]) => {
    const map: Record<string, { images: string[]; index: number }> = {};
    items.forEach((s, idx) => { map[getPanelKey(s, idx)] = { images: [], index: -1 }; });
    setHistoryByScene(map);
    setSaveSuppressedByScene({});  // reset save suppression on fresh load
    setSavingSceneNos([]);         // clear any saving flags
  };

  // Remove stack for a particular panel (used when deleting a panel)
  const removeHistoryForPanel = (panelKey: string) => {
    setHistoryByScene(prev => {
      const { [panelKey]: _, ...rest } = prev;
      return rest;
    });
    setSaveSuppressedByScene(prev => {
      const { [panelKey]: _, ...rest } = prev;
      return rest;
    });
    setSavingSceneNos(prev => prev.filter(k => k !== panelKey));
  };
  // In-memory undo/redo stacks are maintained in historyByScene
  const refreshScenesFromDb = async (pid: string) => {
    const r = await fetch(`/api/generated-scenes?projectId=${encodeURIComponent(pid)}`, { cache: 'no-store' });
    const j = await r.json();
    const existingScenes = Array.isArray(j.scenes) ? j.scenes : [];
    const items: SceneItem[] = existingScenes.map((s: any) => ({ id: `scene_${s.scene_no}`, storyText: s.story_text || '', description: s.scene_description || '', sceneNo: Number(s.scene_no) }));
    try { localStorage.setItem(getScenesCacheKey(pid), JSON.stringify(items)); } catch {}
    return items;
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
    // Mark UI generating phase
    setScenes(prev => prev.map((s, i) => i === index ? { ...s, isGenerating: true, generationPhase: 'image' } : s));
  
    // Capture “before” image ONCE (the currently visible image BEFORE generating)
    const panelKey = getPanelKey(scenes[index], index);
    const beforeImage = getCurrentSnapshotForPanel(panelKey, scenes[index]);
  
    try {
      const projectId = typeof window === 'undefined' ? null : sessionStorage.getItem('currentProjectId');
      const characterImages: Array<{ name: string; dataUrl: string }> = pickSafeRefsForPayload(refImages);
  
      // 1) Base image
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
  
      // Show the base image immediately (intermediate display only)
      setScenes(prev => prev.map((s, i) => i === index ? { ...s, imageDataUrl: data.image } : s));
  
      // 2) SFX pass (try once)
      let finalImage = data.image;
      let usedCalls = 1;
      try {
        setScenes(prev => prev.map((s, i) => i === index ? { ...s, generationPhase: 'sfx' } : s));
        const res2 = await fetch('/api/add-image-soundEffects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageDataUrl: data.image,
            instruction: 'add webtoon style sound effects based on the whats going on in the scene. Only use English sound effects. Make sure to add not more than 1 sound effect, if the scene is not silent. If the scene is silent, do not add any sound effects.',
            projectId: projectId || undefined,
            sceneNo: index + 1,
          })
        });
        const data2 = await res2.json();
        if (res2.ok && data2?.success && data2?.image) {
          finalImage = data2.image;
          usedCalls = 2;
          // Replace visible image with SFX final
          setScenes(prev => prev.map((s, i) => i === index ? { ...s, imageDataUrl: finalImage } : s));
        }
      } catch (err) {
        // If SFX fails, we simply keep the base image
        console.error('add-image-soundEffects failed', err);
      }
  
      // Push EXACTLY ONE image to the panel's stack:
      // - SFX image if available
      // - otherwise the base image
      // await pushFinalSnapshot(panelKey, finalImage, beforeImage);
      await pushFinalSnapshot(panelKey, finalImage, beforeImage, projectId || undefined);

  
      // Wrap up UI state and credits
      setScenes(prev => prev.map((s, i) => i === index ? { ...s, isGenerating: false, generationPhase: null } : s));
      setChatMessages(prev => [...prev, { role: 'assistant', text: 'Done' }]);
      setCredits((prev) => prev ? { ...prev, remaining: Math.max(0, (prev.remaining || 0) - usedCalls) } : prev);
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
      setHistoryByScene(prev => ({
        ...prev,
        [getPanelKey(newScene, index + 1)]: { images: [], index: -1 }
      }));
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
          if (typeof window !== 'undefined') {
            const nav: any = (performance.getEntriesByType('navigation') as any)[0];
            isReloadRef.current = nav?.type === 'reload';
          }
        } catch {}
        const projectId = typeof window === 'undefined' ? null : sessionStorage.getItem('currentProjectId');
        if (!projectId) {
          setError('No project selected.');
          setLoading(false);
          return;
        }

        // If there are pending deletes from a previous navigation/refresh, process them first and block UI
        // Clean up any legacy flags from previous logic
        try { if (typeof window !== 'undefined') sessionStorage.removeItem(getDeletingFlagKey(projectId)); } catch {}
        // In-memory history resets naturally on reload

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
          try { return typeof window === 'undefined' ? null : (JSON.parse(localStorage.getItem(cacheKeyScenes) || 'null') as SceneItem[] | null); } catch { return null; }
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
          const items: SceneItem[] = existingScenes.map((s: any) => ({ id: `scene_${s.scene_no}`, storyText: s.story_text || '', description: s.scene_description || '', sceneNo: Number(s.scene_no) }));
          setScenes(items);
          setSelectedSceneIndex(0);
          try { localStorage.setItem(cacheKeyScenes, JSON.stringify(items)); } catch {}
          setChatMessages([
            { role: 'system', text: 'You are currently editing Scene 1' },
            { role: 'assistant', text: `Scene description: ${items[0]?.description || ''}` },
          ]);
          // Initialize empty undo/redo stacks per panel now that we know how many scenes exist
          initializeHistoryForScenes(items);
          // Restore panel stacks for this project from IndexedDB (if any)
          try {
            const projectId = sessionStorage.getItem('currentProjectId') || '';
            if (projectId) {
              const recs = await idbGetStacksByProject(projectId);
              if (recs.length > 0) {
                // Merge into in-memory history + update visible snapshot
                setHistoryByScene(prev => {
                  const next = { ...prev };
                  for (const r of recs) {
                    next[r.panelKey] = { images: r.images || [], index: Math.max(0, Math.min(r.index ?? 0, (r.images?.length || 1) - 1)) };
                  }
                  return next;
                });
                setScenes(prev => prev.map((s, i) => {
                  const key = getPanelKey(s, i);
                  const rec = recs.find(rr => rr.panelKey === key);
                  if (!rec || !rec.images?.length) return s;
                  const snap = rec.images[Math.max(0, Math.min(rec.index ?? 0, rec.images.length - 1))];
                  return { ...s, imageDataUrl: snap || s.imageDataUrl };
                }));
              }
            }
          } catch {}

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
            sceneNo: idx + 1,
          }));
          setScenes(items);
          setSelectedSceneIndex(0);
          setChatMessages([
            { role: 'system', text: 'You are currently editing Scene 1' },
            { role: 'assistant', text: `Scene description: ${items[0]?.description || ''}` },
          ]);
          // Initialize empty stacks once scenes are generated
          initializeHistoryForScenes(items);
          // Restore panel stacks for this project from IndexedDB (if any)
          try {
            const projectId = sessionStorage.getItem('currentProjectId') || '';
            if (projectId) {
              const recs = await idbGetStacksByProject(projectId);
              if (recs.length > 0) {
                // Merge into in-memory history + update visible snapshot
                setHistoryByScene(prev => {
                  const next = { ...prev };
                  for (const r of recs) {
                    next[r.panelKey] = { images: r.images || [], index: Math.max(0, Math.min(r.index ?? 0, (r.images?.length || 1) - 1)) };
                  }
                  return next;
                });
                setScenes(prev => prev.map((s, i) => {
                  const key = getPanelKey(s, i);
                  const rec = recs.find(rr => rr.panelKey === key);
                  if (!rec || !rec.images?.length) return s;
                  const snap = rec.images[Math.max(0, Math.min(rec.index ?? 0, rec.images.length - 1))];
                  return { ...s, imageDataUrl: snap || s.imageDataUrl };
                }));
              }
            }
          } catch {}
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


  // Whenever panels get/replace images and the corresponding history is empty, seed [baseline]
  useEffect(() => {
    if (!scenes || scenes.length === 0) return;

    // Build a light-weight signature of what images are currently shown
    const sig = scenes.map((s, i) => `${getPanelKey(s, i)}::${s?.imageDataUrl || ''}`).join('|');

    (async () => {
      try { await seedBaselinesFromCurrentScenes(); } catch {}
    })();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes.map(s => s?.imageDataUrl || '').join('|')]);

  // Auto-generate first scene image only on first navigation (not on reload), once per project per session
  useEffect(() => {
    if (loading) return;
    if (!scenes || scenes.length === 0) return;
    if (autoTriggeredRef.current) return;
    if (isReloadRef.current) return;
    if (credits && credits.remaining <= 0) return;
    try {
      const projectId = typeof window === 'undefined' ? null : sessionStorage.getItem('currentProjectId');
      if (!projectId) return;
      const flagKey = `autoGenFirst:${projectId}`;
      if (typeof window !== 'undefined' && sessionStorage.getItem(flagKey)) return;
      if (!scenes[0]?.imageDataUrl) {
        autoTriggeredRef.current = true;
        if (typeof window !== 'undefined') sessionStorage.setItem(flagKey, '1');
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
    // Block obvious greetings/small-talk and acknowledgements
    const smallTalk = ['how are you', 'what\'s up', 'whats up', 'hello', 'hi', 'hey', 'ok', 'okay', 'thanks', 'thank you'];
    if (smallTalk.some(p => t === p || t.startsWith(p + ' '))) return { valid: false, reason: 'smalltalk' };
    // Block questions aimed at the assistant (e.g., where are you?, who are you?)
    if (t.includes('?') && /\byou\b/.test(t)) return { valid: false, reason: 'assistant-question' };
    if (/\b(who|where|what|why|how)\s+are\s+you\b/.test(t)) return { valid: false, reason: 'assistant-question' };
    // Block profanity
    const profanity = ['fuck','fucking','shit','bitch','asshole','bastard','idiot'];
    if (profanity.some(w => new RegExp(`(^|\n|\b)${w}(\b|\W)`).test(t))) return { valid: false, reason: 'profanity' };
    // Allow most directives and descriptions; accept if 3+ words or >= 12 chars
    const wordCount = t.split(/\s+/).filter(Boolean).length;
    if (wordCount >= 3 || t.length >= 12) return { valid: true };
    return { valid: false, reason: 'too-short' };
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
      const projectId = typeof window === 'undefined' ? null : sessionStorage.getItem('currentProjectId');
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
  
    const panelKey = getPanelKey(scene, index);
    const beforeImage = getCurrentSnapshotForPanel(panelKey, scene);

  
    try {
      const projectId = typeof window === 'undefined' ? null : sessionStorage.getItem('currentProjectId');
  
      const res = await fetch('/api/remove-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: scene.imageDataUrl, projectId: projectId || undefined, sceneNo: index + 1 }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to remove background');
  
      // Show latest
      setScenes(prev => prev.map((s, i) => i === index ? { ...s, imageDataUrl: data.image, isGenerating: false } : s));
  
      // Push immutable snapshot for undo/redo
      // await pushFinalSnapshot(panelKey, data.image, beforeImage);
      await pushFinalSnapshot(panelKey, data.image, beforeImage, projectId || undefined);

  
      setChatMessages(prev => [...prev, { role: 'assistant', text: 'Done' }]);
      setCredits(prev => prev ? { ...prev, remaining: Math.max(0, (prev.remaining || 0) - 1) } : prev);
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
  
    const panelKey = getPanelKey(scene, index);
    const beforeImage = getCurrentSnapshotForPanel(panelKey, scene);
  
    try {
      const projectId = typeof window === 'undefined' ? null : sessionStorage.getItem('currentProjectId');
  
      const res = await fetch('/api/edit-scene-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: scene.imageDataUrl, instruction, projectId: projectId || undefined, sceneNo: index + 1 }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to edit scene image');
  
      // Show latest
      setScenes(prev => prev.map((s, i) => i === index ? { ...s, imageDataUrl: data.image, isGenerating: false } : s));
  
      // Push immutable snapshot for undo/redo
      // await pushFinalSnapshot(panelKey, data.image, beforeImage);
      await pushFinalSnapshot(panelKey, data.image, beforeImage, projectId || undefined);

      setChatMessages(prev => [...prev, { role: 'assistant', text: 'Done' }]);
      setCredits(prev => prev ? { ...prev, remaining: Math.max(0, (prev.remaining || 0) - 1) } : prev);
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

  const handleUndo = (index: number) => {
    const scene = scenes[index];
    if (!scene) return;
    const key = getPanelKey(scene, index);
    const entry = historyByScene[key];
    if (!entry) return;
  
    const { images, index: cur } = entry;
    if (cur <= 0) return;
  
    const newIndex = cur - 1;
    const newImg = images[newIndex];
    if (!newImg) return;
  
    setHistoryByScene(m => ({ ...m, [key]: { images, index: newIndex } }));
    setScenes(prev => prev.map((s, i) => i === index ? { ...s, imageDataUrl: newImg } : s));
    setSaveSuppressedByScene(m => ({ ...m, [key]: false }));
  
    // Persist the known newIndex and images (not the stale state)
    try {
      const projectId = sessionStorage.getItem('currentProjectId') || '';
      if (projectId) { idbPutStack(projectId, key, images, newIndex); }
    } catch {}
  };

  const handleRedo = (index: number) => {
    const scene = scenes[index];
    if (!scene) return;
    const key = getPanelKey(scene, index);
    const entry = historyByScene[key];
    if (!entry) return;
  
    const { images, index: cur } = entry;
    if (cur >= images.length - 1) return;
  
    const newIndex = cur + 1;
    const newImg = images[newIndex];
    if (!newImg) return;
  
    setHistoryByScene(m => ({ ...m, [key]: { images, index: newIndex } }));
    setScenes(prev => prev.map((s, i) => i === index ? { ...s, imageDataUrl: newImg } : s));
  
    try {
      const projectId = sessionStorage.getItem('currentProjectId') || '';
      if (projectId) { idbPutStack(projectId, key, images, newIndex); }
    } catch {}
  };
  

  const handleSaveCurrentImageToSupabase = async (index: number) => {
    try {
      const projectId = sessionStorage.getItem('currentProjectId');
      if (!projectId) return;
      const scene = scenes[index];
      const panelKey = getPanelKey(scene, index);
      const sceneNo = getSceneNoForIndex(scene, index);
      const img = scene?.imageDataUrl;
      if (!img) return;
  
      setSavingSceneNos(prev => prev.includes(panelKey) ? prev : [...prev, panelKey]);
  
      const res = await fetch('/api/save-scene-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, sceneNo, imageDataUrl: img })
      });
      await res.json().catch(() => ({}));
    } catch {}
    finally {
      const scene = scenes[index];
      const panelKey = getPanelKey(scene, index);
      setSavingSceneNos(prev => prev.filter(k => k !== panelKey));
      // After a successful save, suppress Save until next undo
      setSaveSuppressedByScene(m => ({ ...m, [panelKey]: true }));
    }
  };

  const handleSend = (e: any) => {
    e.preventDefault();
    const value = chatDraft.trim();
    if (!value) return;
    processUserText(value);
    setChatDraft('');
  };

  useEffect(() => {
    const projectId = sessionStorage.getItem('currentProjectId') || '';
    return () => {
      if (projectId) { idbDeleteProject(projectId); } // best-effort
    };
  }, []);

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
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-white">Scene {i + 1}</CardTitle>
                  <div className="flex items-center gap-2">
                  {(() => {
                      const panelKey = getPanelKey(scene, i);
                      const entry = historyByScene[panelKey];
                      const canU = !!entry && entry.index > 0;
                      const canR = !!entry && !!entry.images && entry.index < entry.images.length - 1;
                      const showSave = canU && !saveSuppressedByScene[panelKey];
                      const isSaving = savingSceneNos.includes(panelKey);
                      return (
                        <>
                          {showSave && (
                            <button
                              aria-label="Save image to Supabase"
                              className={`text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded px-2 py-0.5 text-sm ${isSaving ? 'opacity-60 cursor-not-allowed' : ''}`}
                              onClick={(e) => { e.stopPropagation(); if (!isSaving) handleSaveCurrentImageToSupabase(i); }}
                              disabled={isSaving}
                            >
                              {isSaving ? (
                                <div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}
                            </button>
                          )}
                          {canU && (
                            <button
                              aria-label="Undo"
                              className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded px-2 py-0.5 text-sm"
                              onClick={(e) => { e.stopPropagation(); handleUndo(i); }}
                            >
                              <Undo2 className="h-4 w-4" />
                            </button>
                          )}
                          {canR && (
                            <button
                              aria-label="Redo"
                              className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded px-2 py-0.5 text-sm"
                              onClick={(e) => { e.stopPropagation(); handleRedo(i); }}
                            >
                              <Redo2 className="h-4 w-4" />
                            </button>
                          )}
                        </>
                      );
                      })()}
                    <button
                    aria-label="Delete scene"
                    className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded px-2 py-0.5 text-sm"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const projectId = sessionStorage.getItem('currentProjectId');
                      if (!projectId) return;
                    
                      const panelKey = getPanelKey(scene, i);
                      // Drop local history for this panel immediately
                      removeHistoryForPanel(panelKey);

                      try {
                        const projectId = sessionStorage.getItem('currentProjectId') || '';
                        if (projectId) await idbDeletePanel(projectId, panelKey);
                      } catch {}
                    
                      const parsed = Number(String(scene?.id || '').split('_')[1]);
                      const sceneNo = Number.isFinite(scene?.sceneNo) ? Number(scene.sceneNo) : (Number.isFinite(parsed) ? parsed : (i + 1));
                    
                      setDeletingSceneNos(prev => prev.includes(sceneNo) ? prev : [...prev, sceneNo]);
                      (async () => {
                        try {
                          const res = await fetch('/api/delete-scene', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, sceneNo }) });
                          if (!res.ok) throw new Error('delete failed');
                          // Remove panel locally now
                          setScenes(prev => prev.filter((_, idx) => idx !== i));
                          // Refresh authoritative scenes and update cache + reinit stacks
                          try {
                            const items = await refreshScenesFromDb(projectId);
                            try { localStorage.setItem(getScenesCacheKey(projectId), JSON.stringify(items)); } catch {}
                            initializeHistoryForScenes(items);
                          } catch {}
                        } catch (err) {
                          // If failed, you could restore history here if you want
                        } finally {
                          setDeletingSceneNos(prev => prev.filter(n => n !== sceneNo));
                        }
                      })();
                    }}
                  >
                    ×
                  </button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 relative">
                  {(() => {
                    const parsed = Number(String(scene?.id || '').split('_')[1]);
                    const sceneNo = Number.isFinite(scene?.sceneNo) ? Number(scene.sceneNo) : (Number.isFinite(parsed) ? parsed : (i + 1));
                    if (!deletingSceneNos.includes(sceneNo)) return null;
                    return (
                      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-black/50">
                        <div className="flex items-center gap-2 text-white/90 text-sm">
                          <div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          Deleting…
                        </div>
                      </div>
                    );
                  })()}
                  {(loading || blockingFirstPanel) && isFirstLoad ? (
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
                        {(() => {
                          const panelKey = getPanelKey(scene, i);
                          const retry = imgRetryByPanel[panelKey] || 0;

                          // If it's a remote URL, add a tiny cache-buster tied to retry count.
                          // If it's a data URL, use it as-is.
                          const base = scene.imageDataUrl || '';
                          const src = !isDataUrl(base)
                            ? `${base}${base.includes('?') ? '&' : '?'}cb=${retry}`
                            : base;

                          return scene.imageDataUrl ? (
                            <div className="mt-4 flex flex-col items-center">
                              <img
                                key={`img-${panelKey}-${retry}`}         // remounts on retry
                                src={src}
                                alt={`Scene ${i + 1}`}
                                decoding="async"
                                loading="eager"
                                onLoad={() => {
                                  // Reset retry counter on success (optional)
                                  if (retry) {
                                    setImgRetryByPanel(prev => ({ ...prev, [panelKey]: 0 }));
                                  }
                                }}
                                onError={() => {
                                  // Bump retry up to 2 automatic attempts. After that, show a small manual refresh chip.
                                  setImgRetryByPanel(prev => {
                                    const n = (prev[panelKey] || 0);
                                    if (n >= 2) return prev;  // stop auto-retrying
                                    return { ...prev, [panelKey]: n + 1 };
                                  });
                                }}
                                className="max-w-[480px] w-full rounded-md border border-white/10"
                              />

                              {(retry >= 2 && !isDataUrl(base)) && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setImgRetryByPanel(prev => ({ ...prev, [panelKey]: (prev[panelKey] || 0) + 1 }))
                                  }
                                  className="mt-2 text-xs bg-white/10 hover:bg-white/20 rounded-full px-3 py-1"
                                  title="Retry loading image"
                                >
                                  Refresh image
                                </button>
                              )}
                            </div>
                          ) : null;
                        })()}
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
              onClick={() => {
                // Navigate in the same tab
                router.push('/webtoon-builder/edit-panels');
              }}
              className="px-8 bg-white/10 text-white hover:bg-white/20"
            >
              Edit Panels Layout
            </Button>
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
                // Handshake: wait for preview to announce readiness, then send images
                const onReady = (e: MessageEvent) => {
                  try {
                    if (e.origin !== window.location.origin) return;
                    if (e.data?.type === 'preview-ready') {
                      (win as Window | null)?.postMessage({ type: 'webtoon-preview', images: blobUrls }, window.location.origin);
                      window.removeEventListener('message', onReady as any);
                    }
                  } catch {}
                };
                window.addEventListener('message', onReady as any);
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
                  try {
                    const projectId = sessionStorage.getItem('currentProjectId') || '';
                    if (projectId) await idbDeleteProject(projectId);
                  } catch {}
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


