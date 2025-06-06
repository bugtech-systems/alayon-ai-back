from pydantic import BaseModel
from typing import Dict, Any, List

class PromptRequest(BaseModel):
    session_id: str
    instruction: str
    expected_output_format: Dict[str, Any]
    data: List[Dict[str, Any]]
    user_prompt: str

class PromptResponse(BaseModel):
    response: str
    session_id: str
    data: Any
