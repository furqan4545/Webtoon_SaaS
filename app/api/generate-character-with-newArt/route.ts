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
    const body = await request.json();
    const description: string | undefined = body?.description;
    const name: string | undefined = body?.name;
    const artStyle: string | undefined = body?.artStyle;

    const rawKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
    const apiKey = rawKey.replace(/["'“”]/g, "").trim();
    if (!apiKey) {
      return NextResponse.json({ error: "Google Generative AI API key not configured" }, { status: 500 });
    }
    if (!description) {
      return NextResponse.json({ error: "Character description is required" }, { status: 400 });
    }

    const systemInstruction = sanitize(
      `You are generating a consistent character model sheet for production. Render a single, front-facing character with expressive face, studio sheet white background.`
    );

    const styleText = sanitize(artStyle || "webtoon, clean outlines, expressive, flat cel shading");

    const prompt = sanitize(
      `${systemInstruction}\n\nCharacter name: ${name || "Unnamed"}.\nCharacter description: ${description}.\nDesired style: ${styleText}.`
    );

    const ai = new GoogleGenAI({ apiKey });
    const model = 'gemini-2.5-flash-image-preview';
    const config = { responseModalities: ['IMAGE', 'TEXT'] } as any;
    const contents = [{ role: 'user', parts: [{ text: prompt }] }];

    const response = await ai.models.generateContent({ model, config, contents });
    const r: any = response as any;
    const parts: any[] = r?.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find((p: any) => p?.inlineData?.data);
    const base64: string | undefined = imgPart?.inlineData?.data;
    const mimeType: string = imgPart?.inlineData?.mimeType || 'image/png';
    if (!base64) {
      const textOut: string | undefined = r?.text || r?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('\n');
      return NextResponse.json({ error: 'No image returned from model', text: textOut }, { status: 502 });
    }
    const dataUrl = `data:${mimeType};base64,${base64}`;
    return NextResponse.json({ success: true, image: dataUrl }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to generate character with new art style', details: error?.message || 'Unknown' }, { status: 500 });
  }
}


