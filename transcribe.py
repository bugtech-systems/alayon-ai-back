# transcriber/transcribe.py
import sys
import whisper
from spellchecker import SpellChecker
spell = SpellChecker()

audio_file = sys.argv[1]
model = whisper.load_model("large")
result = model.transcribe(audio_file, language="en")



words = result['text'].split()
misspelled = spell.unknown(words)
for word in misspelled:
    print(f"{word} → {spell.correction(word)}")


print(result["text"])


