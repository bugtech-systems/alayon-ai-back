// fileWriter.mjs
import { writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Writes content to a file
 * @param {string} filePath - Path to the file to write
 * @param {string} content - Content to write
 * @param {object} [options] - Optional write options
 * @returns {Promise<void>}
 */
export async function writeToFile(filePath, content, options = {}) {
    try {

        const __dirname = dirname(fileURLToPath(import.meta.url));



        await writeFile(filePath, content, {
            encoding: 'utf8',
            ...options
        });
        console.log(`File written successfully to ${filePath}`);
    } catch (error) {
        console.error(`Error writing file: ${error.message}`);
        throw error;
    }
}

/**
 * Example usage
 */
async function main() {
    // Get current directory (alternative to __dirname in ESM)
    const __dirname = dirname(fileURLToPath(import.meta.url));

    const filePath = `${__dirname}/example.txt`;
    const content = "FROM mistral:latest\nSYSTEM \"\"\"You are a geography expert with knowledge of countries, capitals, and landmarks.\"\"\"\n\nTEMPLATE \"\"\"{{ if .System }}<|im_start|>system\n{{ .System }}<|im_end|>\n{{ end }}{{ range .Messages }}{{ if eq .Role \"system\" }}<|im_start|>system\n{{ .Content }}<|im_end|>\n{{ else if eq .Role \"user\" }}<|im_start|>user\n{{ .Content }}<|im_end|>\n{{ else if eq .Role \"assistant\" }}<|im_start|>assistant\n{{ .Content }}<|im_end|>\n{{ end }}{{ end }}<|im_start|>assistant\n\"\"\"\n\nMESSAGES [\n[\n{\"role\": \"system\", \"content\": \"You are a geography expert with knowledge of countries, capitals, and landmarks.\"},\n{\"role\": \"user\", \"content\": \"What is the capital of Japan?\"},\n{\"role\": \"assistant\", \"content\": \"The capital of Japan is Tokyo, which is one of the most populous metropolitan areas in the world.\"}\n]\n[\n{\"role\": \"user\", \"content\": \"Which river runs through London?\"},\n{\"role\": \"assistant\", \"content\": \"The River Thames flows through London. It's about 215 miles long and is the longest river entirely in England.\"}\n]\n]\n\n" + new Date().toISOString();

    await writeToFile(filePath, content);

    // Example with options
    await writeToFile(`${__dirname}/example-append.txt`, 'This will append\n', { flag: 'a' });
}

// Run the example
main().catch(console.error);