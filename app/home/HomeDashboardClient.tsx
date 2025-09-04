"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import Header from "../dashboard/Header";

type ProjectStatus = "draft" | "in_progress" | "completed" | "published";

type Project = {
  id: string;
  title: string;
  status: ProjectStatus;
  chapters: number;
  modifiedAt: string; // ISO date
  coverUrl?: string;
};

const STORAGE_KEY = "webtoonProjects";

export default function HomeDashboardClient() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [sortBy, setSortBy] = useState<"modified" | "title">("modified");
  const [statusFilter, setStatusFilter] = useState<"all" | ProjectStatus>("all");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setProjects(JSON.parse(raw));
      } else {
        // Seed with a couple starter examples for empty state
        const seed: Project[] = [
          {
            id: crypto.randomUUID(),
            title: "Mystic Adventures",
            status: "in_progress",
            chapters: 12,
            modifiedAt: new Date().toISOString(),
          },
        ];
        setProjects(seed);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      }
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(projects)); } catch {}
  }, [projects]);

  const stats = useMemo(() => {
    const total = projects.length;
    const modified7d = projects.filter(p => Date.now() - new Date(p.modifiedAt).getTime() < 7 * 24 * 60 * 60 * 1000).length;
    const published = projects.filter(p => p.status === "published").length;
    return { total, modified7d, published };
  }, [projects]);

  const filtered = useMemo(() => {
    let list = [...projects];
    if (statusFilter !== "all") list = list.filter(p => p.status === statusFilter);
    if (sortBy === "modified") list.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
    if (sortBy === "title") list.sort((a, b) => a.title.localeCompare(b.title));
    return list;
  }, [projects, sortBy, statusFilter]);

  const createProject = () => {
    const title = `Untitled Webtoon ${projects.length + 1}`;
    const proj: Project = {
      id: crypto.randomUUID(),
      title,
      status: "draft",
      chapters: 0,
      modifiedAt: new Date().toISOString(),
    };
    setProjects(prev => [proj, ...prev]);
  };

  const deleteProject = (id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id));
  };

  const renameProject = (id: string) => {
    const name = prompt("Rename project");
    if (!name) return;
    setProjects(prev => prev.map(p => p.id === id ? { ...p, title: name, modifiedAt: new Date().toISOString() } : p));
  };

  const cycleStatus = (id: string) => {
    const order: ProjectStatus[] = ["draft", "in_progress", "completed", "published"];
    setProjects(prev => prev.map(p => {
      if (p.id !== id) return p;
      const idx = order.indexOf(p.status);
      return { ...p, status: order[(idx + 1) % order.length], modifiedAt: new Date().toISOString() };
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0b12] to-[#0f0f1a] text-white">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold">AI Webtoon Creator Dashboard</h1>
            <p className="text-white/70 mt-1">Manage your AI-generated webtoons and comics</p>
          </div>
          <Button
            className="h-10 px-4 bg-gradient-to-r from-fuchsia-500 to-indigo-400 text-white shadow-[0_8px_30px_rgba(168,85,247,0.35)] hover:opacity-95"
            onClick={() => router.push("/dashboard")}
          >
            + Create New Webtoon
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
            <CardContent className="p-5">
              <div className="text-xs uppercase text-white/60">Total Projects</div>
              <div className="text-3xl font-semibold mt-1">{stats.total}</div>
              <div className="text-xs text-white/50 mt-1">Active webtoon projects</div>
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
            <CardContent className="p-5">
              <div className="text-xs uppercase text-white/60">Recently Modified</div>
              <div className="text-3xl font-semibold mt-1">{stats.modified7d}</div>
              <div className="text-xs text-white/50 mt-1">Updated in last 7 days</div>
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
            <CardContent className="p-5">
              <div className="text-xs uppercase text-white/60">Published</div>
              <div className="text-3xl font-semibold mt-1">{stats.published}</div>
              <div className="text-xs text-white/50 mt-1">Live webtoons</div>
            </CardContent>
          </Card>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-3 items-center mt-8">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-white/10 border border-white/10 rounded-md px-3 py-2 text-sm"
          >
            <option value="modified">Last Modified</option>
            <option value="title">Title</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-white/10 border border-white/10 rounded-md px-3 py-2 text-sm"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="published">Published</option>
          </select>
          <Button
            variant="outline"
            className="border-white/20 text-white hover:bg-white/10"
            onClick={createProject}
          >
            + New Project (local)
          </Button>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          {filtered.map((p) => (
            <Card key={p.id} className="border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
              <div className="relative h-40 bg-gradient-to-br from-neutral-800 to-neutral-700" />
              <CardHeader className="pb-2">
                <CardTitle className="text-lg truncate">{p.title}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-white/70">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/10">
                      {p.status.replace("_", " ")}
                    </span>
                    <span>{p.chapters} chapters</span>
                  </div>
                  <span className="text-xs">Modified: {new Date(p.modifiedAt).toLocaleDateString()}</span>
                </div>
              </CardContent>
              <CardFooter className="flex items-center gap-2">
                <Button
                  className="bg-white text-black hover:opacity-90"
                  onClick={() => router.push("/dashboard")}
                >
                  Open
                </Button>
                <Button
                  variant="outline"
                  className="border-white/20 text-white hover:bg-white/10"
                  onClick={() => renameProject(p.id)}
                >
                  Rename
                </Button>
                <Button
                  variant="outline"
                  className="border-white/20 text-white hover:bg-white/10"
                  onClick={() => cycleStatus(p.id)}
                >
                  Set Status
                </Button>
                <Button
                  variant="outline"
                  className="ml-auto border-red-500/30 text-red-300 hover:bg-red-500/10"
                  onClick={() => deleteProject(p.id)}
                >
                  Delete
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}


