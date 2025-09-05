"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/utils/supabase/client";
import { Trash2 } from "lucide-react";

type ProjectStatus = "draft" | "in_progress" | "completed" | "published";

type Project = {
  id: string;
  title: string;
  status: ProjectStatus;
  chapters: number;
  modifiedAt: string; // ISO date
  coverUrl?: string;
};

const supabase = createClient();

type HomeDashboardClientProps = {
  initialProjects?: Project[];
};

export default function HomeDashboardClient({ initialProjects = [] }: HomeDashboardClientProps) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [sortBy, setSortBy] = useState<"modified" | "title">("modified");
  const [statusFilter, setStatusFilter] = useState<"all" | ProjectStatus>("all");

  // If server did not provide projects (edge cases), fallback to client fetch
  useEffect(() => {
    if (initialProjects.length > 0) return;
    const load = async () => {
      const { data, error } = await supabase.from('projects').select('*').order('updated_at', { ascending: false });
      if (!error && data) {
        setProjects(data.map((p: any) => ({
          id: p.id,
          title: p.title,
          status: p.status as ProjectStatus,
          chapters: 0,
          modifiedAt: p.updated_at,
        })));
      }
    };
    load();
  }, [initialProjects.length]);

  // Prefetch dashboard route to speed up transitions from home → dashboard
  useEffect(() => {
    try {
      // @ts-ignore - prefetch is available on app router in newer Next versions
      router.prefetch && router.prefetch('/dashboard');
    } catch {}
  }, [router]);

  useEffect(() => {
    // No-op: projects persisted server-side
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

  const gradients = [
    'bg-gradient-to-br from-fuchsia-500/30 to-indigo-500/30',
    'bg-gradient-to-br from-sky-400/30 to-indigo-500/30',
    'bg-gradient-to-br from-emerald-400/30 to-teal-500/30',
    'bg-gradient-to-br from-amber-400/30 to-rose-500/30',
    'bg-gradient-to-br from-purple-500/30 to-pink-500/30',
    'bg-gradient-to-br from-cyan-400/30 to-blue-500/30',
    'bg-gradient-to-br from-lime-400/30 to-green-500/30',
  ];
  const pickGradient = (id: string) => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return gradients[hash % gradients.length];
  };

  const createProject = async () => {
    const title = `Untitled Webtoon ${projects.length + 1}`;
    const res = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
    const json = await res.json();
    if (res.ok) {
      const p = json.project;
      setProjects(prev => [{ id: p.id, title: p.title, status: p.status, chapters: 0, modifiedAt: p.updated_at }, ...prev]);
    }
  };

  const deleteProject = async (id: string) => {
    await fetch(`/api/projects?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    setProjects(prev => prev.filter(p => p.id !== id));
  };

  const renameProject = async (id: string) => {
    const name = prompt("Rename project");
    if (!name) return;
    const res = await fetch('/api/projects', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, title: name }) });
    if (res.ok) setProjects(prev => prev.map(p => p.id === id ? { ...p, title: name, modifiedAt: new Date().toISOString() } : p));
  };

  const cycleStatus = async (id: string) => {
    const order: ProjectStatus[] = ["draft", "in_progress", "completed", "published"];
    const curr = projects.find(p => p.id === id);
    if (!curr) return;
    const next = order[(order.indexOf(curr.status) + 1) % order.length];
    const res = await fetch('/api/projects', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: next }) });
    if (res.ok) setProjects(prev => prev.map(p => p.id === id ? { ...p, status: next, modifiedAt: new Date().toISOString() } : p));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0b12] to-[#0f0f1a] text-white">
      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* Hidden prefetch anchor as a fallback; on some Next versions this helps warm the route */}
        <Link href="/dashboard" prefetch className="hidden" aria-hidden="true" tabIndex={-1}>
          {/* prefetch */}
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold">AI Webtoon Creator Dashboard</h1>
            <p className="text-white/70 mt-1">Manage your AI-generated webtoons and comics</p>
          </div>
          <Button
            className="h-10 px-4 bg-gradient-to-r from-fuchsia-500 to-indigo-400 text-white shadow-[0_8px_30px_rgba(168,85,247,0.35)] hover:opacity-95"
            onClick={() => {
              // Navigate immediately for snappy UX
              router.push("/dashboard");
              // Create in background and hydrate sessionStorage for downstream pages
              (async () => {
                try {
                  const res = await fetch('/api/projects', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: 'Untitled Webtoon' }),
                  });
                  if (res.ok) {
                    const { project } = await res.json();
                    try { sessionStorage.setItem('currentProjectId', project.id); } catch {}
                  }
                } catch {}
              })();
            }}
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
          <div className="hidden" />
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          {filtered.map((p) => (
            <Card
              key={p.id}
              className="group border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden hover:bg-white/10 transition-colors cursor-pointer"
              onClick={() => {
                try { sessionStorage.setItem('currentProjectId', p.id); } catch {}
                router.push('/dashboard');
              }}
            >
              <div className={`relative h-40 ${pickGradient(p.id)} border-b border-white/10`} />
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-lg truncate">{p.title}</CardTitle>
                  <button
                    className="opacity-70 hover:opacity-100 text-red-300 hover:text-red-400 cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); deleteProject(p.id); }}
                    aria-label="Delete project"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-white/70">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/10">unpublished</span>
                    <span>{p.chapters} chapters</span>
                  </div>
                  <span className="text-xs">Modified: {new Date(p.modifiedAt).toLocaleDateString()}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}


