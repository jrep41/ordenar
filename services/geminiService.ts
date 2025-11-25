import { GoogleGenAI, Type, Schema } from "@google/genai";
import { DateExtractionResponse } from '../types';

// Initialize with a dummy key initially; expecting the process to inject the real one from env
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    year: {
      type: Type.INTEGER,
      description: "The 4-digit year extracted from the document date. If not found, return null.",
      nullable: true
    },
    fullDate: {
      type: Type.STRING,
      description: "The full date found in YYYY-MM-DD format. If not found, return null.",
      nullable: true
    },
    summary: {
      type: Type.STRING,
      description: "A very short 5-10 word description of the document content (e.g., 'Invoice from Amazon', 'Family Photo 2024')."
    }
  },
  required: ["summary"]
};

export const analyzeFileDate = async (file: File): Promise<DateExtractionResponse> => {
  try {
    // 1. Convert File to Base64
    const base64Data = await fileToGenerativePart(file);
    
    // 2. Determine MIME type (Gemini supports application/pdf and image/*)
    const mimeType = file.type;

    // 3. Call Gemini
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          },
          {
            text: "Analyze this document or image. Find the most significant date (creation date, invoice date, photo timestamp). Return the Year and Full Date. If multiple dates exist, choose the one that best represents when the event or document happened. If no date is visible, return null for date fields."
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.1, // Low temp for factual extraction
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");

    const result = JSON.parse(text) as DateExtractionResponse;
    return result;

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return { year: null, fullDate: null, summary: "Analysis Failed" };
  }
};

const fileToGenerativePart = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove Data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};
