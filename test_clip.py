import librosa
import numpy as np
from vishing_detector import VishingDetector

detector = VishingDetector(model_path=None, use_whisper=False)

audio_path = "audio_samples/02_cbi_digital_arrest.wav"
y, sr = librosa.load(audio_path, sr=16000)

# Trim leading and trailing silence
y_trimmed, _ = librosa.effects.trim(y, top_db=20)

# Take 2.0s (32,000 samples) from the voiced segment
if len(y_trimmed) >= 32000:
    chunk_2s = y_trimmed[:32000]
else:
    # Pad with zero if shorter than 2s
    chunk_2s = np.pad(y_trimmed, (0, 32000 - len(y_trimmed)))

transcript_text = (
    "This is Inspector Sharma from Mumbai Cyber Crime. Your identity is linked "
    "to a money laundering warrant. You are under Digital Arrest. Transfer funds "
    "to the RBI supervision account immediately."
)

acoustic, semantic = detector.analyze_window(chunk_2s, transcript_override=transcript_text)

print("\n--- ACOUSTIC FORENSICS (VOICED REGION) ---")
print(acoustic)

print("\n--- COERCION ANALYSIS ---")
print(semantic)