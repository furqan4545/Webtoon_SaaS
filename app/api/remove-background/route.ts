import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { imageDataUrl, projectId, sceneNo } = await request.json();
    if (!imageDataUrl || typeof imageDataUrl !== 'string') {
      return NextResponse.json({ error: 'imageDataUrl is required' }, { status: 400 });
    }

    const rawKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
    const apiKey = rawKey.replace(/["'“”]/g, "").trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const model = 'gemini-2.5-flash-image-preview';
    const config = { responseModalities: ['IMAGE', 'TEXT'] } as any;

    let b64: string | undefined;
    let mime: string = 'image/png';
    if (String(imageDataUrl).startsWith('data:')) {
      const [meta, body] = String(imageDataUrl).split(',');
      mime = meta?.match(/data:(.*?);base64/)?.[1] || 'image/png';
      b64 = body;
    } else {
      // Treat as remote URL: fetch and convert to base64
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

    const prompt = 'Remove the background from the given picture. Keep the subject intact and edges clean. Output on a plain white background.';

    const parts: any[] = [
      { text: prompt },
      { inlineData: { mimeType: mime, data: b64 } },
    ];

    const contents = [{ role: 'user', parts }];
    const response = await ai.models.generateContent({ model, config, contents });
    const r: any = response as any;
    const imgPart = r?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data);
    const outB64: string | undefined = imgPart?.inlineData?.data;
    const outMime: string = imgPart?.inlineData?.mimeType || 'image/png';
    if (!outB64) {
      const textOut: string | undefined = r?.text || r?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('\n');
      return NextResponse.json({ error: 'No image returned from model', text: textOut }, { status: 502 });
    }
    const dataUrl = `data:${outMime};base64,${outB64}`;

    // If project and scene provided, persist new image to storage and update DB
    if (projectId && typeof sceneNo === 'number') {
      try {
        const buffer = Buffer.from(outB64, 'base64');
        // Resolve generated_scenes row to tie the image
        const { data: genScene } = await supabase
          .from('generated_scenes')
          .select('id')
          .eq('project_id', projectId)
          .eq('user_id', user.id)
          .eq('scene_no', sceneNo)
          .single();
        const now = new Date().toISOString();
        const path = `users/${user.id}/projects/${projectId}/scenes/scene_${sceneNo}_nobg.png`;
        const upload = await supabase.storage.from('webtoon').upload(path, buffer, { contentType: outMime, upsert: true });
        if (!upload.error) {
          // Update scenes table
          await supabase.from('scenes').upsert({
            project_id: projectId,
            user_id: user.id,
            idx: sceneNo,
            image_path: path,
            updated_at: now,
          }, { onConflict: 'project_id,idx' });
          // Update generated_scene_images: update if exists, else insert
          if (genScene?.id) {
            const { data: existing } = await supabase
              .from('generated_scene_images')
              .select('id,image_path')
              .eq('project_id', projectId)
              .eq('user_id', user.id)
              .eq('scene_no', sceneNo)
              .single();
            if (existing?.id) {
              if (existing.image_path && existing.image_path !== path) {
                try { await supabase.storage.from('webtoon').remove([existing.image_path]); } catch {}
              }
              await supabase.from('generated_scene_images').update({ image_path: path, updated_at: now }).eq('id', existing.id);
            } else {
              await supabase.from('generated_scene_images').insert({ project_id: projectId, user_id: user.id, scene_id: genScene.id, scene_no: sceneNo, image_path: path, created_at: now, updated_at: now });
            }
          }
          await supabase.from('projects').update({ updated_at: now }).eq('id', projectId).eq('user_id', user.id);
        }
      } catch {}
    }

    return NextResponse.json({ success: true, image: dataUrl }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to remove background', details: error?.message || 'Unknown' }, { status: 500 });
  }
}


