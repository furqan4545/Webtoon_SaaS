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

        // Load story and style strictly from DB
        const res = await fetch(`/api/projects?id=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
        const json = await res.json();
        const story: string | undefined = json?.project?.story;
        const artStyle: string | undefined = json?.project?.art_style || undefined;

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
          // Store the generated characters
          sessionStorage.setItem('characters', JSON.stringify(data.characters));
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
          {/* Spinner */}
          <div className="mb-6 flex justify-center">
            <div className="w-12 h-12 border-4 border-fuchsia-500/30 border-t-fuchsia-500 rounded-full animate-spin"></div>
          </div>
          
          {/* Title */}
          <h1 className="text-2xl font-bold mb-4">
            {error ? "Analysis Failed" : "Analyzing Your Story with Webtoon AI"}
          </h1>
          
          {/* Description */}
          <p className="text-white/70">
            {error ? error : "Intelligently detecting characters and generating descriptions..."}
          </p>
        </div>
      </div>
    </div>
  );
}
