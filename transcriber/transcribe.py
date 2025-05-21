# transcriber/transcribe.py
import sys
import whisper

audio_file = sys.argv[1]
model = whisper.load_model("large")
result = model.transcribe(audio_file)
print(result["text"])
