import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest } from "next/server";

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (token_hash && type) {
    const supabase = createClient();

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (!error) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const now = new Date();
          const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
          const payload: any = {
            user_id: user.id,
            email: user.email,
            full_name: (user.user_metadata?.full_name || user.user_metadata?.name || '').toString() || null,
            avatar_url: (user.user_metadata?.avatar_url || '').toString() || null,
            month_start: firstOfMonth,
          };
          let { error: upErr } = await supabase.from('profiles').upsert(payload, { onConflict: 'user_id' });
          if (upErr) {
            console.error('profiles upsert (confirm) failed:', upErr?.message);
            await supabase.from('profiles').upsert({ user_id: user.id, month_start: firstOfMonth }, { onConflict: 'user_id' });
          }
          // Determine if first-time user and create initial project
          try {
            const { data: existing } = await supabase
              .from('projects')
              .select('id')
              .eq('user_id', user.id)
              .limit(1);
            const hasProjects = Array.isArray(existing) && existing.length > 0;
            if (!hasProjects) {
              const nowIso = new Date().toISOString();
              const { data: created } = await supabase
                .from('projects')
                .insert([{ user_id: user.id, title: 'Webtoon Project', status: 'draft', steps: 0, created_at: nowIso, updated_at: nowIso }])
                .select('id')
                .single();
              if (created?.id) {
                // First-time: go straight to import-story
                return redirect(`/import-story?projectId=${encodeURIComponent(created.id)}`);
              }
            }
            // Existing users: go to home
            return redirect('/');
          } catch {
            return redirect('/');
          }
        }
      } catch (e) {
        console.error('profiles upsert error (confirm):', e);
      }
      // Fallback
      redirect('/');
    }
  }

  // redirect the user to an error page with some instructions
  redirect("/error");
}