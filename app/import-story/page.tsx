"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createClient as createBrowserSupabase } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Lightbulb } from "lucide-react";
import Link from "next/link";
import StepBar from "@/components/StepBar";

export default function ImportStory() {
  const [storyText, setStoryText] = useState("");
  const router = useRouter();
  const supabase = createBrowserSupabase();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedTextRef = useRef<string>("");
  const [uploading, setUploading] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);

  // Persist projectId from query param for freshly created first-time projects
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const pid = url.searchParams.get('projectId');
      if (pid) {
        sessionStorage.setItem('currentProjectId', pid);
      }
    } catch {}
  }, []);

  // Prefetch next route for snappy navigation
  useEffect(() => {
    try {
      // @ts-ignore
      router.prefetch && router.prefetch('/choose-art-style');
    } catch {}
  }, [router]);

  // Save step index (0) when this page is active
  useEffect(() => {
    (async () => {
      try {
        const projectId = sessionStorage.getItem('currentProjectId');
        if (!projectId) return;
        await fetch('/api/projects', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: projectId, steps: 0 }) });
      } catch {}
    })();
  }, []);

  // Load story from DB for the current project only
  useEffect(() => {
    const load = async () => {
      try {
        const projectId = sessionStorage.getItem('currentProjectId');
        if (!projectId) return;
        const res = await fetch(`/api/projects?id=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
        const json = await res.json();
        const story = json?.project?.story as string | undefined;
        if (story && typeof story === 'string') {
          setStoryText(story);
        } else {
          setStoryText("");
        }
      } catch {}
    };
    load();
  }, []);

  const handleProcessStory = () => {
    if (storyText.length < 100) return;
    // Navigate immediately; persist in background
    router.push("/choose-art-style");
    (async () => {
      try {
        const projectId = sessionStorage.getItem('currentProjectId');
        // Cancel any pending debounced save to avoid double-saving
        if (saveTimer.current) {
          clearTimeout(saveTimer.current);
          saveTimer.current = null;
        }
        // Only save if content changed since last successful save
        const needsSave = lastSavedTextRef.current !== storyText;
        if (projectId && needsSave) {
          await fetch('/api/projects', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: projectId, story: storyText }) });
          lastSavedTextRef.current = storyText;
        }
      } catch {}
    })();
  };

  // Debounced DB save for current project
  const handleChange = (value: string) => {
    setStoryText(value);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    // Skip scheduling a save if value hasn't changed from last saved content
    if (value === lastSavedTextRef.current) return;
    saveTimer.current = setTimeout(async () => {
      try {
        const projectId = sessionStorage.getItem('currentProjectId');
        if (projectId) {
          await fetch('/api/projects', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: projectId, story: value }) });
          lastSavedTextRef.current = value;
        }
      } catch {}
    }, 800);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0b12] to-[#0f0f1a] text-white">
      <main className="mx-auto max-w-4xl px-4 py-8">
        {/* Header Section */}
        <div className="mb-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-white/70 hover:text-white mb-4 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <h1 className="text-3xl font-bold mb-2">Bring Your Story</h1>
          <p className="text-white/70">Upload a document or paste your story text</p>
        </div>

        <StepBar currentStep={1} className="mb-6" />

        {/* Main Content */}
        <div className="space-y-8">
          {/* Story Input Card */}
          <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-white/70">Upload Word (.docx) or TXT to extract text</div>
                  <div className="flex items-center gap-3">
                    <input
                      ref={uploadRef}
                      type="file"
                      hidden
                      accept=".txt,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                      onChange={async (e) => {
                        const input = e.currentTarget as HTMLInputElement | null;
                        const f = input?.files?.[0];
                        if (!f) return;
                        setUploading(true);
                        setExtractError(null);
                        try {
                          const fd = new FormData();
                          fd.append('file', f);
                          const res = await fetch('/api/extract-text', { method: 'POST', body: fd });
                          const j = await res.json();
                          if (!res.ok) {
                            setExtractError(j?.error || 'Failed to extract text');
                          } else if (typeof j?.text === 'string') {
                            setStoryText(j.text);
                            handleChange(j.text);
                          }
                        } catch (err) {
                          setExtractError('Failed to extract text');
                        } finally {
                          setUploading(false);
                          if (input) input.value = '';
                        }
                      }}
                    />
                    <Button
                      type="button"
                      onClick={() => uploadRef.current?.click()}
                      className="bg-white text-black hover:opacity-90"
                      disabled={uploading}
                    >
                      {uploading ? 'Extracting…' : 'Upload File'}
                    </Button>
                  </div>
                </div>
                {extractError && <div className="text-xs text-red-400">{extractError}</div>}
                <Textarea
                  placeholder="Paste your story here...

For example:
'Once upon a time in a magical kingdom, there lived a brave princess who discovered she had the power to speak with dragons...'

Include character descriptions, dialogue, and scene details - the more descriptive, the better we can visualize your story!"
                  value={storyText}
                  onChange={(e) => handleChange(e.target.value)}
                  className="h-[400px] bg-white/5 border-white/10 text-white placeholder:text-white/50 resize-none overflow-y-auto"
                />
                <div className="flex justify-between items-center text-sm">
                  <span className="text-white/60">{storyText.length} characters</span>
                  <span className="text-white/60">Minimum 100 characters recommended</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 pt-4">
                <Button
                  variant="outline"
                  onClick={() => router.push("/dashboard")}
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  Back to Options
                </Button>
                <Button
                  onClick={handleProcessStory}
                  disabled={storyText.length < 100}
                  className="flex-1 bg-gradient-to-r from-fuchsia-500 to-indigo-400 text-white shadow-[0_8px_30px_rgba(168,85,247,0.35)] hover:opacity-95 disabled:opacity-50"
                >
                  Process Story →
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Pro Tips Section */}
          <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-white">
                <Lightbulb className="h-5 w-5 text-yellow-400" />
                Pro Tips for Better Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm text-white/80">
                <li className="flex items-start gap-2">
                  <span className="text-white/60">•</span>
                  Include detailed character descriptions (appearance, personality, clothing)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-white/60">•</span>
                  Describe settings and environments vividly
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-white/60">•</span>
                  Break your story into clear scenes or chapters
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-white/60">•</span>
                  Include dialogue and emotional beats
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-white/60">•</span>
                  Mention important props or objects in scenes
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
