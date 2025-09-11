import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const projectId: string | undefined = body?.projectId;
    const sceneNo: number | undefined = body?.sceneNo;
    if (!projectId || typeof sceneNo !== 'number') {
      return NextResponse.json({ error: 'projectId and sceneNo required' }, { status: 400 });
    }
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Collect storage paths to remove
    const pathsToRemove: string[] = [];
    try {
      const { data: imgRow } = await supabase
        .from('generated_scene_images')
        .select('image_path')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .eq('scene_no', sceneNo)
        .single();
      if (imgRow?.image_path) pathsToRemove.push(imgRow.image_path);
    } catch {}
    try {
      const { data: sceneRow } = await supabase
        .from('scenes')
        .select('id,image_path')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .eq('idx', sceneNo)
        .single();
      if (sceneRow?.image_path) pathsToRemove.push(sceneRow.image_path);
    } catch {}

    // Delete DB rows
    try {
      await supabase
        .from('generated_scenes')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .eq('scene_no', sceneNo);
    } catch {}
    try {
      await supabase
        .from('scenes')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .eq('idx', sceneNo);
    } catch {}

    // Remove storage files (best-effort)
    if (pathsToRemove.length > 0) {
      try { await supabase.storage.from('webtoon').remove(pathsToRemove); } catch {}
    }

    const now = new Date().toISOString();
    try {
      await supabase.from('projects').update({ updated_at: now }).eq('id', projectId).eq('user_id', user.id);
    } catch {}

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to delete scene', details: e?.message || 'Unknown' }, { status: 500 });
  }
}


