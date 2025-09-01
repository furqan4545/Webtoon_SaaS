import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

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
    const { sceneDescription, storyText, characterImages } = await request.json();
    if (!sceneDescription || !storyText) {
      return NextResponse.json({ error: "sceneDescription and storyText are required" }, { status: 400 });
    }

    const rawKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
    const apiKey = rawKey.replace(/["'“”]/g, "").trim();
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API key not configured" }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = 'gemini-2.5-flash-image-preview';
    const config = { responseModalities: ['IMAGE', 'TEXT'] } as any;

    const refsList = Array.isArray(characterImages)
      ? characterImages.filter((c: any) => !!c?.dataUrl)
      : [];

    const prompt = sanitize(
      `You are generating a single WEBTOON panel for a vertical-scroll comic.\nKeep the SAME PERSON as in provided references. Do NOT change hair length/color or fringe shape. Keep the same eye spacing, brow thickness, jawline, and any unique marks.\nStyle: clean webtoon line art, flat cel shading, high mobile readability. DO NOT INCLUDE TEXT.\n\nScene Description: ${sceneDescription}\nStory Text: ${storyText}`
    );

    // parts: text + inline images for each character reference
    const parts: any[] = [{ text: prompt }];
    for (const ref of refsList) {
      const [meta, b64] = String(ref.dataUrl).split(",");
      const mime = meta?.match(/data:(.*?);base64/)?.[1] || 'image/png';
      if (b64) {
        parts.push({ inlineData: { mimeType: mime, data: b64 } });
      }
    }

    const contents = [{ role: 'user', parts }];
    const response = await ai.models.generateContent({ model, config, contents });
    const r: any = response as any;
    const imgPart = r?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data);
    const base64: string | undefined = imgPart?.inlineData?.data;
    const mimeType: string = imgPart?.inlineData?.mimeType || 'image/png';
    if (!base64) {
      const textOut: string | undefined = r?.text || r?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('\n');
      return NextResponse.json({ error: 'No image returned from model', text: textOut }, { status: 502 });
    }
    const dataUrl = `data:${mimeType};base64,${base64}`;
    return NextResponse.json({ success: true, image: dataUrl });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to generate scene image', details: error?.message || 'Unknown' }, { status: 500 });
  }
}


