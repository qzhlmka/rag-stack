# Phase 0 — Intake

Purpose: agree on what is being built before anything is built. Ask in rounds
of max 3 questions. Skip questions already answered in the conversation.
Offer sensible defaults so the user can answer fast.

## Round 1 — Goal

1. **End goal.** What should a user be able to do or decide after using this?
   (e.g. "a customer gets a correct, cited answer about the product without contacting support")
2. **Users and channel.** Who uses it, and where? (web app, Telegram, WhatsApp,
   internal dashboard, API for another system)
3. **Success metric.** One business metric that proves it works.
   (e.g. "consultants stop searching manuals", "70% of questions answered without escalation")

## Round 2 — How it works

4. **Interaction type.** Q&A chat · search with snippets · tutor/coach ·
   report/summary generation · agent that takes actions
5. **Conversation.** Single question, or multi-turn with memory of earlier turns?
6. **Answer rules.**
   - Citations required? (doc + page / section / timestamp)
   - Must refuse when the answer is not in the sources, or may it use general knowledge?
   - Output format (short answer, step-by-step, structured JSON)?

## Round 3 — Data

7. **Source types.** Tick all: PDF/DOCX · web pages · Markdown/Notion ·
   spreadsheets/tables · scanned docs or images · **audio** · **video** · database records
8. **Volume and freshness.** Roughly how many documents / hours of media?
   Updated one-off, weekly, or live?
9. **Languages.** Which languages? Mixed within one document/recording?
10. **Access control.** Does each user/tenant see only their own data?
11. **Constraints.** Latency target, cost per query, data privacy (applicable regulations), on-prem needs.

## Round 4 — Operations

12. **Reviewers.** Who will annotate chats each week (name/role), and how much time?
13. **Review cadence.** Default: AI judge daily, human queue weekly (~40 chats),
    golden set refresh monthly. Change?
14. **Traffic and growth.** Expected users, peak concurrent users, corpus growth
    over 12 months (feeds the vector-store decision in Phase 4).

## Routing

| Answer to Q7 | Route |
|---|---|
| Includes audio or video | A/V route → `av-pipeline.md` (tell the user you are switching) |
| Includes scanned docs / images | OCR route → `ocr-pipeline.md` for ingestion |
| Text only | Standard route |

## Defaults when the user has no preference

- Targets: Recall@5 ≥ 0.85, MRR ≥ 0.70, Faithfulness ≥ 0.90, Correctness ≥ 0.80, Correct refusal ≥ 0.90
- Latency: p95 ≤ 6s end-to-end for chat
- Answer rules: citations on, refuse when not in sources
- Review: AI judge daily, 40-chat human queue weekly, golden refresh monthly

## Intake Brief (write into RAG_STATUS.md, then ask for confirmation)

```markdown
## Intake Brief (confirmed: no)
- End goal:
- Users / channel:
- Success metric:
- Interaction type:
- Conversation: single-turn | multi-turn
- Answer rules: citations [y/n], refusal [y/n], format
- Sources / modalities:
- Route: standard | OCR | A/V | mixed (list)
- Volume / freshness:
- Languages:
- Access control:
- Constraints: latency, cost/query, privacy
- Reviewers / cadence:
- Traffic / growth:
- Targets: Recall@5 , MRR , Faithfulness , Correctness , Refusal
```

Set `confirmed: yes` only after the user explicitly agrees.
