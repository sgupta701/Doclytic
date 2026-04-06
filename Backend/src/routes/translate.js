import express from "express";
import { translateText } from "../services/geminiService.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { text, target } = req.body;

    if (!text || !target) {
      return res.status(400).json({
        error: "Text and target are required",
      });
    }

    const translated = await translateText(text, target);

    res.json({ translatedText: translated });

  } catch (error) {
    console.error("Translation Route Error:", error);
    res.json({
      translatedText: text,
      fallback: true,
    });
  }
});

export default router;
