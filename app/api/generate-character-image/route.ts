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

    const systemInstruction = sanitize(
      `You are generating a consistent character model sheet for production. Render a single, front-facing character with clean line art and flat colors, maintaining stable identity markers so the character remains consistent across scenes. Avoid multiple characters, busy backgrounds, watermarks, or text.`
    );

    const prompt = sanitize(
      `${systemInstruction}\n\nCharacter name: ${name || "Unnamed"}.\nCharacter description: ${description}.\nDesired art style: ${(artStyle || '').trim() || 'clean outlines, expressive face, readable silhouette'}.\nUse a studio sheet white background.`
    );

    // Use the official SDK per docs: https://googleapis.github.io/js-genai/ and npm page
    const ai = new GoogleGenAI({ apiKey });
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // Quota check (use absolute URL from the incoming request)
    let usage: any = null;
    try {
      const reqUrl = new URL(request.url);
      const base = `${reqUrl.protocol}//${reqUrl.host}`;
      const usageRes = await fetch(`${base}/api/usage`, { cache: 'no-store' });
      usage = await usageRes.json();
    } catch {}
    if (usage && usage.remaining !== undefined && Number(usage.remaining) <= 0) {
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

    let response: any;
    try {
      response = await ai.models.generateContent({ model, config, contents });
    } catch (genErr: any) {
      console.error('gemini generate error', genErr?.message || genErr);
      return NextResponse.json({ error: 'AI generation failed', details: genErr?.message || 'unknown' }, { status: 502 });
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
    // Save to Storage and characters table
    const buffer = Buffer.from(base64, 'base64');
    const path = `users/${user.id}/projects/${projectId || 'default'}/characters/${(name || 'character').replace(/\s+/g, '_')}_${Date.now()}.png`;
    const { data: uploaded, error: upErr } = await supabase.storage.from('webtoon').upload(path, buffer, {
      contentType: mimeType,
      upsert: false,
    });
    if (upErr) {
      // If a file with the same name exists (unlikely due to timestamp), fall back to a unique name
      console.error('storage upload error', upErr);
      const altPath = `users/${user.id}/projects/${projectId || 'default'}/characters/${(name || 'character').replace(/\s+/g, '_')}_${Date.now()}_${Math.floor(Math.random()*1000)}.png`;
      const retry = await supabase.storage.from('webtoon').upload(altPath, buffer, { contentType: mimeType, upsert: false });
      if (!retry.error) {
        return NextResponse.json({ success: true, image: dataUrl, path: retry.data?.path || altPath });
      }
    }
    if (projectId) {
      const now = new Date().toISOString();
      const newPath = uploaded?.path || path;
      // Update only if exists; remove old image if replacing. Do NOT insert new rows here.
      const { data: existing } = await supabase
        .from('characters')
        .select('id,image_path')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .eq('name', name || 'Character')
        .single();
      if (existing) {
        if (existing.image_path && existing.image_path !== newPath) {
          try { await supabase.storage.from('webtoon').remove([existing.image_path]); } catch {}
        }
        await supabase.from('characters').update({
          description,
          art_style: artStyle || null,
          image_path: newPath,
          updated_at: now,
        }).eq('id', existing.id);
      } else {
        return NextResponse.json({ error: 'Character not found to update image' }, { status: 404 });
      }
      await supabase.from('projects').update({ updated_at: now }).eq('id', projectId).eq('user_id', user.id);
    }
    try {
      const reqUrl = new URL(request.url);
      const base = `${reqUrl.protocol}//${reqUrl.host}`;
      await fetch(`${base}/api/usage`, { method: 'POST' });
    } catch {}
    return NextResponse.json({ success: true, image: dataUrl, path });
  } catch (error: unknown) {
    const err = error as any;
    return NextResponse.json(
      { error: "Failed to generate image", details: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}


