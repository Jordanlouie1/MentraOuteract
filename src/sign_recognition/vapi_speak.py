import os
import time
import requests
from dotenv import load_dotenv

load_dotenv()

VAPI_API_KEY = os.getenv("VAPI_API_KEY")
VAPI_ASSISTANT_ID = os.getenv("VAPI_ASSISTANT_ID")

def start_call_and_speak(message: str):
    # Start a browser preview call
    url = "https://docs.vapi.ai/api-reference/calls/create"
    headers = {
        "Authorization": f"Bearer {VAPI_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "assistant": VAPI_ASSISTANT_ID,
        "customer": {
            "number": "demo",
            "channel": "browser"
        },
        "startImmediately": True
    }

    response = requests.post(url, headers=headers, json=payload)

    if response.status_code != 200:
        print("[❌] Failed to start call:", response.status_code, response.text)
        return

    call_id = response.json().get("id")
    print(f"[📞] Call started: {call_id}")

    # Optional: wait 2 seconds to ensure call is connected
    time.sleep(2)

    # Send the message to speak
    speak_url = f"https://api.vapi.ai/v1/calls/{call_id}/speak"
    speak_payload = {
        "text": message
    }

    speak_response = requests.post(speak_url, headers=headers, json=speak_payload)

    if speak_response.status_code == 200:
        print("[🔊] Message sent to Vapi.")
    else:
        print("[❌] Failed to send message:", speak_response.status_code, speak_response.text)


def speak_result_from_txt(txt_path: str):
    if not os.path.exists(txt_path):
        print(f"[⚠️] Text file not found: {txt_path}")
        return

    with open(txt_path, "r") as f:
        content = f.read().strip()

    if content:
        start_call_and_speak(content)
    else:
        print("[⚠️] Text file is empty.")