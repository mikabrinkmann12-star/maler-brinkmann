# Erzeugt aus scripts/anruf-demo-daten.json je Demo-Anruf eine Sprachdatei (public/demo-anrufe/<id>.mp3):
# KI = Stimme „Katja“, Anrufer = Stimme aus „anrufer_stimme“. Nutzt das Paket edge-tts (inoffizieller Zugang zu den Vorlese-Stimmen von Microsoft Edge,
# kostenlos, nur für die Vorführung gedacht; Nutzungsbedingungen von Microsoft beachten). Dazu wird ffmpeg gebraucht.
#
# Einrichten (einmalig, in einer eigenen Umgebung):  python -m venv .tts-venv  und  .tts-venv/Scripts/python -m pip install edge-tts
# Aufruf:  .tts-venv/Scripts/python scripts/anruf-demo-audio.py
import asyncio
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import edge_tts

WURZEL = Path(__file__).resolve().parent.parent
DATEN = WURZEL / "scripts" / "anruf-demo-daten.json"
ZIEL = WURZEL / "public" / "demo-anrufe"
KI_STIMME = "de-DE-KatjaNeural"
PAUSE_SEK = 0.45


def ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args], check=True)


def dauer(datei: Path) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(datei)],
        capture_output=True, text=True, check=True,
    )
    return float(r.stdout.strip())


async def main() -> None:
    ZIEL.mkdir(parents=True, exist_ok=True)
    anrufe = json.loads(DATEN.read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        stille = tmp / "stille.mp3"
        ffmpeg("-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", str(PAUSE_SEK), "-c:a", "libmp3lame", "-b:a", "48k", str(stille))
        for a in anrufe:
            teile = []
            for i, (sprecher, text) in enumerate(a["gespraech"]):
                datei = tmp / f"{a['id']}-{i}.mp3"
                stimme = KI_STIMME if sprecher == "KI" else a["anrufer_stimme"]
                await edge_tts.Communicate(text, stimme).save(str(datei))
                teile.append(datei)
            liste = tmp / f"{a['id']}.txt"
            zeilen = []
            for i, t in enumerate(teile):
                if i:
                    zeilen.append(f"file '{stille.as_posix()}'")
                zeilen.append(f"file '{t.as_posix()}'")
            liste.write_text("\n".join(zeilen), encoding="utf-8")
            ziel = ZIEL / f"{a['id']}.mp3"
            ffmpeg("-f", "concat", "-safe", "0", "-i", str(liste), "-c:a", "libmp3lame", "-b:a", "48k", str(ziel))
            print(f"{a['id']}: {round(dauer(ziel))} Sek, {ziel.stat().st_size // 1024} KB")


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
