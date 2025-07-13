import sys
import os
import pathlib
from PIL import Image
import google.generativeai as genai
from vapi_speak import speak_result_from_txt
from elevenlabs_tts import generate_speech_from_txt  # make sure to import your TTS module


# === 🔐 Set your API key ===
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

def load_prompt(prompt_path="prompt.txt") -> str:
    if not os.path.exists(prompt_path):
        raise FileNotFoundError(f"Prompt file not found: {prompt_path}")
    with open(prompt_path, "r") as f:
        return f.read()

def send_to_gemini(image_path: str, prompt: str) -> str:
    model = genai.GenerativeModel('gemini-2.5-flash')
    with open(image_path, "rb") as img_file:
        image = Image.open(img_file)
        response = model.generate_content([prompt, image], stream=False)
        return response.text

def save_output(output_text: str, output_file_path: str):
    with open(output_file_path, "w") as f:
        f.write(output_text)

def process_image(image_path: str) -> str:
    print(f"[INFO] Processing image: {image_path}")

    # Load prompt
    prompt = load_prompt("prompt.txt")

    # Send to Gemini
    result_text = send_to_gemini(image_path, prompt)

    # Save to output file
    filename_no_ext = pathlib.Path(image_path).stem
    output_dir = "output"
    os.makedirs(output_dir, exist_ok=True)
    output_file = os.path.join(output_dir, f"{filename_no_ext}_result.txt")
    save_output(result_text, output_file)

    print(f"[✅] Output saved to {output_file}")
    print(f"[🧠 Gemini Response]:\n{result_text}")

    return output_file  # ✅ return the path to the saved result

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python call.py path/to/image.jpg")
        sys.exit(1)

    image_path = sys.argv[1]
    result_txt_path = process_image(image_path)
    generate_speech_from_txt(result_txt_path)