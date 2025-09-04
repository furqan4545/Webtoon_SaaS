import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const projectId: string | undefined = body?.projectId;
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('projects')
    .update({ status: 'published', updated_at: now })
    .eq('id', projectId)
    .eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}


