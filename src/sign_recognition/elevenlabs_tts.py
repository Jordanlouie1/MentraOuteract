import os
from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs
from elevenlabs import save

load_dotenv()

# Load your API key from environment variable
api_key = os.getenv("ELEVENLABS_API_KEY")
voice_id = os.getenv("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb")  # Default voice

# Initialize ElevenLabs client
client = ElevenLabs(api_key=api_key)

def generate_speech_from_txt(txt_path: str):
    if not os.path.exists(txt_path):
        print(f"[⚠️] Text file not found: {txt_path}")
        return

    with open(txt_path, "r") as f:
        text = f.read().strip()

    if not text:
        print("[⚠️] Text file is empty.")
        return

    print(f"[🗣️] Sending to ElevenLabs: {text}")

    # Request TTS audio from ElevenLabs
    audio = client.text_to_speech.convert(
        text=text,
        voice_id=voice_id,
        model_id="eleven_multilingual_v2",
        output_format="mp3_44100_128",
    )

    # Save audio to file
    filename_base = os.path.splitext(os.path.basename(txt_path))[0]
    output_dir = os.path.dirname(txt_path)
    audio_path = os.path.join(output_dir, f"{filename_base}.mp3")

    save(audio, audio_path)

    print(f"[✅] Audio saved to: {audio_path}")
    return audio_path