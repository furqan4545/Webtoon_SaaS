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
    const { imageDataUrl, instruction } = await request.json();
    if (!imageDataUrl || typeof imageDataUrl !== 'string') {
      return NextResponse.json({ error: 'imageDataUrl is required' }, { status: 400 });
    }
    const rawKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
    const apiKey = rawKey.replace(/["'“”]/g, "").trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = 'gemini-2.5-flash-image-preview';
    const config = { responseModalities: ['IMAGE', 'TEXT'] } as any;

    const [meta, b64] = String(imageDataUrl).split(',');
    const mime = meta?.match(/data:(.*?);base64/)?.[1] || 'image/png';
    if (!b64) {
      return NextResponse.json({ error: 'Invalid imageDataUrl' }, { status: 400 });
    }

    const sys = sanitize(
      `Keep the existing image settings. Do not modify composition, character identity, or style. Apply ONLY the requested update to the given image.`
    );
    const userInstruction = sanitize(String(instruction || ''));
    const text = userInstruction ? `${sys}\nUpdate: ${userInstruction}` : sys;

    const parts: any[] = [
      { text },
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
    return NextResponse.json({ success: true, image: dataUrl }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to edit scene image', details: error?.message || 'Unknown' }, { status: 500 });
  }
}


