# alayon_ai_flask.py

import json
import os
import threading
import time
from flask import Flask, request, jsonify
# from langchain_ollama import OllamaLLM
from langchain_community.llms import ollama

from langchain_core.prompts import PromptTemplate
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

app = Flask(__name__)

DEFAULT_CONVERSATION_FILE = "default_conversation.json"
PROMPT_VARIABLES_FILE = "prompt_variables.json"
HOTLINE_CONTACTS_FILE = "hotline_contacts.json"
SESSION_LOGS_DIR = "session_logs"

# Ensure log directory exists
os.makedirs(SESSION_LOGS_DIR, exist_ok=True)

# Globals
default_system_instruction = ""
default_history = []
prompt_variables = {}
hotline_contacts = []
llm = None


def load_default_conversation():
    global default_system_instruction, default_history
    try:
        with open(DEFAULT_CONVERSATION_FILE, "r", encoding="utf-8") as f:
            default_data = json.load(f)
            default_system_instruction = default_data.get("system_instruction", "")
            default_history = default_data.get("conversation_history", [])
        print("[INFO] Loaded default conversation file.")
    except Exception as e:
        print(f"[ERROR] Failed to load default conversation: {e}")
        default_system_instruction = ""
        default_history = []


def create_llm_from_config():
    global prompt_variables
    model_config = prompt_variables.get("model_config", {})
    model_name = model_config.get("model", "mistral")
    temperature = model_config.get("temperature", 0.7)
    top_p = model_config.get("top_p", 0.9)

    print("[INFO] Using LLM config:", model_config)

    return ollama.Ollama(
        model=model_name,
        temperature=temperature,
        top_p=top_p
    )


def load_prompt_variables():
    global prompt_variables, llm
    try:
        with open(PROMPT_VARIABLES_FILE, "r", encoding="utf-8") as f:
            prompt_variables = json.load(f)
        print("[INFO] Loaded prompt variables.")

        llm = create_llm_from_config()

    except Exception as e:
        print(f"[ERROR] Failed to load prompt variables: {e}")
        prompt_variables = {}


def load_hotline_contacts():
    global hotline_contacts
    try:
        with open(HOTLINE_CONTACTS_FILE, "r", encoding="utf-8") as f:
            hotline_contacts = json.load(f)
        print("[INFO] Loaded hotline contacts.")
    except Exception as e:
        print(f"[ERROR] Failed to load hotline contacts: {e}")
        hotline_contacts = []


# Load all files on start
load_default_conversation()
load_prompt_variables()
load_hotline_contacts()


class JsonFileChangeHandler(FileSystemEventHandler):
    def on_modified(self, event):
        if event.src_path.endswith(DEFAULT_CONVERSATION_FILE):
            load_default_conversation()
        elif event.src_path.endswith(PROMPT_VARIABLES_FILE):
            load_prompt_variables()
        elif event.src_path.endswith(HOTLINE_CONTACTS_FILE):
            load_hotline_contacts()


def start_file_watcher():
    event_handler = JsonFileChangeHandler()
    observer = Observer()
    observer.schedule(event_handler, path=".", recursive=False)
    observer.start()
    print("[INFO] Started file watcher.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()


threading.Thread(target=start_file_watcher, daemon=True).start()

prompt_template = PromptTemplate.from_template(prompt_variables.get("ai_instruction", ""))

session_histories = {}


def format_history(history_list):
    return "\n".join(f"{msg['role'].capitalize()}: {msg['content']}" for msg in history_list)


def save_session_log(session_id, history):
    try:
        with open(f"{SESSION_LOGS_DIR}/{session_id}.json", "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2)
        print(f"[INFO] Session {session_id} log updated.")
    except Exception as e:
        print(f"[ERROR] Failed to save session log: {e}")


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json()
    user_input = data.get("input", "").strip()
    preset = data.get("preset", "Emergency Hotline")
    session_id = data.get("session_id", "default_session")
    user_identity = data.get("user_identity", "")

    if not user_input:
        return jsonify({"error": "Input is required"}), 400

    session_history = session_histories.get(session_id, [])
    session_history.append({"role": "user", "content": user_input})

    # Determine visible contacts based on privacy and identity
    filtered_contacts = [
        {
            "name": c.get("name"),
            "designation": c.get("designation"),
            "department": c.get("department"),
            "role": c.get("role"),
            "contact": c.get("contact") if user_identity == c.get("name") or not c.get("isPrivate", False) else None
        }
        for c in hotline_contacts
        if not c.get("isPrivate", False) or user_identity == c.get("name")
    ]

    # Log injected variables
    print("[INFO] Injecting prompt variables:")
    print("  system_instruction:", default_system_instruction[:100] + "..." if len(default_system_instruction) > 100 else default_system_instruction)
    print("  default_history_text:", format_history(default_history))
    print("  session_history_text:", format_history(session_history))
    print("  input:", user_input)
    print("  preset:", preset)
    print("  intent_options:", prompt_variables.get("intent", []))
    print("  action_options:", prompt_variables.get("action", []))
    print("  required_fields:", prompt_variables.get("required_fields", []))
    print("  hotline_contact_persons:", filtered_contacts)

    # AI prompt formatting
    formatted_prompt = prompt_template.format(
        system_instruction=default_system_instruction,
        default_history_text=format_history(default_history),
        session_history_text=format_history(session_history),
        input=user_input,
        preset=preset,
        intent_options=", ".join(prompt_variables.get("intent", [])),
        action_options=", ".join(prompt_variables.get("action", [])),
        required_fields=", ".join(prompt_variables.get("required_fields", [])),
        hotline_contacts=json.dumps(filtered_contacts)
    )

    response_text = llm.invoke(formatted_prompt)

    try:
        response_json = json.loads(response_text)
    except Exception as e:
        return jsonify({"error": "Invalid AI response", "raw_response": response_text}), 500

    session_history.append({"role": "assistant", "content": response_text})
    session_histories[session_id] = session_history
    save_session_log(session_id, session_history)

    return jsonify({"session_id": session_id, "response": response_json})


if __name__ == "__main__":
    app.run(port=5000, debug=True)
