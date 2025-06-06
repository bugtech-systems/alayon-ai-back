from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
import io
import json
from pathlib import Path
from rapidfuzz import process
import difflib
import re
from typing import List, Dict, Any
import os
import httpx
import json


MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
OLLAMA_API_URL = os.getenv("OLLAMA_API_URL", "http://localhost:11434/api/chat")
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", 60))
SYSTEM_DEFAULTS_PATH = os.getenv("SYSTEM_DEFAULTS_PATH", "system_defaults.json")
DEFAULT_PROMPTS_PATH = os.getenv("DEFAULT_PROMPTS_PATH", "default_prompts.json")



async def call_ollama_ai(messages: List[Dict[str, str]]) -> str:
    payload = {
        "model": "llama3.1",
        "temperature": 0.3,
        "top_p": 0.9,
        "messages": messages,
        "stream": True
    }
    full_text = ""
    async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT) as client:
        async with client.stream("POST", OLLAMA_API_URL, json=payload) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line.strip():
                    try:
                        chunk = json.loads(line)
                        full_text += chunk.get("message", {}).get("content", "")
                    except json.JSONDecodeError:
                        continue
    return full_text



def generate_pdf(quotation_data: dict) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    elements = []
    styles = getSampleStyleSheet()

    elements.append(Paragraph("Quotation", styles['Title']))
    elements.append(Spacer(1, 12))

    # Table header
    data = [["Product", "Category", "Unit Price", "Quantity", "Subtotal"]]

    # Table rows
    for item in quotation_data.get("quotation", []):
        data.append([
            item.get("product_name", ""),
            item.get("category", ""),
            f"₱{item.get('unit_price', 0):,.2f}",
            item.get("quantity", 0),
            f"₱{item.get('subtotal', 0):,.2f}"
        ])

    # Total row
    data.append(["", "", "", "Total", f"₱{quotation_data.get('total_amount', 0):,.2f}"])

    # Table styling
    table = Table(data)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.gray),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (2, 1), (-1, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BACKGROUND', (-2, -1), (-1, -1), colors.lightgrey),
    ]))

    elements.append(table)
    elements.append(Spacer(1, 12))

    # Remarks section
    elements.append(Paragraph(f"Remarks: {quotation_data.get('remarks', '')}", styles['Normal']))

    doc.build(elements)
    return buffer.getvalue()



def build_word_corpus(default_prompts):
    words = set()
    for prompt in default_prompts:
        for word in re.findall(r'\w+', prompt.lower()):
            words.add(word)
    return words

def correct_words_in_prompt(user_prompt: str, word_corpus: set, threshold=0.8) -> str:
    words = user_prompt.split()
    corrected_words = []

    for word in words:
        if word.lower() in word_corpus:
            corrected_words.append(word)
        else:
            # Find the closest word from the corpus
            match = difflib.get_close_matches(word.lower(), word_corpus, n=1, cutoff=threshold)
            corrected_word = match[0] if match else word
            # Preserve original casing
            corrected_words.append(corrected_word if word.islower() else corrected_word.capitalize())

    return ' '.join(corrected_words)




DEFAULT_PROMPTS_PATH = Path(__file__).resolve().parent / "default_prompts.json"

def load_default_prompts() -> list[str]:
    try:
        with open(DEFAULT_PROMPTS_PATH, "r", encoding="utf-8") as file:
            return json.load(file)
    except Exception as e:
        raise RuntimeError(f"Failed to load default prompts: {e}")
        
        
# def get_closest_prompt(user_prompt: str, default_prompts: list[str]) -> str:
#     match = process.extractOne(user_prompt, default_prompts, score_cutoff=60)
#     return match[0] if match else None
    
async def get_closest_prompt(user_prompt: str, default_prompts: list) -> str:
    system_msg = {
        "role": "system",
        "content": (
            "You are a smart assistant that corrects spelling and inaccurate words in user prompts. "
            "Do NOT rewrite or rephrase the entire sentence. Only correct incorrect words while preserving the original sentence structure. "
            "Use the list of valid example prompts below to guide your spelling corrections and vocabulary choices. "
            "Return only the corrected version of the original prompt as plain text."
        )
    }

    user_msg = {
        "role": "user",
        "content": (
            f"User Prompt:\n{user_prompt}\n\n"
            f"Valid Reference Prompts:\n" +
            "\n".join(f"- {p}" for p in default_prompts)
        )
    }

    response = await call_ollama_ai([system_msg, user_msg])
    return response.strip()