import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const translateText = async (text, target) => {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash"
    });

    const prompt = `
Translate the following text to ${target}.
Return ONLY the translated text.

Text: "${text}"
`;

    const result = await model.generateContent(prompt);

    const response = await result.response;

    return response.text().trim();

  } catch (error) {
    console.error("Gemini Service Error:", error);
    throw new Error("Translation failed");
  }
};