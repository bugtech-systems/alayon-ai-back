import os
import time
import json
import ast
import logging
import asyncio
from pathlib import Path
from typing import List, Dict, Any
import logging

import httpx
from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pymongo import MongoClient

from pymongo.collection import Collection

from backend.utils import get_closest_prompt

# Setup logging

# ----------------------------------
# Config and Constants
# ----------------------------------
MONGO_URI = os.getenv("MONGO_URI", "mongodb+srv://alayon:aEGqKZbvUF0j4DJH@saninisidr0.wuviu7x.mongodb.net")
OLLAMA_API_URL = os.getenv("OLLAMA_API_URL", "http://127.0.0.1:11434/api/chat")
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", 60))
SYSTEM_DEFAULTS_PATH = os.getenv("SYSTEM_DEFAULTS_PATH", "system_defaults.json")
DEFAULT_PROMPTS_PATH = os.getenv("DEFAULT_PROMPTS_PATH", "default_prompts.json")

# ----------------------------------
# Logging
# ----------------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backend")

# ----------------------------------
# FastAPI App
# ----------------------------------
app = FastAPI()
router = APIRouter()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)




# ----------------------------------
# MongoDB Connection
# ----------------------------------
client = MongoClient(MONGO_URI)
db = client["alayon"]
resources_col = db["resourcetags"]

# ----------------------------------
# Session Manager
# ----------------------------------
class SessionManager:
    def __init__(self):
        self.sessions: Dict[str, Dict[str, Any]] = {}
        self.lock = asyncio.Lock()

    async def get_messages(self, session_id: str) -> List[Dict[str, Any]]:
        async with self.lock:
            now = time.time()
            session = self.sessions.get(session_id)
            if not session or now - session["last_access"] > 600:
                self.sessions[session_id] = {"last_access": now, "messages": []}
            else:
                session["last_access"] = now
            return self.sessions[session_id]["messages"]

    async def append_message(self, session_id: str, message: Dict[str, Any]):
        async with self.lock:
            now = time.time()
            session = self.sessions.setdefault(session_id, {"last_access": now, "messages": []})
            session["last_access"] = now
            session["messages"].append(message)

session_manager = SessionManager()

# ----------------------------------
# Pydantic Models
# ----------------------------------
class PromptRequest(BaseModel):
    session_id: str
    instruction: str
    expected_output_format: Dict[str, Any]
    data: List[Dict[str, Any]]
    user_prompt: str

class PromptResponse(BaseModel):
    session_id: str
    response: Dict[str, Any]

# ----------------------------------
# Utility Functions
# ----------------------------------
def load_system_defaults() -> List[Dict[str, str]]:
    try:
        with open(SYSTEM_DEFAULTS_PATH, 'r') as f:
            return json.load(f).get("conversation", [])
    except Exception as e:
        logger.warning(f"Failed to load system defaults: {e}")
        return []

def format_data_for_prompt(data: List[Dict[str, Any]]) -> str:
    if not data:
        return "(no data available)"
    return "\n\n".join(
        f"Item {idx}:\n  " + "\n  ".join(f"{k}: {v}" for k, v in item.items())
        for idx, item in enumerate(data, start=1)
    )

def parse_response_to_dict(response_str: str) -> dict:
    try:
        return json.loads(response_str)
    except json.JSONDecodeError:
        try:
            return ast.literal_eval(response_str)
        except Exception:
            return {"content": response_str.strip() or "Empty AI response"}

def load_default_prompts() -> List[str]:
    try:
        base_dir = Path(__file__).resolve().parent  # folder where main.py is located
        default_prompts_path = base_dir / DEFAULT_PROMPTS_PATH
        with open(default_prompts_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to load default prompts: {e}")
        return []



async def call_ollama_ai(messages: List[Dict[str, str]]) -> str:
    payload = {
        "model": "mistral",
        "temperature": 0.2,
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

# ----------------------------------
# Resource Analyze Endpoint
# ----------------------------------


@router.post("/api/resource-analyze")
async def analyze_prompt(request: Dict[str, Any]):
    raw_prompt = request.get("user_prompt")
    if not raw_prompt:
        raise HTTPException(status_code=400, detail="Missing user_prompt")
    logger.info(f"Received user_prompt: {raw_prompt}")

    # Load and match default prompts
    default_prompts = load_default_prompts()
    if not default_prompts:
        raise HTTPException(status_code=500, detail="No default prompts available for correction")
    logger.info(f"Loaded {len(default_prompts)} default prompts")

    corrected_prompt = await get_closest_prompt(raw_prompt, default_prompts) or raw_prompt
    logger.info(f"Corrected prompt: {corrected_prompt}")

    # Load AI presets
    ai_presets = list(resources_col.find({"resourceType": "ai_preset"}))
    if not ai_presets:
        raise HTTPException(status_code=404, detail="No ai_presets found")
    logger.info(f"Fetched {len(ai_presets)} AI presets")

    preset_summary = "\n".join(f"- {p['name']}: {p.get('fields', [])}" for p in ai_presets)

    # Get all unique resourceTypes other than ai_preset
    resource_types = resources_col.distinct("resourceType", {"resourceType": {"$ne": "ai_preset"}})
    logger.info(f"Available resourceTypes: {resource_types}")

    system_msg = {
        "role": "system",
        "content": (
            "You are Alayon AI assistant that refines prompts, selects the most appropriate ai_preset from the list, "
            "extracts the most relevant query keys, and selects the correct resourceType. Only use provided presets and resourceTypes."
            "Always respond in Plain JSON object."
        )
    }

    user_msg = {
        "role": "user",
        "content": (
            f"Prompt: {corrected_prompt}\n"
            f"Available AI Presets:\n{preset_summary}\n"
            f"\nAvailable Resource Types: {', '.join(resource_types)}\n"
            f"\nInstructions:\n"
            f"- Select the most relevant ai_preset from the list.\n"
            f"- Identify relevant query keys based on the preset fields.\n"
            f"- Select a valid resourceType from the available list.\n"
            f"\nReturn ONLY a JSON object with:\n"
            f'  - prompt: {corrected_prompt}\n'
            f'  - ai_preset: selected preset name\n'
            f'  - queries: list of relevant keys\n'
            f'  - resourceType: selected resourceType\n'
        )
    }

    refined_response_text = await call_ollama_ai([system_msg, user_msg])
    logger.info(f"AI refined response: {refined_response_text}")

    refined_result = parse_response_to_dict(refined_response_text)
    logger.info(f"Parsed refined result: {refined_result}")

    refined_prompt = refined_result.get("prompt")
    selected_preset_name = refined_result.get("ai_preset")
    query_keys = refined_result.get("queries", [])
    resource_type = refined_result.get("resourceType")

    # Validate AI response
    if not refined_prompt:
        raise HTTPException(status_code=400, detail="Missing refined prompt from AI")
    if not selected_preset_name:
        raise HTTPException(status_code=400, detail="Missing selected ai_preset from AI")
    if not isinstance(query_keys, list):
        raise HTTPException(status_code=400, detail="queries must be a list")
    if resource_type not in resource_types:
        raise HTTPException(status_code=400, detail=f"Invalid resourceType: {resource_type}")

    selected_preset = next((p for p in ai_presets if p["name"] == selected_preset_name), None)
    if not selected_preset:
        raise HTTPException(status_code=404, detail=f"Preset '{selected_preset_name}' not found")

    return {
        "refined_prompt": refined_prompt,
        "selected_preset": selected_preset_name,
        "query_keys": query_keys,
        "resourceType": resource_type
    }


# ----------------------------------
# Prompt Chat Endpoint
# ----------------------------------
@app.post("/api/prompt", response_model=PromptResponse)
async def prompt_endpoint(req: PromptRequest):
    try:
        prev_messages = await session_manager.get_messages(req.session_id)
        messages = prev_messages.copy()

        for d in load_system_defaults():
            messages.append({"role": d.get("role", "system"), "content": d.get("content", "")})

        formatted_data = format_data_for_prompt(req.data)

        messages.append({
            "role": "system",
            "content": (
                f"Instruction: {req.instruction}\n"
                f"Expected Output Format in JSON: {req.expected_output_format}\n"
                f"Data:\n{formatted_data}\n"
                f"Important: DO NOT invent or assume  values not present in the 'data'."
            )
        })
        messages.append({"role": "user", "content": req.user_prompt})

        
        logger.info(f"AI message request: {messages}")
        ai_output = await call_ollama_ai(messages)
        await session_manager.append_message(req.session_id, {"role": "assistant", "content": ai_output})

        return {"session_id": req.session_id, "response": parse_response_to_dict(ai_output)}

    except Exception as e:
        logger.exception("Error in prompt_endpoint")
        raise HTTPException(status_code=500, detail="AI processing failed")

# ----------------------------------
# Mount Routes
# ----------------------------------
app.include_router(router)
