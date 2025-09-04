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
    .from('generated_scenes')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .order('scene_no', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ scenes: data || [] });
}

// Insert many scenes at once; expects { projectId, scenes: [{ scene_no, story_text, scene_description }] }
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const projectId: string | undefined = body?.projectId;
  const scenes: Array<{ scene_no: number; story_text: string; scene_description: string }>|undefined = body?.scenes;
  if (!projectId || !Array.isArray(scenes) || scenes.length === 0) return NextResponse.json({ error: 'projectId and scenes required' }, { status: 400 });
  const now = new Date().toISOString();
  const rows = scenes.map(s => ({ project_id: projectId, user_id: user.id, scene_no: s.scene_no, story_text: s.story_text, scene_description: s.scene_description, created_at: now, updated_at: now }));
  const { error } = await supabase.from('generated_scenes').insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await supabase.from('projects').update({ updated_at: now }).eq('id', projectId).eq('user_id', user.id);
  return NextResponse.json({ success: true });
}

// Update a single scene description; expects { projectId, scene_no, scene_description }
export async function PATCH(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const projectId: string | undefined = body?.projectId;
  const sceneNo: number | undefined = body?.scene_no;
  const sceneDescription: string | undefined = body?.scene_description;
  if (!projectId || typeof sceneNo !== 'number' || typeof sceneDescription !== 'string') return NextResponse.json({ error: 'projectId, scene_no, scene_description required' }, { status: 400 });
  const { data: existing } = await supabase
    .from('generated_scenes')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .eq('scene_no', sceneNo)
    .single();
  if (!existing) return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('generated_scenes')
    .update({ scene_description: sceneDescription, updated_at: now })
    .eq('id', existing.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await supabase.from('projects').update({ updated_at: now }).eq('id', projectId).eq('user_id', user.id);
  return NextResponse.json({ success: true });
}


