# transcribe.py
import whisper
import sys

model = whisper.load_model("base")  # use "tiny" for faster results
result = model.transcribe(sys.argv[1])
print(result["text"])
