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
      "You analyze stories and produce a compact WEBTOON character bible with a single, consistent art direction. Read carefully, infer missing specifics, and return JSON only that follows the schema. Keep outputs concise, visual, and production-ready."
    );
    
    const userPrompt = sanitizeText(
      `SOURCE STORY (full text):
    ${sanitizedStory}
    
    TASK
    Create a unified WEBTOON character bible. First, infer a single shared art style from the story's genre, tone, era, and culture. Then list up to 6 distinct living entities that appear or are explicitly mentioned as individuals (humans, humanoids, creatures, spirits, animals). Merge aliases/titles into one identity. If unnamed, assign "Entity 1", "Entity 2", ... by narrative importance. Choose specific plausible values; never use placeholders.
    
    STYLE LOCK (applies to every character)
    - Linework: define weight/cleanliness.
    - Color: flat/cell shading typical of WEBTOON; limited, reusable palette.
    - Finish: minimal background noise; production sheet clarity.
    - Consistency tokens: 5–10 short tags that anchor look across generations (e.g., era, fashion lane, rendering cues).
    - Canonical prompt prefix: a single sentence that precedes any character prompt to keep style unified.
    
    For each character, provide stable visual anchors and wardrobe baselines so future generations match. Keep language positive and descriptive (no “avoid/without/not”). Keep each description ~120–160 words.
    
    OUTPUT FORMAT (JSON ONLY)
    {
      "story_title": string,
      "style_bible": {
        "art_style_summary": string,            // one paragraph describing the shared look
        "consistency_tokens": [string],         // 5–10 compact tags for style lock
        "canonical_prompt_prefix": string       // one sentence to prepend to any render
      },
      "total_characters": number,
      "characters": [
        {
          "id": "c1",
          "name": string,
          "role": string,                       // species + function, e.g., "human botanist", "forest spirit guide"
          "gender": "male" | "female",
          "story_context": string,              // 1–2 sentences: where they fit in this story
          "identity_marks": [string],           // 1–2 distinctive, persistent markers (e.g., scar under left eye)
          "build_and_age": string,              // age band + height/build impression
          "head_and_face": string,              // shape, eyes, nose, lips/brow; or species-appropriate equivalents
          "hair_or_fur": string,                // length/silhouette/part/crest
          "wardrobe_baseline": [string],        // 2–4 recurring clothing items described abstractly
          "canonical_palette": [string],        // 3–5 hex codes like "#RRGGBB"
          "signature_props": [string],          // optional recurring gear/props
          "pose_and_vibe": string,              // movement/posture that matches personality
          "render_sheet_prompts": {
            "front": string,                    // one line using canonical_prompt_prefix + identity tokens
            "left_profile": string,
            "right_profile": string,
            "three_quarter": string
          },
          "prompt_tags": [string]               // 6–12 compact tags for this character (adds to consistency_tokens)
        }
      ]
    }
    
    CONSTRAINTS
    - Return JSON only. No markdown, comments, or extra keys.
    - Keep all characters aligned to the shared style_bible (same finish, palette logic, and prompt prefix).
    - All color values must be hex codes where applicable.
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
