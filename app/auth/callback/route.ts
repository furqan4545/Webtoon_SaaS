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
        }
      } catch (e) {
        console.error('profiles upsert error:', e);
      }
      const forwardedHost = request.headers.get("x-forwarded-host"); // original origin before load balancer
      const isLocalEnv = process.env.NODE_ENV === "development";
      if (isLocalEnv) {
        // we can be sure that there is no load balancer in between, so no need to watch for X-Forwarded-Host
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}