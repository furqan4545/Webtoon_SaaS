"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";

export default function AnalyzingStory() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // Guard to avoid double invocation in React Strict Mode (dev only)
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;
    const analyzeStory = async () => {
      try {
        const projectId = sessionStorage.getItem('currentProjectId');
        if (!projectId) {
          toast.error("No project selected", { description: "Please create or select a project first." });
          router.push("/dashboard");
          return;
        }

        // Load story from DB; art style can use pending value if available for faster start
        const res = await fetch(`/api/projects?id=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
        const json = await res.json();
        const story: string | undefined = json?.project?.story;
        let artStyle: string | undefined = undefined;
        try {
          artStyle = sessionStorage.getItem('pendingArtStyle') || undefined;
        } catch {}
        if (!artStyle) {
          artStyle = json?.project?.art_style || undefined;
        }

        if (!story) {
          toast.error("No story found", {
            description: "Please go back and enter your story."
          });
          router.push("/import-story");
          return;
        }

        const response = await fetch('/api/analyze-story', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ story, artStyle }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to analyze story');
        }

        if (data.success && data.characters) {
          const projectId = sessionStorage.getItem('currentProjectId');
          if (!projectId) {
            throw new Error('No project selected');
          }
          // Load art style from DB for this project (prefer art_styles table)
          let artStyle: string | undefined = undefined;
          try {
            const resStyle = await fetch(`/api/art-style?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
            const js = await resStyle.json();
            artStyle = (js?.artStyle?.description as string | undefined) || undefined;
            if (!artStyle) {
              const r2 = await fetch(`/api/projects?id=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
              const j2 = await r2.json();
              artStyle = (j2?.project?.art_style as string | undefined) || undefined;
            }
          } catch {}
          // Clear pending art style once processed
          try { sessionStorage.removeItem('pendingArtStyle'); } catch {}
          // Persist characters to DB (create-only)
          try {
            const list = Array.isArray(data.characters) ? data.characters : [];
            await Promise.all(list.map((c: any, idx: number) => {
              const name = (c?.name || c?.Name || `Character ${idx + 1}`) as string;
              const description = (c?.description || c?.Description || '') as string;
              return fetch('/api/characters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, name, description, artStyle })
              }).catch(() => {});
            }));
          } catch {}
          // Navigate to character generation page
          router.push("/generate-characters");
        } else {
          throw new Error('Invalid response from server');
        }

      } catch (error) {
        console.error('Error analyzing story:', error);
        setError(error instanceof Error ? error.message : 'Unknown error occurred');
        toast.error("Analysis failed", {
          description: "Failed to analyze your story. Please try again."
        });
        
        // Navigate back after error
        setTimeout(() => {
          router.push("/choose-art-style");
        }, 3000);
      }
    };

    analyzeStory();
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0b12] to-[#0f0f1a] text-white flex items-center justify-center">
      <div className="text-center max-w-md mx-auto px-6">
        {/* Loading Card */}
        <div className="border border-white/10 bg-white/5 backdrop-blur-sm rounded-2xl p-8">
          {/* Spinner + dotted animation */}
          <div className="mb-6 flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-fuchsia-500/30 border-t-fuchsia-500 rounded-full animate-spin"></div>
            <div className="flex gap-2" aria-hidden>
              <span className="inline-block h-2 w-2 rounded-full bg-white/60 animate-pulse [animation-delay:0ms]"></span>
              <span className="inline-block h-2 w-2 rounded-full bg-white/60 animate-pulse [animation-delay:150ms]"></span>
              <span className="inline-block h-2 w-2 rounded-full bg-white/60 animate-pulse [animation-delay:300ms]"></span>
            </div>
          </div>
          
          {/* Title */}
          <h1 className="text-2xl font-bold mb-4">
            {error ? "Analysis Failed" : "Analyzing Your Story with Webtoon AI"}
          </h1>
          
          {/* Description */}
          <p className="text-white/70">
            {error ? error : "Intelligently detecting characters and generating descriptions"}
            {!error && <span aria-hidden>…</span>}
          </p>
        </div>
      </div>
    </div>
  );
}
