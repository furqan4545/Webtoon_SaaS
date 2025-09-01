"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "../dashboard/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, X, Wand2, Upload, Plus } from "lucide-react";
import Link from "next/link";
import { toast } from "@/hooks/use-toast";

interface Character {
  id: string;
  name: string;
  description: string;
}

export default function GenerateCharacters() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const loadCharacters = () => {
      try {
        const storedCharacters = sessionStorage.getItem('characters');
        if (storedCharacters) {
          const parsedCharacters = JSON.parse(storedCharacters);
          setCharacters(parsedCharacters);
        } else {
          toast.error("No characters found", {
            description: "Please go back and analyze your story first."
          });
          router.push("/import-story");
        }
      } catch (error) {
        console.error('Error loading characters:', error);
        toast.error("Error loading characters", {
          description: "Failed to load character data."
        });
        router.push("/import-story");
      } finally {
        setLoading(false);
      }
    };

    loadCharacters();
  }, [router]);

  const updateCharacterDescription = (id: string, description: string) => {
    setCharacters(prev => 
      prev.map(char => 
        char.id === id ? { ...char, description } : char
      )
    );
  };

  const removeCharacter = (id: string) => {
    setCharacters(prev => prev.filter(char => char.id !== id));
  };

  const addNewCharacter = () => {
    const newId = `character${Date.now()}`;
    setCharacters(prev => [...prev, {
      id: newId,
      name: `Character ${prev.length + 1}`,
      description: ""
    }]);
  };

  const handleContinue = () => {
    // Navigate to webtoon builder
    console.log("Characters:", characters);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0b0b12] to-[#0f0f1a] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-fuchsia-500/30 border-t-fuchsia-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white/70">Loading characters...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0b12] to-[#0f0f1a] text-white">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* Header Section */}
        <div className="mb-8">
          <Link
            href="/choose-art-style"
            className="inline-flex items-center gap-2 text-white/70 hover:text-white mb-4 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <h1 className="text-3xl font-bold mb-2">Generate your webtoon characters</h1>
          <p className="text-white/70">What do your characters look like?</p>
        </div>

        {/* Character Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {characters.map((character) => (
            <Card key={character.id} className="border-white/10 bg-white/5 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <CardTitle className="text-lg text-white">{character.name}</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeCharacter(character.id)}
                  className="text-white/60 hover:text-white hover:bg-white/10"
                >
                  <X className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">
                    Character Description
                  </label>
                  <Textarea
                    placeholder={character.id === "character4" ? "Describe the character's appearance, clothing, and key features..." : ""}
                    value={character.description}
                    onChange={(e) => updateCharacterDescription(character.id, e.target.value)}
                    className="h-24 bg-white/5 border-white/10 text-white placeholder:text-white/50 resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1 bg-gradient-to-r from-fuchsia-500 to-indigo-400 text-white hover:opacity-95">
                    <Wand2 className="h-4 w-4 mr-2" />
                    Generate Character
                  </Button>
                  <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Character
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Add Character Section */}
        <div className="text-center mb-8">
          <Button
            onClick={addNewCharacter}
            variant="outline"
            className="border-white/20 text-white hover:bg-white/10"
          >
            <Plus className="h-5 w-5 mr-2" />
            Add Character
          </Button>
          <p className="text-white/60 text-sm mt-2">
            Add a character that wasn't detected in your story
          </p>
        </div>

        {/* Continue Button */}
        <div className="flex justify-center">
          <Button
            onClick={handleContinue}
            className="px-8 bg-gradient-to-r from-fuchsia-500 to-indigo-400 text-white shadow-[0_8px_30px_rgba(168,85,247,0.35)] hover:opacity-95"
          >
            Go to Webtoon Builder →
          </Button>
        </div>
      </main>
    </div>
  );
}
