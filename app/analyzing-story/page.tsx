"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AnalyzingStory() {
  const router = useRouter();

  useEffect(() => {
    // Simulate API call delay
    const timer = setTimeout(() => {
      // Navigate to character generation page after "analysis"
      router.push("/generate-characters");
    }, 3000); // 3 second delay

    return () => clearTimeout(timer);
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
          <h1 className="text-2xl font-bold mb-4">Analyzing Your Story with Webtoon AI</h1>
          
          {/* Description */}
          <p className="text-white/70">Intelligently detecting characters and generating descriptions...</p>
        </div>
      </div>
    </div>
  );
}
