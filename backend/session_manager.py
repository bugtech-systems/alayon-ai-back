import time
from typing import Dict, List, Any

SESSION_EXPIRY_SECONDS = 600  # 10 minutes

class SessionManager:
    def __init__(self):
        self.sessions: Dict[str, Dict[str, Any]] = {}

    def get_session(self, session_id: str) -> List[Dict[str, str]]:
        session = self.sessions.get(session_id)
        now = time.time()
        if session and (now - session["last_access"] < SESSION_EXPIRY_SECONDS):
            session["last_access"] = now
            return session["messages"]
        # New session or expired
        self.sessions[session_id] = {
            "last_access": now,
            "messages": []
        }
        return []

    def update_session(self, session_id: str, messages: List[Dict[str, str]]) -> None:
        self.sessions[session_id] = {
            "last_access": time.time(),
            "messages": messages
        }
