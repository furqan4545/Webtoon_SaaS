import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

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
      `You are generating a consistent WEBTOON character model sheet for production. Render a single, front-facing character with clean line art and flat colors, maintaining stable identity markers so the character remains consistent across scenes. Avoid multiple characters, busy backgrounds, watermarks, or text.`
    );

    const prompt = sanitize(
      `${systemInstruction}\n\nCharacter name: ${name || "Unnamed"}.\nCharacter description: ${description}.\nDesired style: webtoon, clean outlines, expressive face, readable silhouette, studio sheet white background.`
    );

    // Use the official SDK per docs: https://googleapis.github.io/js-genai/ and npm page
    const ai = new GoogleGenAI({ apiKey });
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

    const response = await ai.models.generateContent({ model, config, contents });

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

    return NextResponse.json({ success: true, image: dataUrl });
  } catch (error: unknown) {
    const err = error as any;
    return NextResponse.json(
      { error: "Failed to generate image", details: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}


