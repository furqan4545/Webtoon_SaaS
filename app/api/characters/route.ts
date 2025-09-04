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
  // Create-only: if exists, return it unchanged
  const { data: existing } = await supabase
    .from('characters')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .eq('name', name)
    .single();
  if (existing) return NextResponse.json({ character: existing });
  const insertData: any = {
    project_id: projectId,
    user_id: user.id,
    name,
    description: description ?? null,
    art_style: artStyle ?? null,
    image_path: imagePath ?? null,
    created_at: now,
    updated_at: now,
  };
  const { data, error } = await supabase
    .from('characters')
    .insert(insertData)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ character: data });
}

export async function PATCH(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const { projectId, name, description, artStyle, imagePath } = body || {};
  if (!projectId || !name) return NextResponse.json({ error: 'projectId and name required' }, { status: 400 });

  // Find existing row
  const { data: existing } = await supabase
    .from('characters')
    .select('id,image_path')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .eq('name', name)
    .single();

  const now = new Date().toISOString();
  if (!existing) {
    // Create if missing
    const { data, error } = await supabase
      .from('characters')
      .insert({
        project_id: projectId,
        user_id: user.id,
        name,
        description: description ?? null,
        art_style: artStyle ?? null,
        image_path: imagePath ?? null,
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ character: data });
  }

  // Delete old storage file if replacing image
  if (imagePath && existing.image_path && existing.image_path !== imagePath) {
    try { await supabase.storage.from('webtoon').remove([existing.image_path]); } catch {}
  }

  const updates: any = { updated_at: now };
  if (description !== undefined) updates.description = description;
  if (artStyle !== undefined) updates.art_style = artStyle;
  if (imagePath !== undefined) updates.image_path = imagePath;

  const { data, error } = await supabase
    .from('characters')
    .update(updates)
    .eq('id', existing.id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ character: data });
}


