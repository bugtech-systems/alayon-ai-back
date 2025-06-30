import { spawn } from 'child_process';
const ESPEAK_PATH = 'C:\\Program Files (x86)\\eSpeak\\command_line\\espeak.exe';

export function voicespeak(text, voice = 'en', speed = 175) {

    const args = ['-v', voice, '-s', speed.toString(), text.replace(/"/g, '\\"')];
    const espeak = spawn(ESPEAK_PATH, args);

    espeak.on('error', (err) => {
        console.error('Failed to start eSpeak:', err);
    });

    espeak.on('close', (code) => {
        if (code !== 0) console.error(`eSpeak exited with code ${code}`);
    });
}

voicespeak("This is a very long text that should not be cut off mid-sentence.");