"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import Header from "../dashboard/Header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Lightbulb } from "lucide-react";
import Link from "next/link";

export default function ImportStory() {
  const [storyText, setStoryText] = useState("");
  const router = useRouter();

  const handleProcessStory = () => {
    // TODO: Process the story
    console.log("Processing story:", storyText);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0b12] to-[#0f0f1a] text-white">
      <Header />
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
          <h1 className="text-3xl font-bold mb-2">Import Your Story</h1>
          <p className="text-white/70">Upload a document or paste your story text</p>
        </div>

        {/* Main Content */}
        <div className="space-y-8">
          {/* Story Input Card */}
          <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-xl text-white">Paste Your Story Text</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Textarea
                  placeholder="Paste your story here...

For example:
'Once upon a time in a magical kingdom, there lived a brave princess who discovered she had the power to speak with dragons...'

Include character descriptions, dialogue, and scene details - the more descriptive, the better we can visualize your story!"
                  value={storyText}
                  onChange={(e) => setStoryText(e.target.value)}
                  className="min-h-[300px] bg-white/5 border-white/10 text-white placeholder:text-white/50 resize-none"
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
