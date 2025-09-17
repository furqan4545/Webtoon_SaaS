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
      - Transform the story into a sequence of ATOMIC scenes (webtoon panels) that read top-to-bottom and sustain interest.
      - Each scene contains exactly ONE beat: either one action OR one reaction OR one micro-turn in emotion. Never combine cause and reaction in the same scene.
      
      SCENE SPLITTING RULES (VERY IMPORTANT)
      1) Atomic Beat Rule: one verb/intent per scene. If a character acts and another reacts, that's two scenes.
      2) No-Combo Rule: do NOT join "setup + payoff" in one scene. The reaction goes in the next scene.
      3) Split when ANY of these change: location, time, goal, focal subject, emotion, or when a character enters/exits.
      4) Dialogue Turns: if dialogue drives the beat, treat each turn or decisive interruption as its own scene.
      5) Suspense/Cliffhanger: end a scene right before a reveal or decision when possible; the reveal is the next scene.
      
      PACING
      - Total scenes must be between 6 and 24.
      - Heuristic: shorter stories lean 6–10 scenes; medium 10–18; longer 18–24. Prefer more—but simpler—beats over fewer, overloaded scenes.
      
      CONTINUITY & CLARITY
      - Ensure each scene clearly links to the previous: carry over the same location/props/characters unless a split cue (time jump, cutaway) is present.
      - Keep character count per scene minimal (ideally 1–3).
      - Avoid clutter: each scene should depict a single focal action/emotion that will be easy to illustrate.
      
      IMAGE DESCRIPTION GUIDELINES (for later generation)
      - “Scene_Description” is 1–2 concise sentences in present tense describing the frame to draw.
      - Include: shot type (WS/MS/CU/ECU/OTS), angle (low/high/eye-level), lighting/mood, key visual focus, character pose/expression, and essential environment.
      - Webtoon framing: avoid direct-to-camera gaze; allow negative space; keep composition readable on a tall phone screen.
      - No text overlays, captions, or camera jargon beyond shot/angle terms.
      - Keep backgrounds suggestive, not over-detailed; emphasize the beat.
      
      OUTPUT REQUIREMENTS
      - Return STRICT JSON (UTF-8). No trailing commas. No markdown. No commentary.
      - Keys allowed at top level: "story_title", "total_scenes", "scenes".
      - For each scene, ONLY provide: "Story_Text" and "Scene_Description".
      - "Story_Text" = 1–2 sentences summarizing JUST the beat that happens in this scene (pulled or paraphrased from the story).
      - "Scene_Description" = visual directives for the illustrator as specified above.
      - Scenes must be 1-indexed as "scene_1", "scene_2", ... with no gaps.
      - "total_scenes" must equal the number of scene entries.
      
      QUALITY CHECK BEFORE RETURNING
      - [✓] Each scene contains exactly one beat (no chained “and then…” actions).
      - [✓] Continuity is clear from one scene to the next.
      - [✓] 6 ≤ total_scenes ≤ 24 and equals the count of provided scenes.
      - [✓] No extra keys beyond the allowed schema.
      - [✓] No character looks directly at the camera in any Scene_Description.
      
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


