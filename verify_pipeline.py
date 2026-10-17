import time
import numpy as np
from vishing_detector import VishingDetector

# Instantiate detector in fast test mode
detector = VishingDetector(model_path=None, use_whisper=False)

# Simulate 2.0s of 16kHz audio (32,000 float32 samples)
synthetic_chunk = np.random.uniform(-0.3, 0.3, 32000).astype(np.float32)

t0 = time.time()
acoustic, semantic = detector.analyze_window(
    synthetic_chunk,
    transcript_override="This is Mumbai Police. You are placed under Digital Arrest. Transfer penalty immediately."
)
duration_ms = (time.time() - t0) * 1000

print(f"Inference Latency: {duration_ms:.2f} ms")
print("Acoustic Output:", acoustic)
print("Semantic Output:", semantic)