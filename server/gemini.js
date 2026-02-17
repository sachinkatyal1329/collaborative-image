const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.GEMINI_API_KEY || 'YOUR_API_KEY_HERE';

let ai;

const IMAGES_DIR = path.join(__dirname, 'images');
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

function initializeGemini() {
  if (!API_KEY || API_KEY === 'YOUR_API_KEY_HERE') {
    console.warn('Gemini API key not set. Image generation will not work.');
    return false;
  }

  try {
    ai = new GoogleGenAI({ apiKey: API_KEY });
    console.log('Gemini API initialized');
    return true;
  } catch (error) {
    console.error('Failed to initialize Gemini:', error.message);
    return false;
  }
}

// Text-to-image: first generation with no existing image
async function generateFromText(promptText) {
  if (!ai) {
    throw new Error('Gemini API not initialized');
  }

  console.log(`Generating image from text prompt (${promptText.length} chars)`);

  const directive = `Create a single cohesive artistic image inspired by these words: ${promptText}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: directive,
    config: {
      responseModalities: ['IMAGE', 'TEXT'],
      imageConfig: {
        aspectRatio: '1:1'
      }
    }
  });

  return saveImageFromResponse(response);
}

// Image-to-image: evolve existing image with new words
async function evolveImage(existingImagePath, promptText) {
  if (!ai) {
    throw new Error('Gemini API not initialized');
  }

  const fullPath = path.join(__dirname, existingImagePath);
  if (!fs.existsSync(fullPath)) {
    console.log('Previous image not found, falling back to text-only generation');
    return generateFromText(promptText);
  }

  console.log(`Evolving image with new words (${promptText.length} chars)`);

  const imageBuffer = fs.readFileSync(fullPath);
  const base64Image = imageBuffer.toString('base64');

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Image
            }
          },
          {
            text: `Evolve and enhance this image by incorporating these additional concepts and words into the scene. Keep the existing composition but let it grow and change with these new ideas: ${promptText}`
          }
        ]
      }
    ],
    config: {
      responseModalities: ['IMAGE', 'TEXT'],
      imageConfig: {
        aspectRatio: '1:1'
      }
    }
  });

  return saveImageFromResponse(response);
}

function saveImageFromResponse(response) {
  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      const imageData = part.inlineData.data;
      const filename = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.png`;
      const filepath = path.join(IMAGES_DIR, filename);
      const buffer = Buffer.from(imageData, 'base64');
      fs.writeFileSync(filepath, buffer);

      console.log('Image saved:', filename);
      return `/images/${filename}`;
    }
  }

  throw new Error('No image data in response');
}

module.exports = {
  initializeGemini,
  generateFromText,
  evolveImage
};
