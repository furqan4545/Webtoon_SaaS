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
    //   "You are an expert character & creature analyst for WEBTOON production. Return ONLY JSON strictly following the required schema."
    // );
    
    // const userPrompt = sanitizeText(
    //   `SOURCE STORY (full text):\n${sanitizedStory}\n\nINSTRUCTIONS:\n\n- Identify unique living beings who appear on-page or are explicitly mentioned as individuals. This includes humans, humanoids, monsters, animals, spirits, and other living creatures. Exclude inanimate objects, locations, organizations, generic crowds, and purely conceptual entities.\n- Merge aliases and titles into a single identity.\n- If a name exists, use it. Otherwise assign "Entity 1", "Entity 2", ... in order of narrative importance.\n- Infer missing traits from role, personality, era, culture, and species. Never write "unknown"; choose a specific plausible value.\n- Keep gender strictly "male" or "female" (infer from cues even for non-human creatures).\n- Limit the total to at most 6 entities (rank by importance).\n\n"Character_Description" MUST be one paragraph (120–200 words) that enables consistent visual generation. It must cover:\n* role/occupation/archetype and story relevance (for creatures, include species and whether sentient/animalistic)\n* age range (or life stage) and overall size/height/build impression\n* ethnicity/culture cues for humans/humanoids (skin undertone, hair texture); for non-humans, natural coloration/patterns (fur/scale/feather/skin)\n* facial/head features: for humans—face shape, jaw, nose type, brow thickness, eye shape/size, lip shape; for non-humans—species-appropriate equivalents (muzzle/snout/beak, ear type, crest/horns, eye set/shape, dentition)\n* hair/fur/manes/feathers: length, silhouette, parting/crest/fringe\n* 1–2 unique, stable marks for identity anchoring (mole/scar/streak/notch/patch)\n* default outfit and 2–4 hex color codes like #RRGGBB (for non-clothed creatures, give a natural palette with hex codes)\n* signature props or gear if implied (e.g., staff, collar, saddle, necklace)\n* overall vibe/posture/movement cues (e.g., confident stride, skittish, predatory prowl)\n\nOUTPUT FORMAT (JSON ONLY, no trailing commas):\n{\n"story_title": string,\n"total_characters": number,\n"characters": [\n  {\n    "id": "c1",\n    "name": string,\n    "role": string,\n    "gender": "male" | "female",\n    "Character_Description": string\n  }\n]\n}\n\nCONSTRAINTS:\n- Return ONLY JSON—no markdown, no comments, no extra keys.\n- The "role" should concisely state species + function (e.g., "human botanist", "wolf pack leader", "ancient forest spirit").`
    // );

    const systemPrompt = sanitizeText(
      "You are an expert WEBTOON character/creature analyst. Read the story and return ONLY JSON following the schema exactly. Keep language positive and descriptive (no negatives). Do not include art style, ethnicity, palettes, or rendering instructions."
    );
    
    const userPrompt = sanitizeText(
      `SOURCE STORY (full text):
    ${sanitizedStory}
    
    TASK
    Identify up to 6 distinct living entities that appear on-page or are explicitly mentioned (humans, humanoids, animals, spirits, creatures). Merge aliases/titles into one identity. If unnamed, assign "Entity 1", "Entity 2", ... by narrative importance. Choose specific plausible values; never output placeholders.
    
    "Character_Description" MUST be a single paragraph (120–160 words) focused ONLY on narrative and consistency—not visual style. Cover:
    • role/function in the story and current goal
    • relationships to other named entities (allies, rivals, family, mentor, etc.)
    • personality and recurring behaviors (speech patterns, mannerisms)
    • recurring wardrobe items by category (e.g., hooded jacket, utility belt, school uniform)—no colors or style tags
    • recurring props/gear (e.g., notebook, staff, whistle) if implied
    • recurring settings where the character is usually found (school, dojo, forest outpost) when clear
    
    OUTPUT FORMAT (JSON ONLY, no trailing commas):
    {
      "story_title": string,
      "total_characters": number,
      "characters": [
        {
          "id": "c1",
          "name": string,
          "role": string,                     
          "gender": "male" | "female",
          "Character_Description": string       // REQUIRED: one paragraph, 120–160 words.
        }
      ]
    }
    
    CONSTRAINTS
    - Return JSON only. No markdown, comments, or extra keys.
    - Keep all content grounded in the story; infer specifics from context.
    - Do NOT include art style, ethnicity/culture, color palettes, shading, camera angles, lighting, or rendering terms.
    - Limit to at most 6 characters, ranked by story importance.`
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
