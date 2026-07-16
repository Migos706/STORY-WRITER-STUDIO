var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");
import_dotenv.default.config();
var ai = new import_genai.GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build"
    }
  }
});
async function generateContentWithRetry(params, retries = 2, delayMs = 500) {
  let lastError = null;
  const originalModel = params.model || "gemini-3.5-flash";
  const modelsToTry = [originalModel];
  if (originalModel === "gemini-3.5-flash") {
    modelsToTry.push("gemini-3.1-flash-lite");
  }
  for (let mIdx = 0; mIdx < modelsToTry.length; mIdx++) {
    const model = modelsToTry[mIdx];
    const currentParams = { ...params, model };
    const isLastModel = mIdx === modelsToTry.length - 1;
    const maxAttemptsForThisModel = !isLastModel ? 1 : retries;
    for (let attempt = 1; attempt <= maxAttemptsForThisModel; attempt++) {
      try {
        console.log(`[Gemini SDK] Generating content using ${model} (Attempt ${attempt}/${maxAttemptsForThisModel})`);
        const response = await ai.models.generateContent(currentParams);
        return response;
      } catch (error) {
        lastError = error;
        const errMsg = error.message || String(error);
        console.warn(`[Gemini SDK Warning] Attempt ${attempt} failed with model ${model}: ${errMsg}`);
        const is503OrRateLimit = errMsg.includes("503") || errMsg.includes("UNAVAILABLE") || errMsg.includes("high demand") || errMsg.includes("429") || error.status === 503 || error.status === 429;
        if (is503OrRateLimit && attempt < maxAttemptsForThisModel) {
          const backoffDelay = delayMs * Math.pow(2, attempt - 1);
          console.log(`[Gemini SDK] Temporary error detected. Retrying ${model} in ${backoffDelay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        } else {
          break;
        }
      }
    }
  }
  throw lastError || new Error("Failed to generate content after retries and fallback models.");
}
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use(import_express.default.json({ limit: "25mb" }));
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });
  app.post("/api/ai/generate-character", async (req, res) => {
    const { name, age, gender, personality, abilities, genre } = req.body;
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not defined" });
    }
    try {
      const textPrompt = `You are a master character designer and novelist. Create a rich, detailed, and captivating biography and background story in Swahili (with a poetic/creative tone) for this character.
      Name: ${name}
      Age: ${age || "Unknown"}
      Gender: ${gender}
      Personality traits: ${personality || "Intriguing, mysterious"}
      Abilities/Skills: ${abilities || "Normal human"}
      Genre: ${genre}

      Structure your output as a clean JSON object containing:
      {
        "bio": "A beautifully written short summary profile of the character in Swahili (2-3 sentences)",
        "background": "An engaging, deep background backstory/origin story in Swahili (2 paragraphs)",
        "imagePrompt": "A highly detailed, professional artistic portrait prompt in English (e.g., 'A professional close-up realistic cinematic fantasy portrait of a 25-year-old Swahili male warrior, intricate details, glowing eyes, soft volumetric lighting, 8k resolution, artstation trending')"
      }`;
      const textResponse = await generateContentWithRetry({
        model: "gemini-3.5-flash",
        contents: textPrompt,
        config: {
          responseMimeType: "application/json",
          systemInstruction: "You are an award-winning character design writer. Generate responses strictly formatted as JSON."
        }
      });
      const responseText = textResponse.text || "";
      const cleanJSON = responseText.trim().replace(/```json/g, "").replace(/```/g, "");
      const data = JSON.parse(cleanJSON);
      let imageUrl = "";
      try {
        const imageResponse = await ai.models.generateContent({
          model: "gemini-3.1-flash-lite-image",
          contents: {
            parts: [
              {
                text: `${data.imagePrompt}, beautiful profile portrait avatar, single person, clean background, masterpiece.`
              }
            ]
          },
          config: {
            imageConfig: {
              aspectRatio: "1:1"
            }
          }
        });
        if (imageResponse.candidates?.[0]?.content?.parts) {
          for (const part of imageResponse.candidates[0].content.parts) {
            if (part.inlineData?.data) {
              imageUrl = `data:image/png;base64,${part.inlineData.data}`;
              break;
            }
          }
        }
      } catch (imgErr) {
        console.warn("Failed to generate AI character portrait, using high-quality Unsplash portrait fallback:", imgErr);
        imageUrl = `https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600`;
      }
      res.json({
        bio: data.bio,
        background: data.background,
        imagePrompt: data.imagePrompt,
        imageUrl: imageUrl || `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=600`
      });
    } catch (error) {
      console.error("Error generating character:", error);
      res.status(500).json({ error: error.message || "Failed to generate character" });
    }
  });
  app.post("/api/ai/generate-chapter", async (req, res) => {
    const {
      premise,
      title,
      genre,
      mood,
      style,
      audience,
      characters,
      world,
      chapterNumber,
      totalChapters,
      previousChapters,
      language,
      visualStyle
    } = req.body;
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not defined" });
    }
    try {
      const languageText = language === "en" ? "English" : "Swahili (Kiswahili cha kusanifu cha kiwango cha juu cha fasihi)";
      const prompt = `
      You are a professional award-winning novelist and creative writer.
      Compose Chapter ${chapterNumber} of a ${totalChapters}-chapter book.
      The language of the entire chapter MUST be strictly written in ${languageText}.

      STORY DETAILS:
      - Main Premise: ${premise}
      - Preferred Book Title: ${title || "Let AI invent a fitting title"}
      - Main Genre: ${genre}
      - Narrative Tone/Mood: ${mood}
      - Writing Style: ${style}
      - Target Audience: ${audience}

      CAST OF CHARACTERS:
      ${JSON.stringify(characters, null, 2)}

      WORLD SETTING & WORLD BUILDING:
      ${JSON.stringify(world, null, 2)}

      PREVIOUS CHAPTERS FOR SEAMLESS CONTINUITY:
      ${JSON.stringify(previousChapters || [], null, 2)}

      IMPORTANT DIRECTIVES:
      - Do not write a summary or outline of the chapter. Write full-length, deep, and immersive narrative prose (at least 6-10 long paragraphs).
      - Include engaging dialogues, detailed descriptions of scenes, environments, and clothes, raw character emotions, internal thoughts, conflicts, and plot progression.
      - Maintain perfect continuity with preceding chapters. Do not skip events or resolve conflicts prematurely.
      - Build tension and end on a dramatic point or hook appropriate for Chapter ${chapterNumber} of ${totalChapters}.
      - For Swahili stories, use exquisite literary words, metaphors, and native stylistic devices (Tashbiha, Istiara, etc.).

      Additionally, generate a highly detailed image illustration prompt in English representing the most dramatic/expressive visual scene from this chapter, styled to match: "${visualStyle || "Fantasy Art"}".

      You MUST format your output strictly as a JSON object with these properties:
      {
        "title": "Beautiful Chapter Title",
        "content": "Full detailed story text here. Use double newlines \\n\\n for paragraphs.",
        "imagePrompt": "Detailed illustration prompt in English (e.g., 'An intricate watercolor painting of a young wizard overlooking a glowing purple forest, soft mist, dramatic lighting, detailed, whimsical')"
      }
      `;
      const response = await generateContentWithRetry({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          systemInstruction: "You are an elite novelist. Generate responses strictly structured as JSON. Never output markdown outside JSON."
        }
      });
      const responseText = response.text || "";
      const cleanJSON = responseText.trim().replace(/```json/g, "").replace(/```/g, "");
      const parsed = JSON.parse(cleanJSON);
      res.json(parsed);
    } catch (error) {
      console.error("Error generating chapter:", error);
      res.status(500).json({ error: error.message || "Failed to generate chapter" });
    }
  });
  app.post("/api/ai/generate-chapter-illustration", async (req, res) => {
    const { imagePrompt, visualStyle } = req.body;
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not defined" });
    }
    try {
      const artStylePrefix = visualStyle === "Anime" ? "A beautiful, highly detailed digital anime drawing of " : visualStyle === "Cartoon" ? "A clean whimsical child-friendly cartoon illustration of " : visualStyle === "Realistic" ? "A dramatic photorealistic cinematic movie scene of " : visualStyle === "Fantasy" ? "A gorgeous digital fantasy concept painting of " : visualStyle === "Children" ? "A classic children's storybook pencil-sketch watercolor style painting of " : "An artistic illustration of ";
      const prompt = `${artStylePrefix}${imagePrompt}, vibrant colors, high-quality, masterpiece, story book illustration.`;
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-image",
        contents: { parts: [{ text: prompt }] },
        config: {
          imageConfig: {
            aspectRatio: "16:9"
          }
        }
      });
      let imageUrl = "";
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData?.data) {
            imageUrl = `data:image/png;base64,${part.inlineData.data}`;
            break;
          }
        }
      }
      if (!imageUrl) {
        throw new Error("No image data returned from Gemini");
      }
      res.json({ imageUrl });
    } catch (error) {
      console.warn("Failed to generate chapter illustration, using public Unsplash fallback:", error);
      const randomFallbackImage = `https://images.unsplash.com/photo-1518156677180-95a2893f3e9f?auto=format&fit=crop&q=80&w=1200`;
      res.json({ imageUrl: randomFallbackImage });
    }
  });
  app.post("/api/ai/run-security-check", async (req, res) => {
    const { content } = req.body;
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not defined" });
    }
    try {
      const prompt = `Analyze the following story for harsh, rough, offensive, hate speech, explicit, or inappropriate language.
      Reply with ONLY a JSON object in this format: {"isSafe": boolean, "reason": "short explanation in Swahili"}.
      
      Story content:
      

${content}`;
      const response = await generateContentWithRetry({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });
      const responseText = response.text || "";
      const cleanJSON = responseText.trim().replace(/```json/g, "").replace(/```/g, "");
      const result = JSON.parse(cleanJSON);
      res.json(result);
    } catch (error) {
      console.error("Security check failed:", error);
      res.status(500).json({ error: error.message || "Failed to run safety check" });
    }
  });
  app.post("/api/ai/generate-audio", async (req, res) => {
    const { content, language } = req.body;
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not defined" });
    }
    try {
      const cleanContent = content.substring(0, 1e3);
      const voiceName = language === "sw" ? "Kore" : "Zephyr";
      const prompt = `Narration of this text in ${language === "sw" ? "Swahili" : "English"}: ${cleanContent}`;
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName }
            }
          }
        }
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        throw new Error("No audio data returned from Gemini TTS");
      }
      res.json({ audioData: base64Audio });
    } catch (error) {
      console.error("Error generating TTS audio:", error);
      res.status(500).json({ error: error.message || "Failed to generate audio" });
    }
  });
  app.post("/api/ai/generate-interactive-story", async (req, res) => {
    const { premise, characterName, genre, mood, language, length } = req.body;
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not defined" });
    }
    try {
      const lengthInstruction = length === "short" ? "Write a delightful short story (about 3-4 dense paragraphs)." : length === "medium" ? "Write an expansive story with deep paragraphs and detailed world descriptions (about 5-8 paragraphs)." : "Write a long, epic story with incredible environment building, characters dialogue and immersive depth.";
      const prompt = `
        You are a highly skilled storyteller and award-winning author. Write an exquisite, finished story in the language corresponding to: "${language === "sw" ? "Swahili (Kiswahili cha kusanifu na cha kusisimua)" : "English"}".
        
        STORY CONFIGURATIONS:
        - Protagonist/Main Character: ${characterName || "An unnamed hero"}
        - Genre: ${genre}
        - Overall Mood/Vibe: ${mood}
        - Plot Premise: ${premise}
        
        INSTRUCTIONS:
        1. Fully embody the specified genre and mood in the prose style.
        2. ${lengthInstruction}
        3. Do not leave the story incomplete or write summaries. Provide complete resolution or a thrilling narrative arc.
        4. Integrate the protagonist character name smoothly into the storytelling.
        5. Write structurally sound text with dialogue and immersive metaphors.
        
        You MUST structure your response strictly as a JSON object containing two properties:
        {
          "title": "A highly catchy, unique title representing this customized story",
          "content": "The full complete storytelling content text. Use double newlines \\n\\n for paragraphs."
        }
      `;
      const response = await generateContentWithRetry({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are an expert AI novelist. You generate highly immersive stories packaged purely inside a JSON schema. Avoid any prefix, markdown codes, or conversational dialogue outside the JSON.",
          responseMimeType: "application/json"
        }
      });
      const responseText = response.text || "";
      const textToParse = responseText.trim().replace(/```json/g, "").replace(/```/g, "");
      const parsed = JSON.parse(textToParse);
      res.json(parsed);
    } catch (error) {
      console.error("Error generating interactive story:", error);
      res.status(500).json({ error: error.message || "Failed to generate interactive story" });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
