import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// Replace problematic unicode with ASCII and strip non-ASCII
function sanitizeText(text: string): string {
  if (!text) return "";
  let out = text
    .replace(/[\u2010-\u2015\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2026]/g, "...")
    .replace(/[\u00A0\u2000-\u200B\u2028\u2029]/g, " ")
    .replace(/[\u2022\u00B7\u2023\u2043]/g, "*")
    .replace(/[\u00AB\u00BB]/g, '"')
    .replace(/[\u2039\u203A]/g, "'")
    .replace(/[\u00A9\u00AE\u2122]/g, "")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  out = out
    .split("")
    .filter((c) => {
      const code = c.charCodeAt(0);
      return code >= 32 && code <= 126;
    })
    .join("");
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const story: string | undefined = body?.story;
    const artStyle: string | undefined = body?.artStyle;

    const rawApiKey = process.env.OPENAI_API_KEY || "";
    const sanitizedApiKey = rawApiKey.replace(/["'“”]/g, "").trim();
    if (!sanitizedApiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    if (!story) {
      return NextResponse.json(
        { error: "Story content is required" },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey: sanitizedApiKey });

    const sanitizedStory = sanitizeText(story);
    const sanitizedArtStyle = sanitizeText(artStyle || "webtoon");

    const systemPrompt = sanitizeText(
      "You are an expert character analyst for WEBTOON production. Return ONLY JSON strictly following the required schema."
    );

    const userPrompt = sanitizeText(
      `SOURCE STORY (full text):\n${sanitizedStory}\n\nINSTRUCTIONS:\n\n- Identify unique human/humanoid characters who appear or speak. Merge aliases into one.\n- If a name exists, use it. Otherwise assign "Person 1", "Person 2", ... in order of importance.\n- Infer missing traits from role, personality, era, culture. Never write "unknown"; pick a reasonable specific value.\n- Keep gender strictly "male" or "female".\n- Limit to at most 6 characters (rank by importance).\n\n"Character_Description" MUST be one paragraph (120-200 words) covering:\n* role/occupation/archetype and story relevance\n* age range and overall height/build impression\n* ethnicity/culture cues (skin undertone, hair texture)\n* face shape, jaw, nose type, brow thickness, eye shape/size, lip shape\n* hair length, silhouette, parting, fringe\n* 1-2 unique, stable marks (mole/scar/streak) for identity anchoring\n* default outfit with 2-4 hex color codes like #RRGGBB\n* signature props if implied\n* overall vibe/posture/movement cues\n\nOUTPUT FORMAT (JSON ONLY, no trailing commas):\n{\n"story_title": string,\n"total_characters": number,\n"characters": [\n  {\n    "id": "c1",\n    "name": string,\n    "role": string,\n    "gender": "male" | "female",\n    "Character_Description": string\n  }\n]\n}\n\nCONSTRAINTS:\n- Return ONLY JSON. No extra keys. No markdown. No prose.`
    );

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 2000,
    });

    const content = completion.choices[0]?.message?.content || "";
    if (!content) {
      return NextResponse.json(
        { error: "No response from OpenAI" },
        { status: 502 }
      );
    }

    // Try to parse JSON strictly; else try to extract
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        return NextResponse.json(
          { error: "Invalid JSON from OpenAI" },
          { status: 502 }
        );
      }
    }

    if (!parsed?.characters || !Array.isArray(parsed.characters)) {
      return NextResponse.json(
        { error: "Response missing characters array" },
        { status: 502 }
      );
    }

    const validatedCharacters = parsed.characters.map((c: any, i: number) => ({
      id: c.id || `character_${i + 1}`,
      name: c.name || `Character ${i + 1}`,
      description: c.Character_Description || c.description || "",
    }));

    return NextResponse.json({ success: true, characters: validatedCharacters });
  } catch (error: unknown) {
    const err = error as any;
    const code = err?.code || err?.error?.code;
    const status = err?.status || err?.response?.status;
    if (code === "insufficient_quota" || status === 429) {
      return NextResponse.json(
        { error: "OpenAI quota exceeded. Check billing/project key." },
        { status: 429 }
      );
    }
    console.error("Error analyzing story:", error);
    return NextResponse.json(
      { error: "Failed to analyze story", details: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
