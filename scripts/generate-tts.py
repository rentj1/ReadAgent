#!/usr/bin/env python3
"""
Generate TTS audio for book-reader using DashScope CosyVoice.
Generates one MP3 per paragraph, saved to public/audio/{seg_id}/{para_id}.mp3

Usage:
  # Original CLI mode (hardcoded chapter5 data):
  python3.11 scripts/generate-tts.py [seg-01] [seg-02] ...

  # Dynamic mode (data from JSON file, progress as JSON lines):
  python3.11 scripts/generate-tts.py --data-file /tmp/segment.json --json-output
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

import dashscope
from dashscope.audio.tts_v2 import SpeechSynthesizer, ResultCallback

# Config
API_KEY = os.environ.get("DASHSCOPE_API_KEY", "sk-xxx")
MODEL = "cosyvoice-v3-flash"
VOICE = "longanyang"

dashscope.api_key = API_KEY
dashscope.base_websocket_api_url = "wss://dashscope.aliyuncs.com/api-ws/v1/inference"

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
PUBLIC_AUDIO_DIR = PROJECT_ROOT / "public" / "audio"

BOOK_TITLE_TTS = "小而美，持续盈利的经营法则"

# Hardcoded data for original CLI mode
SEGMENTS = [
    {
        "id": "seg-01",
        "title": "第五章，通过做自己来营销",
        "paragraphs": [
            {"id": "seg-01-p01", "text": "营销其实就是分享你所热爱的东西。——迈克尔·凯悦"},
            {"id": "seg-01-p02", "text": "恭喜你！你有了社区、一个产品和100个客户。这意味着你达到了产品和市场的最佳契合点。回头客意味着你的生意在没有持续的推销活动的情况下能够继续发展下去，这样你可以开始专注于规模的扩张。"},
            {"id": "seg-01-p03", "text": "营销，就是大规模销售。在能够进行营销活动之前，你需要将产品卖给100个客户，那是因为你的营销要建立在销售过程的基础之上。销售是向外逐个攻破，而营销是向内一次吸引几百个潜在客户。销售让你的客户达到100个，营销会让你的客户达到数千个。"},
            {"id": "seg-01-p04", "text": "但是不要把营销和广告混为一谈。广告要花钱，极简主义创业者只在万不得已的时候才花钱。最好从花时间而不是花金钱开始。博客帖子免费，推特、照片墙、油管和Clubhouse也都免费。与其花钱，不如从在这些地方建立一个受众群体开始。"},
            {"id": "seg-01-p05", "text": "你从利用一个已经存在的社区开始创业，现在是时候继续前行建立一个受众群体了。两者的区别在哪儿？你的社区是你受众的一部分，但你的受众并不是你社区的一部分。受众群体是一个当你有话要说时你的信息能触达的所有人组成的网络。"},
            {"id": "seg-01-p06", "text": "销售让你在这些新的人群中试水，因为它迫使你走出你的舒适区，一个一个地去说服他们，同时在这个过程中改进你的产品。营销更难，因为你必须让客户走出他们的舒适区来你这里，而不是你去他们那里。"},
            {"id": "seg-01-p07", "text": "但如果你能想清楚如何让客户来找你，扩大生意规模在方方面面都会变得容易很多。招聘变得更容易，销售变得更容易，业务增长变得更容易。当你有一个每天都在扩大的群体支持你取得成功时，创业的每一件事都会变得更容易。"},
            {"id": "seg-01-p08", "text": "人们不会从陌生人一步到位变成客户，他们从陌生人开始到模糊地知道你的存在，到渐渐成为粉丝，再到成为客户，最后成为帮你宣传扩散的回头客。从制造粉丝开始。"},
            {"id": "seg-01-p09", "text": "想想你很喜欢的一个企业，你能说出创始人的名字吗？能想象出他们办公室的样子吗？你脑海里能「听」到他们的声音吗？我敢打赌，对于很多企业而言，答案是肯定的。因为你读过关于他们的文章，在社交媒体上关注了他们。"},
            {"id": "seg-01-p10", "text": "大部分创始人不习惯将自己置于企业发展的故事的中心。但是你需要这么做。人们不在乎企业，他们在乎别人。你有可以提供的东西，而且现有的客户很在乎这种东西。他们为你的劳动成果付费，对你的想法感兴趣，想知道你为什么做出某些特定的决定以及你的产品是怎么诞生的。"},
            {"id": "seg-01-p11", "text": "建立一个受众群体，朝着制造粉丝迈出的第一步就是大规模地进行这些对话。"},
        ],
    },
]


def clean_title_for_tts(title: str) -> str:
    """去除 （1/6） 这类分页标记，避免被 TTS 读成"六分之一"。"""
    return re.sub(r'[（(]\d+/\d+[）)]', '', title).strip()


def log(msg, json_output=False):
    """Print to stderr so it doesn't pollute JSON stdout stream."""
    if json_output:
        print(msg, file=sys.stderr)
    else:
        print(msg)


def dedupe_word_timestamps(words: list) -> list:
    """
    CosyVoice 在流式合成时会多次通过 on_event 推送同一句的 words，若全部 append 会导致
    JSON 里重复多遍「恭」「喜」等条目，Remotion 侧匹配错乱。按 (begin_index, end_index)
    去重，保留最后一次（通常更完整）。
    """
    by_span = {}
    for w in words:
        bi = w.get("begin_index")
        ei = w.get("end_index")
        if bi is None or ei is None:
            continue
        by_span[(bi, ei)] = w
    return sorted(by_span.values(), key=lambda x: (x["begin_index"], x["end_index"]))


class TTSCallback(ResultCallback):
    def __init__(self, output_path: Path):
        self.output_path = output_path
        self.file = None
        self.words = []
        self.error_msg = None

    def on_open(self):
        self.file = open(self.output_path, "wb")

    def on_complete(self):
        if self.file:
            self.file.close()
            self.file = None
            
        # 存时间戳文件（去重后再写入）
        if self.words:
            json_path = self.output_path.with_suffix('.json')
            cleaned = dedupe_word_timestamps(self.words)
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(cleaned, f, ensure_ascii=False, indent=2)

    def on_error(self, message: str):
        self.error_msg = message
        if self.file:
            self.file.close()
            self.file = None

    def on_close(self):
        if self.file:
            self.file.close()
            self.file = None

    def on_event(self, message):
        try:
            json_data = json.loads(message)
            if json_data.get('payload') and json_data['payload'].get('output') and json_data['payload']['output'].get('sentence'):
                sentence = json_data['payload']['output']['sentence']
                words = sentence.get('words')
                if words:
                    for word in words:
                        # accumulate all words
                        self.words.append(word)
        except Exception:
            pass

    def on_data(self, data: bytes) -> None:
        if self.file:
            self.file.write(data)


def generate_audio_for_paragraph(para_id: str, text: str, output_path: Path, json_output=False) -> bool:
    # 强制覆盖以确保能重新生成对应的 JSON 文件
    # if output_path.exists():
    #     log(f"  ✓ Already exists: {output_path.name}, skipping", json_output)
    #     return True

    log(f"  → Generating: {para_id}", json_output)
    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        callback = TTSCallback(output_path)
        synthesizer = SpeechSynthesizer(
            model=MODEL, 
            voice=VOICE,
            callback=callback,
            additional_params={'word_timestamp_enabled': True}
        )
        
        # 异步调用，并等待完成
        synthesizer.call(text)
        
        # wait for completion, add timeout to prevent hanging
        timeout = 60
        start_time = time.time()
        while callback.file is not None:
            if time.time() - start_time > timeout:
                log(f"  ✗ Timeout waiting for {para_id} to finish", json_output)
                if callback.file:
                    callback.file.close()
                    callback.file = None
                return False
            time.sleep(0.1)

        if callback.error_msg:
            log(f"  ✗ Error generating {para_id}: {callback.error_msg}", json_output)
            return False

        size_kb = output_path.stat().st_size / 1024 if output_path.exists() else 0
        log(f"  ✓ Saved: {output_path.name} ({size_kb:.1f} KB)", json_output)
        return True

    except Exception as e:
        log(f"  ✗ Error generating {para_id}: {e}", json_output)
        return False


def process_segment(segment: dict, json_output=False) -> int:
    seg_id = segment["id"]
    paragraphs = segment["paragraphs"]
    audio_dir = PUBLIC_AUDIO_DIR / seg_id
    audio_dir.mkdir(parents=True, exist_ok=True)

    total = len(paragraphs) + 1  # +1 for intro
    done = 0

    if json_output:
        print(json.dumps({"type": "start", "segId": seg_id, "total": total}), flush=True)

    # Intro — prefer bookTitle passed from server, fall back to hardcoded constant
    book_title = segment.get("bookTitle") or BOOK_TITLE_TTS
    tts_title = clean_title_for_tts(segment['title'])
    intro_text = f"{book_title}。{tts_title}。"
    intro_path = audio_dir / f"{seg_id}-intro.mp3"
    
    # 删除之前的文件保证每次都会生成并更新json
    if intro_path.exists():
        intro_path.unlink()
    json_intro_path = intro_path.with_suffix('.json')
    if json_intro_path.exists():
        json_intro_path.unlink()

    ok = generate_audio_for_paragraph(f"{seg_id}-intro", intro_text, intro_path, json_output)
    done += 1
    if json_output:
        size_kb = intro_path.stat().st_size / 1024 if intro_path.exists() else 0
        print(json.dumps({"type": "progress", "done": done, "total": total,
                          "paraId": f"{seg_id}-intro", "status": "ok" if ok else "error",
                          "sizeKb": round(size_kb, 1)}), flush=True)
    time.sleep(0.4)

    success_count = 0
    for para in paragraphs:
        output_path = audio_dir / f"{para['id']}.mp3"
        json_path = output_path.with_suffix('.json')
        if output_path.exists():
            output_path.unlink()
        if json_path.exists():
            json_path.unlink()
            
        ok = generate_audio_for_paragraph(para["id"], para["text"], output_path, json_output)
        if ok:
            success_count += 1
        done += 1
        if json_output:
            size_kb = output_path.stat().st_size / 1024 if output_path.exists() else 0
            print(json.dumps({"type": "progress", "done": done, "total": total,
                              "paraId": para["id"], "status": "ok" if ok else "error",
                              "sizeKb": round(size_kb, 1)}), flush=True)
        time.sleep(0.4)

    if json_output:
        print(json.dumps({"type": "segment_done", "segId": seg_id,
                          "success": success_count, "total": len(paragraphs)}), flush=True)
    else:
        print(f"\nDone: {success_count}/{len(paragraphs)} paragraphs generated")
        print(f"Audio saved to: {audio_dir}")

    return success_count


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("seg_ids", nargs="*", help="Segment IDs to generate (original CLI mode)")
    parser.add_argument("--data-file", help="JSON file with segment data {id, title, paragraphs}")
    parser.add_argument("--json-output", action="store_true", help="Emit JSON progress lines to stdout")
    args = parser.parse_args()

    if args.data_file:
        # Dynamic mode: read segment from file
        with open(args.data_file, "r", encoding="utf-8") as f:
            segment = json.load(f)
        success_count = process_segment(segment, json_output=args.json_output)
        expected = len(segment.get("paragraphs", []))
        if success_count < expected:
            sys.exit(1)
    else:
        # Original CLI mode: use hardcoded SEGMENTS
        seg_ids = args.seg_ids or ["seg-01"]
        if not args.json_output:
            print(f"DashScope TTS Generator — Model: {MODEL}, Voice: {VOICE}")
            print(f"Segments: {seg_ids}\n")

        any_failed = False
        for segment in SEGMENTS:
            if segment["id"] not in seg_ids:
                continue
            success_count = process_segment(segment, json_output=args.json_output)
            if success_count < len(segment.get("paragraphs", [])):
                any_failed = True
        if any_failed:
            sys.exit(1)


if __name__ == "__main__":
    main()
