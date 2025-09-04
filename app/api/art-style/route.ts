import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  const { data, error } = await supabase
    .from('art_styles')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ artStyle: data || null });
}

export async function PATCH(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const projectId: string | undefined = body?.projectId;
  const description: string | undefined = body?.description;
  if (!projectId || typeof description !== 'string') return NextResponse.json({ error: 'projectId and description required' }, { status: 400 });

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('art_styles')
    .update({ description, updated_at: now })
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Art style not found for project' }, { status: 404 });

  await supabase.from('projects').update({ updated_at: now }).eq('id', projectId).eq('user_id', user.id);
  return NextResponse.json({ success: true });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const projectId: string | undefined = body?.projectId;
  const description: string | undefined = body?.description;
  if (!projectId || typeof description !== 'string') return NextResponse.json({ error: 'projectId and description required' }, { status: 400 });

  // Ensure not existing
  const { data: existing, error: selErr } = await supabase
    .from('art_styles')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
  if (existing) return NextResponse.json({ error: 'Art style already exists for project' }, { status: 409 });

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('art_styles')
    .insert({ project_id: projectId, user_id: user.id, description, created_at: now, updated_at: now });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from('projects').update({ updated_at: now }).eq('id', projectId).eq('user_id', user.id);
  return NextResponse.json({ success: true });
}


