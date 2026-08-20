#!/usr/bin/env python3
"""Rebuild assets/data.json from the 7k-checkpoint evaluation dump.

Selection is fixed in SELECTED: the first three clips were kept from the
earlier pass, the rest were re-picked because their reference lines carried
ASR truncations that the model faithfully spoke out loud.
"""
import json
import os
import subprocess

BENCH = ("/primus_xpfs_workspace_T04/liuyichen/LTX-evaluate/output/"
         "bench_additive_single_step7000_latest/additive_single")
WEB = "/primus_xpfs_workspace_T04/liuyichen/tcr-webpage"

SELECTED = [
    ("clip_32845", "Night exterior, six shots"),
    ("clip_3004",  "Historical interior"),
    ("clip_59538", "Six lines in ten seconds"),
    ("clip_21577", "Four long lines"),
    ("clip_86114", "Palace interior"),
    ("clip_56767", "A refusal, five shots"),
    ("clip_95126", "Makeshift office, five shots"),
]


def load_bench():
    results = json.load(open(f"{BENCH}/eval_results.json"))
    clips = results["clips"] if isinstance(results, dict) else results
    by_name = {c["clip_name"].replace(".mp4", ""): c for c in clips}

    inputs = json.load(open(f"{BENCH}/eval_input_all.json"))
    by_path = {}
    for row in inputs:
        stem = os.path.basename(row["media_path"]).replace(".mp4", "")
        by_path[stem] = row
    return by_name, by_path


def probe(path):
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height", "-of", "csv=p=0", path])
    w, h = out.decode().strip().split(",")
    return int(w), int(h)


def build():
    bench, inputs = load_bench()
    rows = []
    for clip_id, title in SELECTED:
        c, src = bench[clip_id], inputs[clip_id]
        cap = json.loads(src["caption"])

        shots = []
        for i, d in enumerate(c["shots"]["details"], 1):
            exp, got = d["expected"], d.get("detected")
            shots.append({
                "id": f"S{i}",
                "req": [round(x, 3) for x in exp],
                "got": [round(x, 3) for x in got] if got else None,
                "err": round(max(abs(d.get("start_error") or 0),
                                 abs(d.get("end_error") or 0)), 3),
                "desc": cap["shots"][i - 1]["visual_description"]
                        if i <= len(cap["shots"]) else "",
            })

        lines = [e for e in cap["events"] if e["type"] == "dialogue"]
        dialogue = []
        for i, d in enumerate(c["dialogues"]["details"], 1):
            exp, got = d["expected"], d.get("detected")
            ev = lines[i - 1] if i <= len(lines) else {}
            dialogue.append({
                "id": f"D{i}",
                "req": [round(x, 3) for x in exp],
                "got": [round(x, 3) for x in got] if got else None,
                "err": round(abs(d.get("start_error") or 0), 3),
                "line": d.get("expected_text", ""),
                "speaker": ev.get("content", {}).get("speaker", ""),
                "heard": d.get("detected_text", ""),
            })

        w, h = probe(f"{WEB}/assets/videos/{clip_id}.mp4")
        rows.append({
            "id": clip_id,
            "title": title,
            "duration": round(c["video_duration"], 2),
            "scene": cap["scene_description"],
            "style": cap["global_style"],
            "audio": cap["global_audio"],
            "shots": shots,
            "dialogue": dialogue,
            "metrics": {
                "bmae": round(c["shots"]["avg_boundary_mae"], 3),
                "iou": round(c["shots"]["avg_iou"], 3),
                "nshot": len(shots),
                "ndia": len(dialogue),
                "dstart": round(c["dialogues"]["avg_start_mae"], 3),
            },
            "w": w, "h": h,
        })
    return rows


def write_payload(rows, web=WEB):
    text = json.dumps(rows, ensure_ascii=False, indent=1)
    open(f"{web}/assets/data.json", "w").write(text)
    open(f"{web}/assets/data.js", "w").write("window.TCR_DATA = " + text.rstrip() + ";\n")


if __name__ == "__main__":
    rows = build()
    write_payload(rows)
    for r in rows:
        print(f"{r['id']:<14} {r['w']}x{r['h']} {r['duration']:>5.1f}s  "
              f"{r['metrics']['nshot']}shot {r['metrics']['ndia']}line  "
              f"B-MAE {r['metrics']['bmae']:.3f}  {r['title']}")
