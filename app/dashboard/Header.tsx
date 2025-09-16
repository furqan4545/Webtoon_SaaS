"use client";

import { createClient } from "@/utils/supabase/client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChevronDown } from "lucide-react";
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
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [isNavigatingHome, setIsNavigatingHome] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [usage, setUsage] = useState<{
    plan: string;
    used: number;
    limit: number;
    remaining: number;
    resetsAt?: string;
  } | null>(null);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadCreditsForUser = async (userId: string | null | undefined, emailVal?: string | null) => {
      setEmail(emailVal ?? null);
      setIsAuthed(!!userId);
      if (!userId) {
        setUsage(null);
        return;
      }
      // Only POST once per session to hydrate profile record
      const key = 'profilePosted';
      try {
        if (!sessionStorage.getItem(key)) {
          await fetch('/api/profile', { method: 'POST' });
          sessionStorage.setItem(key, '1');
        }
      } catch {}
      try {
        setIsLoadingUsage(true);
        const { data: prof } = await supabase
          .from('profiles')
          .select('plan, month_start, monthly_base_limit, monthly_bonus_credits, monthly_used')
          .eq('user_id', String(userId))
          .single();
        const plan = prof?.plan || 'free';
        const now = new Date();
        const start = prof?.month_start ? new Date(String(prof.month_start)) : null;
        const monthIsCurrent = !!start && start.getUTCFullYear() === now.getUTCFullYear() && start.getUTCMonth() === now.getUTCMonth();
        const base = Number.isFinite(prof?.monthly_base_limit) ? Number(prof?.monthly_base_limit) : (plan === 'pro' ? 500 : 50);
        const bonus = monthIsCurrent ? (Number(prof?.monthly_bonus_credits) || 0) : 0;
        const used = monthIsCurrent ? (Number(prof?.monthly_used) || 0) : 0;
        const limit = Math.max(0, base + bonus);
        const remaining = Math.max(0, limit - used);
        const resetsAt = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
        if (mounted) setUsage({ plan, used, limit, remaining, resetsAt });
      } catch {}
      finally {
        if (mounted) setIsLoadingUsage(false);
      }
    };
    (async () => {
      const { data } = await supabase.auth.getSession();
      let user = data.session?.user || null;
      if (user && !user.email) {
        try {
          const { data: fresh } = await supabase.auth.getUser();
          if (fresh?.user) user = fresh.user;
        } catch {}
      }
      await loadCreditsForUser(user?.id, user?.email ?? null);
    })();
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      let user = session?.user || null;
      if (user && !user.email) {
        supabase.auth.getUser().then(({ data }) => {
          const fresh = data?.user || null;
          loadCreditsForUser(fresh?.id, fresh?.email ?? null);
        });
        return;
      }
      loadCreditsForUser(user?.id, user?.email ?? null);
    });
    const onRefresh = () => {
      // refresh for the current session
      supabase.auth.getSession().then(({ data }) => {
        let user = data.session?.user || null;
        if (user && !user.email) {
          supabase.auth.getUser().then(({ data }) => {
            const fresh = data?.user || null;
            loadCreditsForUser(fresh?.id, fresh?.email ?? null);
          });
          return;
        }
        loadCreditsForUser(user?.id, user?.email ?? null);
      });
    };
    window.addEventListener('credits:refresh', onRefresh);
    return () => {
      mounted = false;
      try { authListener?.subscription?.unsubscribe(); } catch {}
      window.removeEventListener('credits:refresh', onRefresh);
    };
  }, [supabase]);

  // Ensure home route is prefetched for fast dashboard → home transitions
  useEffect(() => {
    try {
      // @ts-ignore
      router.prefetch && router.prefetch('/');
    } catch {}
  }, [router]);

  // Turn off the top loader when navigation completes (pathname changes)
  useEffect(() => {
    if (isNavigatingHome) {
      setIsNavigatingHome(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const logout = async () => {
    await supabase.auth.signOut();
    try {
      Object.keys(localStorage).filter((k) => k.startsWith('sb-')).forEach((k) => localStorage.removeItem(k));
    } catch {}
    router.replace("/login");
  };

  // Hide header entirely on preview page
  if (pathname && pathname.startsWith('/webtoon-builder/preview')) {
    return null;
  }

  return (
    <header className="sticky top-0 z-30 w-full border-b border-white/10 bg-gradient-to-b from-black/40 to-transparent backdrop-blur">
      {/* top progress bar on navigate */}
      <style jsx global>{`
        @keyframes stripe-scan {
          0% { background-position: -200px 0; }
          100% { background-position: calc(100% + 200px) 0; }
        }
      `}</style>
      <div className={`fixed left-0 top-0 h-0.5 w-full transition-opacity ${isNavigatingHome ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{
          backgroundImage: 'linear-gradient(90deg, rgba(217,70,239,1) 0%, rgba(99,102,241,1) 50%, rgba(217,70,239,1) 100%), linear-gradient(90deg, rgba(255,255,255,0.0) 0%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0.0) 100%)',
          backgroundSize: '100% 100%, 200px 100%',
          backgroundRepeat: 'repeat, no-repeat',
          backgroundPosition: '0 0, 0 0',
          animation: isNavigatingHome ? 'stripe-scan 1.2s linear infinite' : undefined,
        }}
      />
      <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
        <Link
          href="/"
          prefetch
          onClick={() => {
            if (pathname === '/') return;
            setIsNavigatingHome(true);
          }}
          className="text-left text-xl font-semibold tracking-tight cursor-pointer"
          aria-label="Go to Home"
        >
          <span className="text-white">Web</span>
          <span className="bg-gradient-to-r from-fuchsia-500 to-indigo-400 bg-clip-text text-transparent">Toon</span>
        </Link>
        <div className="flex items-center gap-3">
          {isAuthed && (
            <>
              <div className="rounded-full p-[1px] bg-gradient-to-r from-emerald-400 via-sky-500 to-violet-500">
                <div
                  className="rounded-full px-3 py-1 text-xs bg-neutral-900/80 text-white/90"
                  title={
                    !isLoadingUsage && usage?.remaining === 0 && usage?.resetsAt
                      ? `Resets on ${new Date(usage.resetsAt).toLocaleDateString()}`
                      : undefined
                  }
                >
                  {isLoadingUsage ? 'Loading…' : `${usage?.remaining ?? 0} Credits left`}
                </div>
              </div>
              <Link href="/pricing" prefetch>
                <Button
                  className="h-9 rounded-full px-4 text-sm font-medium text-white bg-gradient-to-r from-rose-500 via-fuchsia-500 to-indigo-500 hover:from-rose-400 hover:via-fuchsia-400 hover:to-indigo-400 focus-visible:ring-2 focus-visible:ring-rose-400/40"
                >
                  <span className="hidden sm:inline">Upgrade to Pro</span>
                  <span className="sm:hidden">Upgrade</span>
                </Button>
              </Link>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger className="rounded-full focus:outline-none cursor-pointer">
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage alt={email ?? "avatar"} />
                  <AvatarFallback>SF</AvatarFallback>
                </Avatar>
                <ChevronDown className="h-4 w-4 text-white/70" />
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
      </div>
    </header>
  );
}


