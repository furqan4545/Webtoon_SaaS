import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import Header from "./Header";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function Dashboard() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0b12] to-[#0f0f1a] text-white">
      <Header />
      <main className="mx-auto max-w-6xl px-4 pb-24">
        <section className="min-h-[calc(100vh-88px)] flex flex-col items-center justify-center text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Let's Get Started with <span className="bg-gradient-to-r from-fuchsia-500 to-indigo-400 bg-clip-text text-transparent">Your Story</span>
          </h1>
          <p className="mt-4 text-white/70 max-w-2xl mx-auto">
            Choose your starting point and we'll guide you through the perfect creation process
          </p>
          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2 w-full items-stretch">
            {/* Card 1 */}
            <Card className="h-full flex flex-col items-center text-center border-white/10 bg-white/5/40 backdrop-blur-sm p-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-indigo-400 shadow-[0_10px_30px_-10px_rgba(168,85,247,0.6)] mb-4">
                <span className="text-3xl">📖</span>
              </div>
              <CardTitle className="text-xl mb-4">
                <span className="bg-gradient-to-r from-fuchsia-500 to-indigo-400 bg-clip-text text-transparent">I Have a Story</span>
              </CardTitle>
              <CardDescription className="text-white/70 max-w-md mb-6">
                Perfect! You already have your story written or outlined. We'll help you visualize your scenes and bring your characters to life with AI‑generated artwork.
              </CardDescription>
              <ul className="mx-auto max-w-md list-disc space-y-2 text-sm text-white/80 text-left pl-5 mb-8">
                <li>Import your existing story</li>
                <li>Break it into comic panels</li>
                <li>Generate matching visuals</li>
              </ul>
              <div className="mt-auto w-full">
                <Button className="w-full h-12 bg-gradient-to-r from-fuchsia-500 to-indigo-400 text-white shadow-[0_8px_30px_rgba(168,85,247,0.35)] hover:opacity-95">
                  Import My Story →
                </Button>
              </div>
            </Card>

            {/* Card 2 */}
            <Card className="h-full flex flex-col items-center text-center border-white/10 bg-white/5/40 backdrop-blur-sm p-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-400 shadow-[0_10px_30px_-10px_rgba(56,189,248,0.6)] mb-4">
                <span className="text-3xl">💡</span>
              </div>
              <CardTitle className="text-xl mb-4">
                <span className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">Start from Scratch</span>
              </CardTitle>
              <CardDescription className="text-white/70 max-w-md mb-6">
                No worries! We'll help you brainstorm ideas, develop characters, and create your story from the ground up with AI‑assisted storytelling tools.
              </CardDescription>
              <ul className="mx-auto max-w-md list-disc space-y-2 text-sm text-white/80 text-left pl-5 mb-8">
                <li>AI‑powered story brainstorming</li>
                <li>Character development tools</li>
                <li>Guided story structure</li>
              </ul>
              <div className="mt-auto w-full">
                <Button className="w-full h-12 bg-gradient-to-r from-sky-400 to-indigo-400 text-white shadow-[0_8px_30px_rgba(56,189,248,0.35)] hover:opacity-95">
                  Create New Story →
                </Button>
              </div>
            </Card>
          </div>
        </section>

        <div className="mt-10 flex justify-center">
          <Link href="/" className="text-sm text-white/70 hover:text-white/90 underline">
            ← Back to Home
          </Link>
        </div>
      </main>
    </div>
  );
}