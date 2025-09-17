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
    const { story } = await request.json();
    if (!story) {
      return NextResponse.json({ error: "Story is required" }, { status: 400 });
    }

    const rawKey = process.env.OPENAI_API_KEY || "";
    const apiKey = rawKey.replace(/["'“”]/g, "").trim();
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
    }

    const openai = new OpenAI({ apiKey });

    // const systemPrompt = sanitize(
    //   `You are a professional storyboard artist. Split the story into clear SCENES and return JSON ONLY.`
    // );

    const systemPrompt = sanitize(`
      You are a professional WEBTOON storyboard artist and beat editor.
      Your job: split a narrative into ATOMIC, vertical-reading panels (one beat per scene) optimized for later image generation.
      Never merge multiple actions into one scene. Output STRICT JSON only (no prose, no markdown).
      `);
      

    // const userPrompt = sanitize(
    //   `SOURCE STORY (full text):\n${story}\n\nINSTRUCTIONS:\n- Break the story into 6-12 scenes based on location/time/goal shifts.\n- For each scene, produce:\nStory_Text: 1-3 sentences summarizing what happens in this scene (pulled/paraphrased from the story)\nDescription: 2-4 sentences for AI image generation that specify camera angle, shot type, lighting, key visuals, character positioning/expressions, and environment details.\n\n- Return STRICT JSON only (UTF-8, no trailing commas, no markdown).\nOUTPUT FORMAT (JSON ONLY):\n{\n  "story_title": "",\n  "total_scenes": <NUM OF SCENES>,\n  "scenes": {\n        "scene_1" : {"Story_Text" : "", "Scene_Description": "" },\n        "scene_2": {"Story_Text" : "", "Scene_Description": "" }\n  }\n}`
    // );

    // const userPrompt = sanitize(
    //   `SOURCE STORY (full text):\n${story}\n\nINSTRUCTIONS:\n- Break the story into multiple scenes depending on the length of the story. The story should be minimum 6 scenes and maximum could be 24, break scenes based on location/time/goal shifts.\n- For each scene, produce:\nStory_Text: 2-4 sentences about what happened in this scene (pulled from the story)\nDescription: 1-2 sentences for AI image generation that specify  shot type, lighting, key visuals, character positioning/expressions, and environment details, we need to make sure character is not looking at camera.. it should be webtoon story type shot. \n\n- Return STRICT JSON only (UTF-8, no trailing commas, no markdown).\nOUTPUT FORMAT (JSON ONLY):\n{\n  "story_title": "",\n  "total_scenes": <NUM OF SCENES>,\n  "scenes": {\n        "scene_1" : {"Story_Text" : "", "Scene_Description": "" },\n        "scene_2": {"Story_Text" : "", "Scene_Description": "" }\n  }\n}`
    // );


    const userPrompt = sanitize(`
      SOURCE STORY (full text):
      ${story}
      
      OBJECTIVE
      - Convert the story into a sequence of ATOMIC scenes (webtoon panels).
      - Each scene = exactly ONE visual beat (an action OR a reaction OR a decisive emotion shift).
      
      SCENE SPLITTING RULES
      1) One beat per scene. If A acts and B reacts, that's two scenes.
      2) Split on changes in location, time, goal, focal subject, or emotional state.
      3) Keep 6–24 scenes. Prefer more simple beats over fewer overloaded ones.
      4) Maintain continuity: names/roles/props remain consistent across scenes.
      
      TEXT FIDELITY (NO VAGUENESS)
      - We feed **Story_Text** directly into image generation. It must be a concrete, visual description of what is happening *now* in this scene.
      - Avoid abstract summaries (e.g., “things get tense”). Instead, describe observable, draw-able facts (who/what/where/body language/prop).
      
      FIELD DEFINITIONS
      - **Story_Text** (CONCRETE VISUAL FACT SENTENCE):
        - 1–2 sentences, 25–55 words total, present tense, third person.
        - Must include: [who (use names or a consistent noun phrase)] + [single key action] + [object/target] + [clear setting cue] + [visible emotion/expression or body language] + [1 salient prop or detail if relevant].
        - No internal thoughts (show, don't tell). No future/references to other scenes. No multiple chained actions with “and then”. Minimal adverbs; prefer strong verbs and nouns.
        - If names are absent, invent short consistent labels (e.g., “the young chef”, “the tired office worker”) and reuse exactly.
      
      - **Scene_Description** (CAMERA/ART DIRECTION):
        - 1–2 sentences for the illustrator. Include shot type (WS/MS/CU/ECU/OTS), angle (eye/low/high), lighting/mood, composition cues, character pose/expression, essential environment.
        - Webtoon framing: vertical readability, some negative space, no direct-to-camera gaze, no text overlays/captions.
      
      QUALITY CHECKS (BEFORE RETURN)
      - [✓] Exactly one beat per scene; no setup+payoff in the same scene.
      - [✓] 6 ≤ total_scenes ≤ 24 and equals the number of scene entries.
      - [✓] **Story_Text** is concrete, visual, and self-sufficient (draw-able without the rest of the story).
      - [✓] No extra keys, no markdown, no commentary, valid JSON (UTF-8, no trailing commas).
      
      OUTPUT FORMAT (JSON ONLY):
      {
        "story_title": "",
        "total_scenes": <INT>,
        "scenes": {
          "scene_1": { "Story_Text": "", "Scene_Description": "" },
          "scene_2": { "Story_Text": "", "Scene_Description": "" }
        }
      }
      `);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 3000,
    });

    const content = completion.choices[0]?.message?.content || "";
    if (!content) return NextResponse.json({ error: "No response" }, { status: 502 });

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) return NextResponse.json({ error: "Invalid JSON" }, { status: 502 });
      parsed = JSON.parse(m[0]);
    }

    if (!parsed?.scenes) {
      return NextResponse.json({ error: "Missing scenes" }, { status: 502 });
    }

    return NextResponse.json({ success: true, scenes: parsed.scenes, story_title: parsed.story_title, total_scenes: parsed.total_scenes });
  } catch (error: any) {
    const code = error?.code || error?.status;
    if (code === 429) {
      return NextResponse.json({ error: "OpenAI quota exceeded" }, { status: 429 });
    }
    return NextResponse.json({ error: "Failed to generate scenes", details: error?.message || "Unknown" }, { status: 500 });
  }
}


