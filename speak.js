import { spawn } from 'child_process';
import fetch from 'node-fetch';

const ESPEAK_PATH = 'C:\\Program Files (x86)\\eSpeak\\command_line\\espeak.exe';
const OLLAMA_API_URL = 'http://127.0.0.1:11434/api/generate';

/**
 * Strict sanitization for TTS input
 */
function sanitizeText(text) {

    let newText = '';

    if (typeof text != 'string') {
        newText = JSON.stringify(text);
    } else {
        newText = text;
    }


    return newText
        .replace(/\\/g, '')       // Remove all backslashes
        .replace(/\n/g, '__')      // Replace newlines with spaces
        .replace(/\s+/g, ' ')     // Collapse multiple spaces
        .trim();
}

/**
 * Calls Ollama with optimized parameters for consistent TTS refinement
 */
async function refineTextForSpeech(text, aiModel) {
    const systemPrompt = `
  You are a TTS (Text-to-Speech) optimization engine. Apply these rules STRICTLY:
  1. Add pauses: "_" (short, 200ms), or replace next line if exists "\n" with pauses "_".
  2. Use contractions ("you'll", "can't")
  3. Maximum 12 words per clause
  4. NEVER add explanations, note, metadata or extra text or backslash "\\".
  5. Refine to a message string.

  Input: "${text}"
  `;

    const response = await fetch(OLLAMA_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: aiModel,        // Most consistent for this task
            prompt: systemPrompt,
            stream: false,
            options: {
                temperature: 0.3,     // Lower = more deterministic
                num_ctx: 4096      // Better context understanding
            }
        }),
    });

    if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);

    const data = await response.json();
    return `__ ${data.response
        .replace(/^"+|"+$/g, '')  // Remove surrounding quotes if present
        .trim()}`;
}

export async function voicespeak(
    text,
    voice = 'en',
    speed = 160,
    useAI = true,
    aiModel = 'mistral'
) {
    try {
        const sanitizedText = sanitizeText(text);
        let processedText = sanitizedText;

        if (useAI) {
            processedText = await sanitizeText((await refineTextForSpeech(sanitizedText, aiModel)).toString());
            console.debug('AI Refined:', { input: text, output: processedText });
        }

        const args = [
            '-v', voice,
            '-s', speed.toString(),
            // '-k', '20',            // Emphasis sensitivity
            processedText
        ];

        const espeak = spawn(ESPEAK_PATH, args);
        espeak.on('error', (err) => console.error('eSpeak error:', err));
        espeak.on('close', (code) => code !== 0 && console.warn(`eSpeak exited with code ${code}`));
    } catch (err) {
        console.error('AI refinement failed, using sanitized text:', err);
        voicespeak(sanitizeText(text), voice, speed, false); // Fallback
    }
}