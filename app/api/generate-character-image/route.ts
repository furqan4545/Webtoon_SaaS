import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@/utils/supabase/server";

// Minimal sanitizer to avoid smart quotes and odd whitespace in prompts
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
    const body = await request.json();
    const description: string | undefined = body?.description;
    const name: string | undefined = body?.name;
    const projectId: string | undefined = body?.projectId;
    const artStyle: string | undefined = body?.artStyle;

    const rawKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
    const apiKey = rawKey.replace(/["'“”]/g, "").trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Google Generative AI API key not configured" },
        { status: 500 }
      );
    }

    if (!description) {
      return NextResponse.json(
        { error: "Character description is required" },
        { status: 400 }
      );
    }

    // const systemInstruction = sanitize(
    //   `You are generating a consistent character model sheet for production. Render a single, front-facing character with clean line art and flat colors, maintaining stable identity markers so the character remains consistent across scenes. Avoid multiple characters, busy backgrounds, watermarks, or text.`
    // );
      
      const prompt = sanitize(`
      Name: ${name || "Unnamed"}
      Description: ${description}
      Style: ${(artStyle || "").trim() || "webtoon linework, expressive face, readable silhouette"}
      
      Layout: three full-body poses side-by-side (Front faces forward; Left = strict 90°; Right = strict 90°), equal height/spacing, plain white background.
      Identity lock: keep face, hair silhouette, skin tone, outfit/accessories consistent across views.
      Gaze: neutral; only the Front view looks forward; profiles look sideways.
      Text: title "${name || "Unnamed"}" at top; small labels "Front", "Left", "Right" under the poses.
      Avoid: studio lighting, photorealism, portrait/beauty-shot aesthetics, cinematic lighting, 3D render, glossy highlights, extra characters/backgrounds.
      `);

    // Use the official SDK per docs: https://googleapis.github.io/js-genai/ and npm page
    const ai = new GoogleGenAI({ apiKey });
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // Quota pre-check via profiles snapshot (no internal HTTP)
    const now = new Date();
    const { data: prof } = await supabase
      .from('profiles')
      .select('plan, month_start, monthly_base_limit, monthly_bonus_credits, monthly_used')
      .eq('user_id', user.id)
      .single();
    const base = Number.isFinite(prof?.monthly_base_limit) ? Number(prof?.monthly_base_limit) : (prof?.plan === 'pro' ? 500 : 50);
    const start = prof?.month_start ? new Date(String(prof.month_start)) : null;
    const monthIsCurrent = !!start && start.getUTCFullYear() === now.getUTCFullYear() && start.getUTCMonth() === now.getUTCMonth();
    const bonus = monthIsCurrent ? (Number(prof?.monthly_bonus_credits) || 0) : 0;
    const used = monthIsCurrent ? (Number(prof?.monthly_used) || 0) : 0;
    const remaining = Math.max(0, Math.max(0, base + bonus) - used);
    if (remaining <= 0) {
      return NextResponse.json({ error: 'Monthly image limit reached' }, { status: 429 });
    }
    // Match Google AI Studio sample model
    const model = 'gemini-2.5-flash-image-preview';
    const config = { responseModalities: ['IMAGE', 'TEXT'] } as any;
    const contents = [
      {
        role: 'user',
        parts: [
          { text: prompt },
        ],
      },
    ];

    // Retry on transient Gemini errors
    const maxAttempts = 3;
    const attemptIsRetriable = (status: any) => {
      const s = Number(status);
      return status === 429 || (Number.isFinite(s) && s >= 500);
    };
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    let response: any;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        response = await ai.models.generateContent({ model, config, contents });
        break;
      } catch (genErr: any) {
        const status = genErr?.status || genErr?.code || 500;
        console.error(`[character-image] attempt ${attempt} failed`, { status, message: genErr?.message });
        if (attempt < maxAttempts && attemptIsRetriable(status)) {
          await sleep(400 * attempt);
          continue;
        }
        return NextResponse.json({ error: 'AI generation failed', details: genErr?.message || 'unknown' }, { status: 502 });
      }
    }

    // Extract inline image data (base64) from candidates
    const r: any = response as any;
    const parts: any[] = r?.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find((p: any) => p?.inlineData?.data);

    const base64: string | undefined = imgPart?.inlineData?.data;
    const mimeType: string = imgPart?.inlineData?.mimeType || 'image/png';

    if (!base64) {
      // If only text returned, surface it for debugging
      const textOut: string | undefined = r?.text || r?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('\n');
      return NextResponse.json({ error: 'No image returned from model', text: textOut }, { status: 502 });
    }

    const dataUrl = `data:${mimeType};base64,${base64}`;
    if (projectId) {
      // Fetch target character FIRST to compute a stable path and avoid orphan files
      const { data: existing } = await supabase
        .from('characters')
        .select('id,image_path,name')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .eq('name', name || 'Character')
        .single();
      if (!existing) return NextResponse.json({ error: 'Character not found to update image' }, { status: 404 });

      const buffer = Buffer.from(base64, 'base64');
      // Use stable path per character; overwrite the same object each time
      const safeName = (name || 'character').replace(/\s+/g, '_');
      const stablePath = existing.image_path || `users/${user.id}/projects/${projectId}/characters/${safeName}_${existing.id}.png`;
      const upload = await supabase.storage.from('webtoon').upload(stablePath, buffer, { contentType: mimeType, upsert: true });
      if (upload.error) {
        return NextResponse.json({ error: upload.error.message || 'Upload failed' }, { status: 500 });
      }

      const now = new Date().toISOString();
      await supabase.from('characters').update({
        description,
        art_style: artStyle || null,
        image_path: stablePath,
        updated_at: now,
      }).eq('id', existing.id);
      await supabase.from('projects').update({ updated_at: now }).eq('id', projectId).eq('user_id', user.id);
      try {
        await supabase.rpc('increment_monthly_usage');
      } catch {}
      return NextResponse.json({ success: true, image: dataUrl, path: stablePath });
    }

    // No projectId provided: just return image data without storage persistence
    try {
      await supabase.rpc('increment_monthly_usage');
    } catch {}
    return NextResponse.json({ success: true, image: dataUrl });
  } catch (error: unknown) {
    const err = error as any;
    return NextResponse.json(
      { error: "Failed to generate image", details: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}


