"use client";

import { createClient } from "@/utils/supabase/client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Header() {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [isNavigatingHome, setIsNavigatingHome] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      setEmail(data.user?.email ?? null);
      if (data.user) {
        try { await fetch('/api/profile', { method: 'POST' }); } catch {}
      }
    });
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <header className="sticky top-0 z-30 w-full border-b border-white/10 bg-gradient-to-b from-black/40 to-transparent backdrop-blur">
      {/* top progress bar on navigate */}
      <div className={`fixed left-0 top-0 h-0.5 w-full bg-gradient-to-r from-fuchsia-500 via-indigo-400 to-fuchsia-500 transition-opacity ${isNavigatingHome ? 'opacity-100 animate-pulse' : 'opacity-0 pointer-events-none'}`} />
      <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
        <button
          onClick={() => {
            setIsNavigatingHome(true);
            router.push('/');
          }}
          className="text-left text-xl font-semibold tracking-tight cursor-pointer"
          aria-label="Go to Home"
        >
          <span className="text-white">Web</span>
          <span className="bg-gradient-to-r from-fuchsia-500 to-indigo-400 bg-clip-text text-transparent">Toon</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-full focus:outline-none">
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage alt={email ?? "avatar"} />
                <AvatarFallback>SF</AvatarFallback>
              </Avatar>
              <span className="hidden sm:block text-sm text-white/80">{email ?? "Account"}</span>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-64 border-white/10 bg-neutral-900 text-white"
          >
            <DropdownMenuLabel className="text-white/80">
              Signed in as
            </DropdownMenuLabel>
            <div className="px-2 pb-1 text-sm text-white/70 truncate">{email ?? "—"}</div>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem
              onClick={logout}
              className="text-white focus:bg-white/10 focus:text-white"
            >
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}


