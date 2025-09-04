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
    const body = await request.json();
    const projectId: string | undefined = body?.projectId;
    const name: string | undefined = body?.name;
    const description: string | undefined = body?.description;
    const artStyle: string | undefined = body?.artStyle;
    if (!projectId || !name || !description || !artStyle) return NextResponse.json({ error: 'projectId, name, description and artStyle required' }, { status: 400 });

    const rawKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
    const apiKey = rawKey.replace(/["'“”]/g, "").trim();
    if (!apiKey) return NextResponse.json({ error: "Google Generative AI API key not configured" }, { status: 500 });

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Find the specific character row to update
    const { data: existing } = await supabase
      .from('characters')
      .select('id,name,description,image_path')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .eq('name', name)
      .single();
    if (!existing) return NextResponse.json({ error: 'Character not found' }, { status: 404 });

    // Generate image for this character with new art style
    const ai = new GoogleGenAI({ apiKey });
    const model = 'gemini-2.5-flash-image-preview';
    const config = { responseModalities: ['IMAGE', 'TEXT'] } as any;
    const systemInstruction = sanitize(
      `You are generating a consistent character model sheet for production. Render a single, front-facing character with clean line art and flat colors, stable identity markers, studio white background.`
    );
    const styleText = sanitize(artStyle || "webtoon, clean outlines, expressive, flat cel shading");
    const prompt = sanitize(`${systemInstruction}\n\nCharacter name: ${name}.\nCharacter description: ${description}.\nDesired style: ${styleText}.`);
    const response = await ai.models.generateContent({ model, config, contents: [{ role: 'user', parts: [{ text: prompt }] }] });
    const r: any = response as any;
    const parts: any[] = r?.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find((p: any) => p?.inlineData?.data);
    const base64: string | undefined = imgPart?.inlineData?.data;
    const mimeType: string = imgPart?.inlineData?.mimeType || 'image/png';
    if (!base64) return NextResponse.json({ error: 'No image returned from model' }, { status: 502 });

    const buffer = Buffer.from(base64, 'base64');
    const safeName = String(name || 'character').replace(/\s+/g, '_');
    const stablePath = existing.image_path || `users/${user.id}/projects/${projectId}/characters/${safeName}_${existing.id}.png`;
    const upload = await supabase.storage.from('webtoon').upload(stablePath, buffer, { contentType: mimeType, upsert: true });
    if (upload.error) return NextResponse.json({ error: upload.error.message || 'Upload failed' }, { status: 500 });

    const now = new Date().toISOString();
    await supabase
      .from('characters')
      .update({ art_style: artStyle, image_path: stablePath, updated_at: now })
      .eq('id', existing.id)
      .eq('user_id', user.id);
    // Update art style tables as requested (no upsert)
    await supabase.from('art_styles').update({ description: artStyle, updated_at: now }).eq('project_id', projectId).eq('user_id', user.id);
    await supabase.from('projects').update({ art_style: artStyle, updated_at: now }).eq('id', projectId).eq('user_id', user.id);

    const dataUrl = `data:${mimeType};base64,${base64}`;
    return NextResponse.json({ success: true, image: dataUrl, path: stablePath });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to regenerate characters with new art style', details: error?.message || 'Unknown' }, { status: 500 });
  }
}


