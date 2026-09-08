#!/usr/bin/env python3
"""
voice_capture_daemon.py — Live mic capture daemon for Jarvis SIEM voice interface.

Workflow:
  1. Opens the default ALSA capture device via PyAudio (16 kHz mono).
  2. Feeds audio chunks to openWakeWord and watches for the
     `hey_jarvis` model firing (stands in for "hey diva" until a custom
     model is dropped in).
  3. On wake-word detection:
       a. Writes  voice_state=listening  voice_source=mic  to voice.log
       b. Captures up to WAKE_WORD_COOLDOWN seconds of post-wake audio,
          stopping early on sustained silence.
       c. Transcribes the captured audio with SpeechRecognition
          (Google Web Speech API first; pocketsphinx fallback).
       d. Writes  voice_state=thinking  (with status text)  to voice.log
       e. Writes  voice_state=speaking  voice_text=<transcription>  to voice.log
       f. Writes  voice_state=idle  to voice.log
  4. On any exception: writes voice_state=error and keeps running.
  5. Writes a heartbeat voice_state=listening every 30 s so the UI
     reflects a live mic.

The siem_ingest.py pipeline watches voice.log and inserts each
voice_state line into the SQLite events table.  The dashboard's
/api/voice/events endpoint then streams them to VoicePanel.

Run:
    python3 voice_capture_daemon.py
"""

from __future__ import annotations

import io
import logging
import os
import signal
import sys
import time
import wave
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pyaudio
import speech_recognition as sr
from openwakeword.model import Model

from siem_voice import resolve_intent

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
VOICE_LOG = BASE_DIR / "voice" / "voice.log"

# Custom "hey diva" ONNX model can be dropped here for tighter matching.
# Until then we use the built-in openWakeWord "hey_jarvis" model as a stand-in.
OW_MODEL_DIR = Path(__file__).resolve().parent / "voice" / "models"
# Default openWakeWord model bundle lives inside the package:
OW_DEFAULT_MODELS = Path(__file__).resolve().parent / ".venv" / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "site-packages" / "openwakeword" / "resources" / "models"

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
AUDIO_RATE = 16000          # Hz — openWakeWord + SR both want 16k
AUDIO_CHANNELS = 1          # mono
AUDIO_WIDTH = 2             # 16-bit
CHUNK_SIZE = 1280           # 80 ms @ 16 kHz — openWakeWord default chunk
OPENWAKEWORD_THRESHOLD = 0.5  # detection confidence (0..1)
WAKE_WORD_COOLDOWN = 5.0    # seconds of post-wake audio to capture
SILENCE_CHUNKS_BEFORE_END = 15   # ~1.2 s silence → end phrase early
SILENCE_RMS_THRESHOLD = 300      # RMS amplitude below this → silence

LOG = logging.getLogger("voice")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def log_voice_event(state: str, text: str = "", source: str = "mic") -> None:
    """Append a voice event line to voice.log (parsed by siem_ingest)."""
    ts = datetime.now(timezone.utc).isoformat()
    line = f"[{ts}] voice_state={state} voice_text={text} voice_source={source}\n"
    try:
        VOICE_LOG.parent.mkdir(parents=True, exist_ok=True)
        with open(VOICE_LOG, "a") as fh:
            fh.write(line)
            fh.flush()
    except Exception as exc:
        LOG.error("Failed to write voice.log: %s", exc)
    LOG.info("voice_event: state=%s text=%r source=%s", state, text, source)


def log_error(msg: str) -> None:
    log_voice_event("error", text=msg[:200])


# ---------------------------------------------------------------------------
# Wake-word engine
# ---------------------------------------------------------------------------

class WakeWordEngine:
    """Wraps openWakeWord; uses the built-in `hey_jarvis` model as a stand-in
    for "hey diva" until a custom model is placed in OW_MODEL_DIR.

    Uses the built-in openWakeWord ``hey_jarvis`` model as a stand-in
    for ``hey diva``.  To use a tighter custom model, drop an ONNX file
    into ``OW_MODEL_DIR`` and update ``WakeWordEngine._init_openwakeword``
    to pass ``wakeword_model_paths=[...]``."""

    def __init__(self) -> None:
        self.ow_model: Model | None = None
        self.use_ow = False
        self._init_openwakeword()

    def _init_openwakeword(self) -> None:
        try:
            # openWakeWord's Model() takes wakeword_model_paths (list of .onnx files).
            # If no paths are given it auto-loads the built-in models (alexa, hey_jarvis, etc.)
            # from its resources/models/ directory.  We prefer the default bundle so that
            # hey_jarvis is available out of the box; a custom "hey diva" model can be
            # placed in OW_MODEL_DIR and passed via wakeword_model_paths instead.
            candidate_paths = []
            if OW_DEFAULT_MODELS.exists():
                for p in sorted(OW_DEFAULT_MODELS.iterdir()):
                    if p.suffix == ".onnx":
                        candidate_paths.append(str(p))
            self.ow_model = Model(wakeword_model_paths=candidate_paths)
            self.use_ow = True
            available = list(self.ow_model.models.keys())
            LOG.info("openWakeWord loaded; available models: %s", available)
            # Model keys are filenames like "hey_jarvis_v0.1" — match on prefix
            has_hey = any(k.startswith("hey_jarvis") for k in available)
            if not has_hey:
                LOG.warning(
                    "hey_jarvis model not found — wake-word detection will not "
                    "fire until a suitable model is added"
                )
        except Exception as exc:
            LOG.warning("openWakeWord init failed (%s) — wake-word detection disabled", exc)

    def detect(self, samples: np.ndarray) -> bool:
        """Return True if wake word detected.

        samples: 1-D float32 numpy array, values in [-1, 1], mono, 16 kHz.
        """
        if not self.use_ow or self.ow_model is None:
            return False
        try:
            predictions = self.ow_model.predict(samples.reshape(1, -1))
            if isinstance(predictions, dict):
                # Only consider hey_jarvis-family models for wake-word detection
                for model_name, score in predictions.items():
                    if model_name.startswith("hey_jarvis") and score > OPENWAKEWORD_THRESHOLD:
                        LOG.info("openWakeWord hit: %s = %.3f", model_name, score)
                        return True
        except Exception as exc:
            LOG.debug("openWakeWord predict failed: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Speech recognition
# ---------------------------------------------------------------------------

class SpeechTranscriber:
    """Transcribe a WAV blob.  Tries Google Web Speech first (needs internet),
    falls back to pocketsphinx."""

    def __init__(self) -> None:
        self.recognizer = sr.Recognizer()

    def transcribe(self, audio_bytes: bytes, rate: int = AUDIO_RATE) -> str:
        """Return transcribed text, or empty string on failure."""
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wav:
            wav.setnchannels(AUDIO_CHANNELS)
            wav.setsampwidth(AUDIO_WIDTH)
            wav.setframerate(rate)
            wav.writeframes(audio_bytes)
        buf.seek(0)

        with sr.AudioFile(buf) as source:
            audio = self.recognizer.record(source)

        # Try Google (needs internet)
        try:
            text = self.recognizer.recognize_google(audio)
            LOG.info("STT (Google): %r", text)
            return text
        except sr.RequestError as exc:
            LOG.warning("Google STT unavailable: %s — falling back to pocketsphinx", exc)
        except sr.UnknownValueError:
            LOG.info("STT: audio heard but not understood (Google)")
            return ""

        # Fallback: pocketsphinx
        try:
            text = self.recognizer.recognize_sphinx(audio)
            LOG.info("STT (pocketsphinx): %r", text)
            return text
        except Exception as exc:
            LOG.warning("pocketsphinx STT failed: %s", exc)
            return ""


# ---------------------------------------------------------------------------
# Audio capture
# ---------------------------------------------------------------------------

class MicCapture:
    """Record raw PCM from the default input device."""

    def __init__(self) -> None:
        # Suppress noisy ALSA/JACK warnings from stderr during init
        import os as _os
        _os.environ.setdefault("ALSA_LOGLEVEL", "0")

        self.audio = pyaudio.PyAudio()
        self.stream = self.audio.open(
            format=pyaudio.paInt16,
            channels=AUDIO_CHANNELS,
            rate=AUDIO_RATE,
            input=True,
            frames_per_buffer=CHUNK_SIZE,
            input_device_index=None,  # default device
        )
        LOG.info(
            "Mic opened: rate=%dHz channels=%d chunk=%d bytes",
            AUDIO_RATE, AUDIO_CHANNELS, CHUNK_SIZE,
        )

    def read_chunk(self) -> bytes:
        """Read one chunk of raw PCM bytes.  Returns empty bytes on error."""
        try:
            return self.stream.read(CHUNK_SIZE)
        except Exception as exc:
            LOG.error("Mic read error: %s", exc)
            return b""

    def close(self) -> None:
        try:
            self.stream.stop_stream()
            self.stream.close()
        except Exception:
            pass
        try:
            self.audio.terminate()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

_running = True


def _handle_signal(signum: int, frame) -> None:
    global _running
    LOG.info("Received signal %d — shutting down", signum)
    _running = False


def _rms(samples: np.ndarray) -> float:
    """Root-mean-square amplitude of the samples."""
    return float(np.sqrt(np.mean(np.square(samples))))


def main() -> None:
    global _running
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    VOICE_LOG.parent.mkdir(parents=True, exist_ok=True)

    log_voice_event("listening", text="", source="mic")
    LOG.info("Voice capture daemon starting")

    try:
        mic = MicCapture()
    except Exception as exc:
        log_error(f"mic init failed: {exc}")
        return

    wakeword = WakeWordEngine()
    transcriber = SpeechTranscriber()

    # Post-detection capture state
    post_chunks: list[bytes] = []
    post_start: float = 0.0
    capturing: bool = False
    silence_count: int = 0

    try:
        while _running:
            chunk_bytes = mic.read_chunk()
            if not chunk_bytes:
                time.sleep(0.01)
                continue

            # Convert to float32 samples in [-1, 1] for openWakeWord
            samples = np.frombuffer(chunk_bytes, dtype=np.int16).astype(np.float32) / 32768.0

            # Phase 1: wake-word detection (always running)
            if wakeword.detect(samples):
                LOG.info("WAKE WORD DETECTED")
                log_voice_event("listening", text="", source="mic")
                capturing = True
                post_chunks = []
                post_start = time.time()
                silence_count = 0
                continue

            # Phase 2: capture speech after wake word
            if capturing:
                post_chunks.append(chunk_bytes)
                elapsed = time.time() - post_start

                rms_val = _rms(samples)
                if rms_val < SILENCE_RMS_THRESHOLD:
                    silence_count += 1
                else:
                    silence_count = 0

                # End conditions: timeout OR enough silence
                if elapsed >= WAKE_WORD_COOLDOWN or silence_count >= SILENCE_CHUNKS_BEFORE_END:
                    capturing = False
                    _process_captured_audio(post_chunks, transcriber)
                    post_chunks = []
                    log_voice_event("idle", text="", source="mic")

            # Periodic heartbeat so the UI shows we're alive
            if int(time.time()) % 30 == 0:
                log_voice_event("listening", text="", source="mic")

    except Exception as exc:
        log_error(f"daemon error: {exc}")
        raise
    finally:
        mic.close()
        log_voice_event("idle", text="", source="mic")
        LOG.info("Voice capture daemon stopped")


def _process_captured_audio(chunks: list[bytes], transcriber: SpeechTranscriber) -> None:
    if not chunks:
        LOG.info("No audio captured after wake word")
        log_voice_event("thinking", text="(no audio)", source="mic")
        return

    audio_blob = b"".join(chunks)
    LOG.info("Captured %d bytes of audio for transcription", len(audio_blob))

    log_voice_event("thinking", text="Processing speech...", source="mic")

    text = transcriber.transcribe(audio_blob)
    if text:
        try:
            server_url = os.getenv("VOICE_SERVER_URL", "http://127.0.0.1:8170")
            intent_res = resolve_intent(text, server_url=server_url)
            reply = intent_res.get("reply") or text
            log_voice_event("speaking", text=reply, source="mic")
            LOG.info("Transcribed: %r -> intent %s reply %r",
                     text, intent_res.get("intent"), reply)
            try:
                import voice_tts
                voice_tts.tts.say(reply)
            except Exception:
                LOG.warning("TTS unavailable", exc_info=True)
        except Exception:
            log_voice_event("speaking", text=text.strip(), source="mic")
            LOG.info("Transcribed: %r", text)
    else:
        log_voice_event("speaking", text="(no speech recognized)", source="mic")


if __name__ == "__main__":
    main()
