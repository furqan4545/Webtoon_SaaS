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
    .from('characters')
    .select('*')
    .eq('user_id', user.id)
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ characters: data || [] });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const { projectId, name, description, artStyle, imagePath } = body || {};
  if (!projectId || !name) return NextResponse.json({ error: 'projectId and name required' }, { status: 400 });
  const now = new Date().toISOString();
  const upsertData: any = {
    project_id: projectId,
    user_id: user.id,
    name,
    description: description ?? null,
    art_style: artStyle ?? null,
    updated_at: now,
  };
  if (imagePath) upsertData.image_path = imagePath;
  const { data, error } = await supabase
    .from('characters')
    .upsert(upsertData, { onConflict: 'project_id,name' })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ character: data });
}


