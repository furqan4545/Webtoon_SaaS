import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { imageDataUrl, projectId, sceneNo } = await request.json();
    if (!imageDataUrl || !projectId || typeof sceneNo !== 'number') {
      return NextResponse.json({ error: 'imageDataUrl, projectId and numeric sceneNo are required' }, { status: 400 });
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let b64: string | undefined;
    let mime: string = 'image/png';
    if (String(imageDataUrl).startsWith('data:')) {
      const [meta, body] = String(imageDataUrl).split(',');
      mime = meta?.match(/data:(.*?);base64/)?.[1] || 'image/png';
      b64 = body;
    } else {
      try {
        const resp = await fetch(String(imageDataUrl));
        const ab = await resp.arrayBuffer();
        const buf = Buffer.from(ab);
        b64 = buf.toString('base64');
        mime = resp.headers.get('content-type') || 'image/png';
      } catch {
        return NextResponse.json({ error: 'Invalid imageDataUrl' }, { status: 400 });
      }
    }

    if (!b64) return NextResponse.json({ error: 'Invalid imageDataUrl' }, { status: 400 });

    const buffer = Buffer.from(b64, 'base64');
    const now = new Date().toISOString();
    const path = `users/${user.id}/projects/${projectId}/scenes/scene_${sceneNo}_manual.png`;
    const upload = await supabase.storage.from('webtoon').upload(path, buffer, { contentType: mime, upsert: true });
    if (upload.error) {
      return NextResponse.json({ error: 'Upload failed', details: upload.error.message }, { status: 500 });
    }

    try {
      const { data: genScene } = await supabase
        .from('generated_scenes')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .eq('scene_no', Number(sceneNo))
        .single();
      if (genScene?.id) {
        const { data: existing } = await supabase
          .from('generated_scene_images')
          .select('id,image_path')
          .eq('project_id', projectId)
          .eq('user_id', user.id)
          .eq('scene_no', Number(sceneNo))
          .single();
        if (existing?.id) {
          if (existing.image_path && existing.image_path !== path) {
            try { await supabase.storage.from('webtoon').remove([existing.image_path]); } catch {}
          }
          await supabase
            .from('generated_scene_images')
            .update({ image_path: path, updated_at: now })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('generated_scene_images')
            .insert({
              project_id: projectId,
              user_id: user.id,
              scene_id: genScene.id,
              scene_no: Number(sceneNo),
              image_path: path,
              created_at: now,
              updated_at: now,
            });
        }
        await supabase.from('projects').update({ updated_at: now }).eq('id', projectId).eq('user_id', user.id);
      }
    } catch {}

    return NextResponse.json({ success: true, path }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to save scene image', details: error?.message || 'Unknown' }, { status: 500 });
  }
}


