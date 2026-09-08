"""voice_tts.py — text-to-speech output for Jarvis voice replies.

Engine resolution (first match wins):
    1. VOICE_TTS_ENGINE env var: piper | espeak | beep | none
    2. ``piper`` binary on PATH (+ PIPER_MODEL / PIPER_MODEL_DIR)
    3. ``espeak-ng`` or ``espeak`` binary on PATH
    4. built-in sonar-style acknowledgment beep via ``aplay``
    (playback requires ``aplay``/``paplay``; if absent, audio is skipped)

``say()`` is non-blocking: audio plays on a background thread so the voice
pipeline never stalls on an unavailable speaker.
"""

from __future__ import annotations

import logging
import os
import shutil
import struct
import subprocess
import tempfile
import threading
import wave

LOG = logging.getLogger("voice_tts")

SAMPLE_RATE = 22050


# ---------------------------------------------------------------------------
# WAV synthesis (fallback + espeak passthrough)
# ---------------------------------------------------------------------------

def _write_wav(path: str, samples: bytes) -> None:
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(samples)


def _sine_tone(freq: float, seconds: float, volume: float = 0.35) -> bytes:
    n = int(SAMPLE_RATE * seconds)
    out = bytearray()
    for i in range(n):
        env = min(1.0, i / (SAMPLE_RATE * 0.02)) * min(1.0, (n - i) / (SAMPLE_RATE * 0.06))
        val = int(32767 * volume * env * __import__("math").sin(2 * __import__("math").pi * freq * i / SAMPLE_RATE))
        out += struct.pack("<h", val)
    return bytes(out)


# ---------------------------------------------------------------------------
# Engines
# ---------------------------------------------------------------------------

class _EspeakEngine:
    name = "espeak"

    def __init__(self):
        self.bin = shutil.which("espeak-ng") or shutil.which("espeak") or "espeak-ng"
        self.voice = os.getenv("VOICE_TTS_VOICE", "en-us")

    def synth(self, text: str, wav_path: str) -> bool:
        cmd = [self.bin, "-v", self.voice, "-s", os.getenv("VOICE_TTS_SPEED", "160"), "-w", wav_path, text]
        return subprocess.run(cmd, timeout=30, capture_output=True).returncode == 0 and os.path.getsize(wav_path) > 44


class _PiperEngine:
    name = "piper"

    def __init__(self):
        self.bin = shutil.which("piper") or "piper"
        model = os.getenv("PIPER_MODEL", os.getenv("PIPER_MODEL_DIR", ""))
        self.model = model if model and os.path.exists(model) else None

    def synth(self, text: str, wav_path: str) -> bool:
        if not self.model:
            return False
        try:
            with open(wav_path, "wb") as out:
                p = subprocess.run(
                    [self.bin, "-m", self.model, "-f", wav_path],
                    input=text.encode(), timeout=60, capture_output=True,
                )
            return p.returncode == 0 and os.path.getsize(wav_path) > 44
        except Exception:
            return False


class _BeepEngine:
    """No accessible TTS: play a short upload/download sonar blip instead."""

    name = "beep"

    def synth(self, text: str, wav_path: str) -> bool:
        try:
            samples = _sine_tone(880, 0.09, 0.3) + _sine_tone(1320, 0.12, 0.3)
            _write_wav(wav_path, samples)
            return os.path.getsize(wav_path) > 44
        except Exception:
            return False


class _NoneEngine:
    name = "none"

    def synth(self, text: str, wav_path: str) -> bool:
        LOG.info("TTS engine disabled — reply: %s", text)
        return True


# ---------------------------------------------------------------------------
# Player
# ---------------------------------------------------------------------------

def _play_wav(wav_path: str) -> bool:
    player = os.getenv("VOICE_PLAYER")
    if player:
        cmd = player.split() + [wav_path]
    elif shutil.which("aplay"):
        cmd = ["aplay", "-q", wav_path]
    elif shutil.which("paplay"):
        cmd = ["paplay", wav_path]
    else:
        LOG.warning("No audio player found; skipping playback")
        return False
    try:
        subprocess.run(cmd, timeout=20, capture_output=True)
        return True
    except Exception as exc:
        LOG.warning("Playback failed: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

class TTS:
    """Simple non-blocking text-to-speech with single-threaded playback queue-ish
    semantics (each call plays in a fresh thread, so long replies don't stack)."""

    def __init__(self) -> None:
        self._engine = self._pick_engine()
        if self._engine.name != "none":
            LOG.info("TTS engine: %s", self._engine.name)

    def _pick_engine(self):
        forced = os.getenv("VOICE_TTS_ENGINE", "").lower()
        if forced:
            choices = {
                "piper": _PiperEngine, "espeak": _EspeakEngine,
                "beep": _BeepEngine, "none": _NoneEngine,
            }
            if forced in choices:
                if forced == "beep" and not (shutil.which("aplay") or shutil.which("paplay")):
                    LOG.warning("Forced beep engine but no audio player found")
                    return _NoneEngine()
                return choices[forced]()
        piper = _PiperEngine()
        if shutil.which("piper") and piper.model:
            return piper
        if shutil.which("espeak-ng") or shutil.which("espeak"):
            return _EspeakEngine()
        if shutil.which("aplay") or shutil.which("paplay"):
            return _BeepEngine()
        return _NoneEngine()

    def say(self, text: str) -> None:
        if not text or not text.strip():
            return
        threading.Thread(target=self._say_sync, args=(text,), daemon=True).start()

    def _say_sync(self, text: str) -> None:
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
                wav_path = tf.name
            if not self._engine.synth(text, wav_path):
                LOG.warning("TTS synthesis failed for %r", text[:60])
                return
            _play_wav(wav_path)
        except Exception as exc:
            LOG.warning("TTS error: %s", exc)
        finally:
            try:
                os.unlink(wav_path)
            except Exception:
                pass


tts = TTS()


def say(text: str) -> None:
    tts.say(text)