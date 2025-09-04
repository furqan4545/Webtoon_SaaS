"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "../dashboard/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, X, Wand2, Upload, Plus, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import { toast } from "@/hooks/use-toast";

interface Character {
  id: string;
  name: string;
  description: string;
  artStyle?: string;
  imageDataUrl?: string;
  isGenerating?: boolean;
  hasGenerated?: boolean;
}

export default function GenerateCharacters() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const projectId = typeof window !== 'undefined' ? sessionStorage.getItem('currentProjectId') || undefined : undefined;

  const persistCharacter = (c: Character) => {
    if (!projectId) return;
    const name = c.name || 'Character';
    const body: any = { projectId, name };
    if (c.description !== undefined) body.description = c.description;
    if (c.artStyle !== undefined) body.artStyle = c.artStyle;
    fetch('/api/characters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
  };

  useEffect(() => {
    const loadCharacters = () => {
      try {
        const storedCharacters = sessionStorage.getItem('characters');
        if (storedCharacters) {
          const parsedCharacters = JSON.parse(storedCharacters);
          setCharacters(parsedCharacters);
          try {
            (parsedCharacters as Character[]).forEach((c) => {
              if ((c.description && c.description.trim()) || (c.artStyle && c.artStyle.trim())) {
                persistCharacter(c);
              }
            });
          } catch {}
        } else {
          const projectId = sessionStorage.getItem('currentProjectId');
          if (projectId) {
            fetch(`/api/characters?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' })
              .then(r => r.json())
              .then((j) => {
                if (Array.isArray(j.characters) && j.characters.length > 0) {
                  const mapped = j.characters.map((c: any, idx: number) => ({ id: c.id || `character${idx+1}`, name: c.name || `Character ${idx+1}`, description: c.description || '', artStyle: c.art_style || '', imageDataUrl: undefined }));
                  setCharacters(mapped);
                  sessionStorage.setItem('characters', JSON.stringify(mapped));
                } else {
                  toast.error("No characters found", { description: "Please go back and analyze your story first." });
                  router.push("/import-story");
                }
              })
              .catch(() => {
                toast.error("No characters found", { description: "Please go back and analyze your story first." });
                router.push("/import-story");
              });
          } else {
            toast.error("No characters found", { description: "Please go back and analyze your story first." });
            router.push("/import-story");
          }
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
    try {
      const updated = characters.map(c => c.id === id ? { ...c, description } : c);
      sessionStorage.setItem('characters', JSON.stringify(updated));
    } catch {}
    const current = characters.find(c => c.id === id);
    persistCharacter({ ...(current as Character), description });
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

  const generateImage = async (id: string) => {
    const character = characters.find((c) => c.id === id);
    if (!character) return;
    try {
      // mark generating and disable upload
      setCharacters(prev => prev.map(c => c.id === id ? { ...c, isGenerating: true } : c));
      const res = await fetch('/api/generate-character-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: character.name, description: character.description, artStyle: character.artStyle, projectId: sessionStorage.getItem('currentProjectId') || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to generate image');
      }
      setCharacters(prev => prev.map(c => c.id === id ? { ...c, imageDataUrl: data.image, isGenerating: false, hasGenerated: true } : c));
      try {
        const updated = characters.map(c => c.id === id ? { ...c, imageDataUrl: data.image, isGenerating: false, hasGenerated: true } : c);
        sessionStorage.setItem('characters', JSON.stringify(updated));
      } catch {}
      if (data?.path) {
        const projectId = sessionStorage.getItem('currentProjectId');
        const current = characters.find(c => c.id === id);
        const name = current?.name || 'Character';
        fetch('/api/characters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, name, imagePath: data.path }) }).catch(() => {});
      }
    } catch (err) {
      console.error('Image generation error:', err);
      toast.error('Image generation failed', { description: err instanceof Error ? err.message : 'Unknown error' });
      setCharacters(prev => prev.map(c => c.id === id ? { ...c, isGenerating: false } : c));
    }
  };

  const handleUploadFile = (id: string, file: File | null) => {
    if (!file) return;
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Unsupported file format", { description: "Please upload a PNG or JPEG image." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      setCharacters(prev => prev.map(c => c.id === id ? { ...c, imageDataUrl: dataUrl, hasGenerated: true, isGenerating: false } : c));
      try {
        const updated = characters.map(c => c.id === id ? { ...c, imageDataUrl: dataUrl, hasGenerated: true, isGenerating: false } : c);
        sessionStorage.setItem('characters', JSON.stringify(updated));
      } catch {}
    };
    reader.readAsDataURL(file);
  };

  const allImagesReady = characters.length > 0 && characters.every(c => !!c.imageDataUrl);

  const handleContinue = () => {
    if (!allImagesReady) return;
    // Persist for builder if needed later
    sessionStorage.setItem('characters', JSON.stringify(characters));
    window.location.href = '/webtoon-builder';
  };

  // read artStyle from session storage to prefill per character
  useEffect(() => {
    try {
      const art = sessionStorage.getItem('artStyle') || '';
      if (art) {
        setCharacters(prev => prev.map(c => ({ ...c, artStyle: c.artStyle || art })));
      }
    } catch {}
  }, []);

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
                <details className="bg-white/5 border border-white/10 rounded-md">
                  <summary className="cursor-pointer select-none px-3 py-2 text-sm text-white/80 flex items-center justify-between">
                    Art Style
                    <span className="ml-2 text-white/50">(click to edit)</span>
                  </summary>
                  <div className="p-3 pt-2">
                    <Textarea
                      placeholder="Override art style for this character (optional)"
                      value={character.artStyle || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        setCharacters(prev => prev.map(c => c.id === character.id ? { ...c, artStyle: value } : c));
                        try {
                          const updated = characters.map(c => c.id === character.id ? { ...c, artStyle: value } : c);
                          sessionStorage.setItem('characters', JSON.stringify(updated));
                        } catch {}
                        const current = characters.find(c => c.id === character.id);
                        persistCharacter({ ...(current as Character), artStyle: value });
                      }}
                      className="h-20 bg-white/5 border-white/10 text-white placeholder:text-white/50 resize-none"
                    />
                    <div className="text-xs text-white/60 mt-1">{(character.artStyle || '').length} characters</div>
                  </div>
                </details>
                <div className="flex gap-2">
                  <Button
                    onClick={() => generateImage(character.id)}
                    className="flex-1 bg-gradient-to-r from-fuchsia-500 to-indigo-400 text-white hover:opacity-95"
                    disabled={
                      character.isGenerating ||
                      !(character.description || '').trim() ||
                      !((character.artStyle || '').trim())
                    }
                  >
                    {character.isGenerating ? (
                      <>
                        <div className="h-4 w-4 mr-2 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-4 w-4 mr-2" />
                        {character.hasGenerated ? 'Generate Again' : 'Generate Character'}
                      </>
                    )}
                  </Button>
                  <input
                    id={`file-${character.id}`}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    className="hidden"
                    onChange={(e) => handleUploadFile(character.id, e.target.files?.[0] || null)}
                  />
                  <Button
                    variant="outline"
                    className="border-white/20 text-white hover:bg-white/10"
                    disabled={character.isGenerating || !!character.imageDataUrl}
                    onClick={(e) => {
                      e.preventDefault();
                      const input = document.getElementById(`file-${character.id}`) as HTMLInputElement | null;
                      input?.click();
                    }}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Character
                  </Button>
                </div>
                {character.imageDataUrl && (
                  <div className="mt-4">
                    <img src={character.imageDataUrl} alt={`${character.name} - generated`} className="w-full rounded-md border border-white/10" />
                  </div>
                )}
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
            disabled={!allImagesReady}
            className="px-8 bg-gradient-to-r from-fuchsia-500 to-indigo-400 text-white shadow-[0_8px_30px_rgba(168,85,247,0.35)] hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Go to Webtoon Builder →
          </Button>
        </div>
      </main>
    </div>
  );
}
