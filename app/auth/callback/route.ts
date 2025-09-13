import { NextResponse } from "next/server";
// The client you created from the Server-Side Auth instructions
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // if "next" is in param, use it as the redirect URL
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const now = new Date();
          const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
          const fullPayload: any = {
            user_id: user.id,
            email: user.email,
            full_name: (user.user_metadata?.full_name || user.user_metadata?.name || '').toString() || null,
            avatar_url: (user.user_metadata?.avatar_url || '').toString() || null,
            month_start: firstOfMonth,
          };
          let { error: upErr } = await supabase.from('profiles').upsert(fullPayload, { onConflict: 'user_id' });
          if (upErr) {
            console.error('profiles upsert (full) failed:', upErr?.message);
            const minimal = { user_id: user.id, month_start: firstOfMonth };
            await supabase.from('profiles').upsert(minimal, { onConflict: 'user_id' });
          }

          // Determine first-time user and create initial project if needed
          let redirectPath: string | null = null;
          try {
            const { data: existing } = await supabase
              .from('projects')
              .select('id')
              .eq('user_id', user.id)
              .limit(1);
            const hasProjects = Array.isArray(existing) && existing.length > 0;
            if (!hasProjects) {
              const nowIso = new Date().toISOString();
              const { data: created, error: createErr } = await supabase
                .from('projects')
                .insert([{ user_id: user.id, title: 'Webtoon Project', status: 'draft', steps: 0, created_at: nowIso, updated_at: nowIso }])
                .select('id')
                .single();
              if (!createErr && created?.id) {
                // Force first-time users to import-story
                redirectPath = `/import-story?projectId=${encodeURIComponent(created.id)}`;
              } else {
                // If create failed, fall back to dashboard
                redirectPath = '/dashboard';
              }
            } else {
              // Existing users land on home
              redirectPath = '/';
            }
          } catch {
            // On any error, default to dashboard
            redirectPath = '/dashboard';
          }

          // If auth flow provided an explicit next and user is not first-time, honor it
          // First-time users always go to import-story
          const finalPath = redirectPath || '/';

          const forwardedHost = request.headers.get("x-forwarded-host");
          const isLocalEnv = process.env.NODE_ENV === "development";
          if (isLocalEnv) {
            return NextResponse.redirect(`${origin}${finalPath}`);
          } else if (forwardedHost) {
            return NextResponse.redirect(`https://${forwardedHost}${finalPath}`);
          } else {
            return NextResponse.redirect(`${origin}${finalPath}`);
          }
        }
      } catch (e) {
        console.error('profiles upsert error:', e);
      }
      // If we didn't return above (no user?), fall back to next
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      if (isLocalEnv) return NextResponse.redirect(`${origin}${next}`);
      if (forwardedHost) return NextResponse.redirect(`https://${forwardedHost}${next}`);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}