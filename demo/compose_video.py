import subprocess
from pathlib import Path

root = Path(__file__).parent
frames = sorted((root / "frames").glob("*.png"))
audio = root / "audio" / "narration.mp3"
out = root / "GroundTruth-demo-AVP.mp4"

# probe duration
dur = float(
    subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(audio),
        ],
        text=True,
    ).strip()
)
per = dur / len(frames)
print(f"audio={dur:.2f}s frames={len(frames)} per={per:.2f}s")

inputs = []
for f in frames:
    inputs += ["-loop", "1", "-t", f"{per:.3f}", "-i", str(f)]
inputs += ["-i", str(audio)]

filters = []
for i in range(len(frames)):
    # subtle slow zoom (Ken Burns) on paper-toned padded frame
    filters.append(
        f"[{i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,"
        f"pad=1920:1080:(ow-iw)/2:(oh-ih)/2:#f4f0e6,"
        f"setsar=1,fps=25,"
        f"zoompan=z='min(1.0+0.00035*on,1.06)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=25,"
        f"format=yuv420p[v{i}]"
    )
concat_in = "".join(f"[v{i}]" for i in range(len(frames)))
filters.append(f"{concat_in}concat=n={len(frames)}:v=1:a=0[v]")
fc = ";".join(filters)

cmd = [
    "ffmpeg",
    "-y",
    *inputs,
    "-filter_complex",
    fc,
    "-map",
    "[v]",
    "-map",
    f"{len(frames)}:a",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    "-movflags",
    "+faststart",
    str(out),
]
print(" ".join(cmd[:8]), "...")
subprocess.check_call(cmd)
print("wrote", out, "size_mb", round(out.stat().st_size / 1e6, 2))
