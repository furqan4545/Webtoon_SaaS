import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

const FREE_LIMIT = 50; // images per month
const PRO_LIMIT = 500; // images per month

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();
  const plan = profile?.plan || 'free';
  const used = profile?.images_generated || 0;
  const limit = plan === 'pro' ? PRO_LIMIT : FREE_LIMIT;
  return NextResponse.json({ plan, used, limit, remaining: Math.max(0, limit - used) });
}

export async function POST(request: NextRequest) {
  // Increment usage counter; creates a profile row if missing
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Reset month if needed
  const nowMonth = new Date();
  const firstOfMonth = new Date(nowMonth.getFullYear(), nowMonth.getMonth(), 1).toISOString().slice(0, 10);
  const { data: current } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();
  let month_start = current?.month_start || firstOfMonth;
  let images_generated = (current?.images_generated ?? 0) + 1;
  if (current && String(current.month_start) !== firstOfMonth) {
    month_start = firstOfMonth;
    images_generated = 1;
  }
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ user_id: user.id, plan: current?.plan || 'free', month_start, images_generated })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, profile: data });
}


