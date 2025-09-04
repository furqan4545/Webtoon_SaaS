import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { email } = user;
  const full_name = (user.user_metadata?.full_name || user.user_metadata?.name || '').toString() || null;
  const avatar_url = (user.user_metadata?.avatar_url || '').toString() || null;
  const nowMonth = new Date();
  const firstOfMonth = new Date(nowMonth.getFullYear(), nowMonth.getMonth(), 1).toISOString().slice(0,10);
  const { data, error } = await supabase
    .from('profiles')
    .upsert({
      user_id: user.id,
      email,
      full_name,
      avatar_url,
      month_start: firstOfMonth,
    }, { onConflict: 'user_id' })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}


