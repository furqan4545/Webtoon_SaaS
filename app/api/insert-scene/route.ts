import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

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
    const { scenes, insertAfterIndex } = await request.json();
    if (!Array.isArray(scenes) || scenes.length === 0 || typeof insertAfterIndex !== 'number') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const apiKey = (process.env.OPENAI_API_KEY || "").replace(/["'“”]/g, "").trim();
    if (!apiKey) return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });

    const openai = new OpenAI({ apiKey });
    const scenesJson = JSON.stringify(scenes);

    const systemPrompt = sanitize(
      'You are a professional storyboard artist. Insert ONE new scene between two existing scenes so the flow is smooth. Return JSON ONLY.'
    );
    const userPrompt = sanitize(
      `CURRENT SCENES (ordered JSON):\n${scenesJson}\n\nINSERT AFTER INDEX (0-based): ${insertAfterIndex}\n\nREQUIREMENTS:\n- Create exactly one new scene that fits logically after scene_${insertAfterIndex + 1}.\n- Preserve continuity (characters, location, time).\n- Keep Story_Text (1-2 sentences) and Scene_Description (2-4 sentences focused on visuals for image generation).\n\nOUTPUT JSON ONLY:\n{ "scene": { "Story_Text": "", "Scene_Description": "" } }`
    );

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 800,
    });

    const content = completion.choices[0]?.message?.content || '';
    if (!content) return NextResponse.json({ error: 'No response' }, { status: 502 });
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) return NextResponse.json({ error: 'Invalid JSON' }, { status: 502 });
      parsed = JSON.parse(m[0]);
    }
    if (!parsed?.scene) return NextResponse.json({ error: 'Missing scene' }, { status: 502 });
    return NextResponse.json({ success: true, scene: parsed.scene });
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to insert scene', details: e?.message || 'Unknown' }, { status: 500 });
  }
}


