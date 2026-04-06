import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;
const TARGET_LANGUAGE_MAP = {
  hi: "Hindi",
  en: "English",
};

export const translateText = async (text, target) => {
  try {
    const normalizedText = typeof text === "string" ? text.trim() : "";
    if (!normalizedText) return text;

    const normalizedTarget = TARGET_LANGUAGE_MAP[target] || target || "English";
    if (normalizedTarget === "English") return normalizedText;
    if (!genAI) {
      console.error("Gemini Service Error: GEMINI_API_KEY is missing.");
      return normalizedText;
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
    });

    const prompt = [
      `Translate the following UI notification text to ${normalizedTarget}.`,
      "Keep the meaning, urgency, and tone intact.",
      "Return only the translated text with no quotes, labels, markdown, or explanation.",
      `Text: ${normalizedText}`,
    ].join("\n");

    const result = await model.generateContent(prompt);

    const response = await result.response;

    return response.text().trim() || normalizedText;

  } catch (error) {
    console.error("Gemini Service Error:", {
      message: error?.message,
      status: error?.status,
      code: error?.code,
      details: error?.errorDetails || error?.details,
    });
    return typeof text === "string" && text.trim() ? text.trim() : text;
  }
};
