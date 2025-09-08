import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@/utils/supabase/server";

function sanitize(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\u2010-\u2015\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2026]/g, "...")
    .replace(/[\u00A0\u2000-\u200B\u2028\u2029]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(request: NextRequest) {
  try {
    const { sceneDescription, storyText, characterImages, artStyle, projectId, sceneIndex } = await request.json();
    if (!sceneDescription || !storyText) {
      return NextResponse.json({ error: "sceneDescription and storyText are required" }, { status: 400 });
    }

    const rawKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
    const apiKey = rawKey.replace(/["'“”]/g, "").trim();
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API key not configured" }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Quota pre-check via profiles snapshot (no internal HTTP)
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const { data: prof } = await supabase
      .from('profiles')
      .select('plan, month_start, monthly_base_limit, monthly_bonus_credits, monthly_used')
      .eq('user_id', user.id)
      .single();
    const baseLimit = Number.isFinite(prof?.monthly_base_limit) ? Number(prof?.monthly_base_limit) : (prof?.plan === 'pro' ? 500 : 50);
    const monthIsCurrent = prof?.month_start && String(prof.month_start).startsWith(firstOfMonth);
    const bonus = monthIsCurrent ? (Number(prof?.monthly_bonus_credits) || 0) : 0;
    const used = monthIsCurrent ? (Number(prof?.monthly_used) || 0) : 0;
    const remaining = Math.max(0, Math.max(0, baseLimit + bonus) - used);
    if (remaining <= 0) {
      return NextResponse.json({ error: 'Monthly image limit reached' }, { status: 429 });
    }
    const model = 'gemini-2.5-flash-image-preview';
    const config = { responseModalities: ['IMAGE', 'TEXT'] } as any;

    const refsList = Array.isArray(characterImages)
      ? characterImages.filter((c: any) => !!c?.dataUrl)
      : [];

    // Guard body size for Vercel (Serverless body limit ~4.5MB). Trim refs if too large.
    let approxBytes = 0;
    const safeRefs: any[] = [];
    for (const ref of refsList) {
      const base64 = String(ref.dataUrl).split(",")[1] || "";
      // base64 -> bytes approx factor
      approxBytes += Math.floor(base64.length * 0.75);
      if (approxBytes > 3_500_000) break; // keep under ~3.5MB margin
      safeRefs.push(ref);
    }

    const styleText = sanitize(artStyle || 'clean webtoon line art, flat cel shading, high mobile readability');
    // const prompt = sanitize(
    //   `You are generating a single WEBTOON panel for a vertical-scroll story.\nKeep the SAME PERSON as in provided references. Do NOT change hair length/color or fringe shape. Keep the same eye spacing, brow thickness, jawline, and any unique marks.\nStyle: ${styleText}. DO NOT INCLUDE TEXT.\n\nScene Description: ${sceneDescription}\nStory Text: ${storyText}`
    // );
    const prompt = sanitize(
      `A dynamic webtoon panel, tilted diagonally across the frame, drawn in dramatic manhwa style. Focus on the scene. The background should fade into soft details to keep emphasis on the characters and action. Use bold outlines, vibrant colors, and dramatic lighting to heighten tension. Add stylized motion lines, effects, and also sound effects with text (like ‘WHOOSH’, ‘LEAN’, etc.) if it matches the action. Keep the composition cropped so the main subject(s) dominate the tilted frame, giving it a cinematic, immersive feeling. \nStyle: ${styleText}. DO NOT INCLUDE TEXT.\n\nScene Description: ${sceneDescription}\nStory Text: ${storyText}`
    );

    // parts: text + inline images for each character reference
    const parts: any[] = [{ text: prompt }];
    for (const ref of safeRefs) {
      const [meta, b64] = String(ref.dataUrl).split(",");
      const mime = meta?.match(/data:(.*?);base64/)?.[1] || 'image/png';
      if (b64) {
        parts.push({ inlineData: { mimeType: mime, data: b64 } });
      }
    }

    const contents = [{ role: 'user', parts }];
    const maxAttempts = 3;
    const attemptIsRetriable = (status: any) => {
      const s = Number(status);
      return status === 429 || (Number.isFinite(s) && s >= 500);
    };
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`[scene-image] generate attempt ${attempt}/${maxAttempts}`);
        const response = await ai.models.generateContent({ model, config, contents });
        const r: any = response as any;
        const imgPart = r?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data);
        const base64: string | undefined = imgPart?.inlineData?.data;
        const mimeType: string = imgPart?.inlineData?.mimeType || 'image/png';
        if (!base64) {
          const textOut: string | undefined = r?.text || r?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('\n');
          throw Object.assign(new Error('No image returned from model'), { status: 502, textOut });
        }
        const dataUrl = `data:${mimeType};base64,${base64}`;

        // Save to Storage and DB
        const buffer = Buffer.from(base64, 'base64');
        const path = `users/${user.id}/projects/${projectId || 'default'}/scenes/${sceneIndex ?? Date.now()}.png`;
        // Upload to Supabase Storage bucket 'webtoon'
        const { data: uploaded, error: upErr } = await supabase.storage.from('webtoon').upload(path, buffer, {
          contentType: mimeType,
          upsert: true,
        });
        if (upErr) {
          console.error('storage upload error', upErr);
        }
        // Insert or upsert scene row if projectId provided
        if (projectId != null && sceneIndex != null) {
          const now = new Date().toISOString();
          await supabase.from('scenes').upsert({
            project_id: projectId,
            user_id: user.id,
            idx: Number(sceneIndex),
            description: sceneDescription,
            story_text: storyText,
            image_path: uploaded?.path || path,
            updated_at: now,
          }, { onConflict: 'project_id,idx' });
          await supabase.from('projects').update({ updated_at: now }).eq('id', projectId).eq('user_id', user.id);

          // Also persist into generated_scene_images tied to generated_scenes (no upsert; update if exists else insert)
          try {
            const { data: genScene } = await supabase
              .from('generated_scenes')
              .select('id')
              .eq('project_id', projectId)
              .eq('user_id', user.id)
              .eq('scene_no', Number(sceneIndex))
              .single();
            if (genScene?.id) {
              const newPath = uploaded?.path || path;
              const { data: existing } = await supabase
                .from('generated_scene_images')
                .select('id,image_path')
                .eq('project_id', projectId)
                .eq('user_id', user.id)
                .eq('scene_no', Number(sceneIndex))
                .single();
              if (existing?.id) {
                // Remove old storage object if path changed
                if (existing.image_path && existing.image_path !== newPath) {
                  try { await supabase.storage.from('webtoon').remove([existing.image_path]); } catch {}
                }
                await supabase
                  .from('generated_scene_images')
                  .update({ image_path: newPath, updated_at: now })
                  .eq('id', existing.id);
              } else {
                await supabase
                  .from('generated_scene_images')
                  .insert({
                    project_id: projectId,
                    user_id: user.id,
                    scene_id: genScene.id,
                    scene_no: Number(sceneIndex),
                    image_path: newPath,
                    created_at: now,
                    updated_at: now,
                  });
              }
            }
          } catch {}
        }

        // Increment usage
        try {
          await supabase.rpc('increment_monthly_usage');
        } catch {}

        return NextResponse.json({ success: true, image: dataUrl, path }, { headers: { 'Cache-Control': 'no-store' } });
      } catch (err: any) {
        const status = err?.status || err?.code || 500;
        console.error(`[scene-image] attempt ${attempt} failed`, { status, message: err?.message });
        if (attempt < maxAttempts && attemptIsRetriable(status)) {
          // exponential backoff: 400ms, 800ms
          await sleep(400 * attempt);
          continue;
        }
        throw err;
      }
    }
    // Should never reach here due to returns/throws above
    return NextResponse.json({ error: 'Unknown error' }, { status: 500 });
  } catch (error: any) {
    console.error('Scene image generation error:', error);
    const status = error?.status || error?.code || 500;
    const message = error?.message || 'Unknown';
    return NextResponse.json({ error: 'Failed to generate scene image', details: message }, { status: typeof status === 'number' ? status : 500 });
  }
}


