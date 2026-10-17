import os
import glob
import librosa
import soundfile as sf

# Look for your mp3 file in the project folder
input_file = "cbi_digital_arrest.mp3"
output_file = "audio_samples/02_cbi_digital_arrest.wav"

os.makedirs("audio_samples", exist_ok=True)

# If the filename has a slightly different name, find any mp3 in the current directory
if not os.path.exists(input_file):
    mp3_files = glob.glob("*.mp3")
    if mp3_files:
        input_file = mp3_files[0]
        print(f"Detected audio file: {input_file}")
    else:
        print(f"Error: Could not find '{input_file}' or any .mp3 file in {os.getcwd()}")
        exit(1)

# Load mp3 and resample to 16kHz mono float32
print(f"Loading and converting {input_file}...")
y, sr = librosa.load(input_file, sr=16000, mono=True)

# Save standard 16kHz PCM WAV for the model and frontend
sf.write(output_file, y, 16000, subtype="PCM_16")
print(f"Success! Converted and saved: {output_file}")