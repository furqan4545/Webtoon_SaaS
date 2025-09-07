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

    // const systemPrompt = sanitizeText(
    //   "You are an expert character analyst for WEBTOON production. Return ONLY JSON strictly following the required schema."
    // );

    // const userPrompt = sanitizeText(
    //   `SOURCE STORY (full text):\n${sanitizedStory}\n\nINSTRUCTIONS:\n\n- Identify unique human/humanoid characters who appear or speak. Merge aliases into one.\n- If a name exists, use it. Otherwise assign "Person 1", "Person 2", ... in order of importance.\n- Infer missing traits from role, personality, era, culture. Never write "unknown"; pick a reasonable specific value.\n- Keep gender strictly "male" or "female".\n- Limit to at most 6 characters (rank by importance).\n\n"Character_Description" MUST be one paragraph (120-200 words) covering:\n* role/occupation/archetype and story relevance\n* age range and overall height/build impression\n* ethnicity/culture cues (skin undertone, hair texture)\n* face shape, jaw, nose type, brow thickness, eye shape/size, lip shape\n* hair length, silhouette, parting, fringe\n* 1-2 unique, stable marks (mole/scar/streak) for identity anchoring\n* default outfit with 2-4 hex color codes like #RRGGBB\n* signature props if implied\n* overall vibe/posture/movement cues\n\nOUTPUT FORMAT (JSON ONLY, no trailing commas):\n{\n"story_title": string,\n"total_characters": number,\n"characters": [\n  {\n    "id": "c1",\n    "name": string,\n    "role": string,\n    "gender": "male" | "female",\n    "Character_Description": string\n  }\n]\n}\n\nCONSTRAINTS:\n- Return ONLY JSON. No extra keys. No markdown. No prose.`
    // );

    const systemPrompt = sanitizeText(
      "You are an expert character and creature analyst for WEBTOON production. Return ONLY JSON strictly following the required schema. Your output must be parseable without errors."
    );

    const userPrompt = sanitizeText(
      `SOURCE STORY (full text):\n${sanitizedStory}\n\nINSTRUCTIONS:\n\n- Identify unique living creatures who appear or are explicitly mentioned. This includes humans, monsters, animals or any living creature.\n- Merge aliases or general descriptions (e.g., "a large man" and "the warrior") into one character entry.\n- Infer all missing traits from role, personality, context, and environment. Never write "unknown"; provide a reasonable, specific value for every field.\n- Limit to at most 6 creatures, ranked by importance.\n\nJSON SCHEMA:\n{\n  "story_title": string,\n  "total_creatures": number,\n  "creatures": [\n    {\n      "id": "c1" | "c2" | "c3"...,\n      "name": string,\n      "type": "human" | "monster" | "animal",\n      "role": string,\n      "gender": "male" | "female" | "na",\n      "physical_attributes": {\n        "species": string,\n        "build": string,\n        "height_impression": string,\n        "surface_texture": string,\n        "unique_marks": string,\n        "dominant_colors": string[],\n        "sig_props": string[]\n      },\n      "personality_attributes": {\n        "archetype": string,\n        "vibe_or_posture": string\n      }\n    }\n  ]\n}\n\nDETAILS FOR SCHEMA FIELDS:\n- "name": Use the character's name. If none is given, assign a descriptive name like "The Brutehorn" or "The Awakened Man".\n- "type": Classify the creature as "human," "monster," or "animal."\n- "role": A short phrase describing their function (e.g., "Protagonist", "Antagonist", "Supporting Character", "Background Creature").\n- "gender": Use "male" or "female" if stated or heavily implied. Use "na" for creatures where gender is irrelevant or not discernible.\n- "species": A specific name for the creature's kind (e.g., "human", "Gilded Golem", "Brutehorn").\n- "build": Describe their physical form (e.g., "athletic", "slender", "lumbering mass of muscle and bone").\n- "height_impression": A relative term for their height (e.g., "average height", "towering", "small").\n- "surface_texture": What their skin, scales, or surface feels like (e.g., "smooth skin", "impenetrable hide", "stone plating").\n- "unique_marks": Any specific, stable marks (e.g., "deep scar over left eye", "glowing runes on chest", "mole below the lip"). If none are present, provide a logical inference like "none mentioned, but a key identifying feature is their scythe".\n- "dominant_colors": A list of up to 4 hex color codes for their defining visual elements (e.g., outfit, fur, armor). Do not include any text, only the hex codes in a string array.\n- "sig_props": A list of 1-3 signature items they carry or use (e.g., ["sword", "scythe", "mana potion pouch"]).\n- "archetype": A classic role they fill (e.g., "Hero", "Brute", "Rival").\n- "vibe_or_posture": A general impression of their demeanor (e.g., "cautious and alert", "menacing and cruel", "lumbering and savage").\n\nCONSTRAINTS:\n- Return ONLY JSON. No extra keys. No markdown. No prose. Your response must begin with '{' and end with '}'.`
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
    console.log("content:", content);
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
