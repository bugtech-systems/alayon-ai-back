#!/usr/bin/env python3
import sys
import whisper
import argparse
import requests

def correct_text_with_mistral(text):
    """
    Send text to Ollama's Mistral AI for grammar and spelling correction.
    Special handling for first word that should start with 'Alayon'.
    """
    # Prepare the prompt for Mistral
    prompt = f"""
    **IMPORTANT RULES**
    Correct exactly ONLY the grammar and spelling of this text to make it sound perfectly natural.
    DO NOT change the meaning or add/remove content. 
    If the first word of the prompt is anything similar or sounds like 'Alayon', Change the word with 'Alayon' and keep the rest of the sentence.
    
    Text to correct:
    {text}
    """
    
    try:
        # Send to Ollama's Mistral API
        response = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": "mongoai",
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.1}  # For deterministic output
            }
        )
        response.raise_for_status()
        corrected_text = response.json()["response"].strip()
        
        # Ensure Alayon is properly capitalized if present
        words = corrected_text.split()
        if len(words) > 0 and words[0].lower() == "alayon":
            words[0] = "Alayon"
            corrected_text = " ".join(words)
            
        return corrected_text
        
    except Exception as e:
        print(f"Error in Mistral correction: {str(e)}", file=sys.stderr)
        return text  # Return original if correction fails

def transcribe_audio(audio_path, model_size="base", language="en", device=None):
    """
    Transcribe audio file using Whisper model with optimized settings.
    """
    model = whisper.load_model(model_size, device=device)
    
    result = model.transcribe(
        audio_path,
        language=language,
        fp16=True if device == "cuda" else False,
        verbose=False,
        temperature=0.0,
        best_of=5,
        beam_size=5
    )
    
    return result["text"].strip()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Whisper audio transcription with Mistral correction")
    parser.add_argument("audio_file", help="Path to audio file to transcribe")
    parser.add_argument("--model", default="base", 
                        choices=["tiny", "base", "small", "medium", "large"],
                        help="Model size (default: base)")
    parser.add_argument("--language", default="en", 
                        help="Language code (default: en)")
    parser.add_argument("--device", 
                        help="Force device (cuda, cpu, mps). Auto-detected if not specified")
    parser.add_argument("--no-correction", action="store_true",
                        help="Skip Mistral grammar correction")
    
    args = parser.parse_args()
    
    try:
        # Step 1: Transcribe audio
        raw_text = transcribe_audio(
            args.audio_file,
            model_size=args.model,
            language=args.language,
            device=args.device
        )
        
        # Step 2: Process with Mistral (unless disabled)
        if args.no_correction:
            final_text = raw_text
        else:
            final_text = correct_text_with_mistral(raw_text)
        
        print(final_text)
        
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)