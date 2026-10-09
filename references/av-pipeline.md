# Audio / Video RAG pipeline

Use this route when any source is audio (calls, consultations, podcasts,
voice notes) or video (lessons, webinars, recorded sessions).

Tell the user: "This needs the audio/video pipeline — switching to the A/V
guideline." This file replaces Phases 1–4 of the standard flow (run A1–A3 on a pilot
set of recordings first, then transcribe and ingest the rest). Phases 5–8
continue as normal, with timestamp citations.

## A/V intake add-ons (ask after the main intake)

1. Is the answer in **what is said**, **what is shown** (slides, whiteboard,
   screen, demos), or both?
2. Languages and code-switching (two languages mixed in one sentence)?
3. Does it matter **who** said it (speaker attribution)?
4. Must answers link to the exact moment (deep-link timestamps)?
5. Hours of media now, and hours added per week?
6. Audio quality: studio, Zoom, phone, noisy room?

If only speech matters → audio track only (cheaper). If visuals matter → full video path.

## Phase A1 — Transcription quality (new gate, before the golden set)

1. Pick 3–5 representative clips (≈10 min each, include the worst audio).
2. Get human reference transcripts for them.
3. Compare 2–3 ASR options with word-level timestamps and diarization
   (e.g. AssemblyAI, Deepgram, OpenAI transcription models, ElevenLabs Scribe).
   Test code-switching explicitly if the audio mixes languages.
4. Measure WER (and speaker attribution accuracy if Q3 = yes).
5. Add a custom vocabulary / keyterm list: program names, brand names,
   people, jargon (product names, acronyms, domain terms).

Gate: WER ≤ 15% English, ≤ 20% mixed-language (or agreed target); domain
terms spelled correctly in ≥ 90% of occurrences.

## Video extras (only if visuals matter)

1. Extract audio track: `ffmpeg -i in.mp4 -vn -ac 1 -ar 16000 audio.wav`
2. Scene / slide-change detection: `ffmpeg -i in.mp4 -vf "select='gt(scene,0.3)',showinfo" -vsync vfr frames/%05d.jpg`
3. For each keyframe: OCR on-screen text + short caption with a vision model
   (Claude). Keep the frame timestamp.
4. Merge into the transcript timeline as `[VISUAL @ 00:12:31] Slide: "3 pillars…"`.

## Segmentation and chunk schema

Do not chunk transcripts by character count. Chunk by meaning and time:
- Merge utterances into segments of ~45–120s, splitting at topic shifts,
  long pauses, or speaker changes.
- Add 10–15s overlap between segments.
- Prepend context: media title + chapter/topic + speaker.

```json
{
  "content": "[Course Session 4 > Budgeting] Speaker A: The first thing we cover is…",
  "metadata": {
    "media_id": "course-s04",
    "media_type": "video",
    "start": 742.3,
    "end": 829.9,
    "speakers": ["Speaker A"],
    "has_visual": true,
    "lang": "mixed",
    "url": "https://…/course-s04.mp4",
    "tenant_id": "tenant-a"
  }
}
```

Store media in Supabase Storage (or existing host). Store transcripts as raw
JSON too, so you can re-segment without re-transcribing.

## Phase A2 — Golden set for A/V

Same rules as `golden-set.md`, but sources are time ranges:

```json
"sources": [{ "media_id": "course-s04", "start": 740, "end": 830 }]
```

Add A/V-specific question types:
- "When / in which session did … talk about X?"
- "What did <speaker> say about X?" (if attribution matters)
- "What was on the slide when …?" (if visuals matter)

## Phase A3 — Retrieval evals and tuning

Hit rule: temporal IoU ≥ 0.5 with an expected segment, same `media_id`.

```ts
const iou = (a: {start:number;end:number}, b: {start:number;end:number}) => {
  const inter = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  const union = Math.max(a.end, b.end) - Math.min(a.start, b.start);
  return union > 0 ? inter / union : 0;
};
```

Report Recall@k, MRR (with the IoU hit rule), plus a "within 30s" Hit@k
(retrieved start within 30s of expected start) — often what users care about.

Tuning levers (one at a time): segment length · overlap · speaker/topic
boundaries · context prefix · hybrid search (strong for names/terms that
ASR gets right) · reranker · including visual text in chunks.

Gate: same retrieval targets as the standard flow.

## Phase 5+ differences

- Answer prompt must cite as `[course-s04 12:22–13:49]` and return deep links
  (`url#t=742`).
- Faithfulness judge receives the transcript segments as context.
- Monitor ASR quality over time: sample new media monthly for WER.
- Cost: transcription is usually the dominant ingest cost; log cost per hour
  of media in RAG_STATUS.md.
