# 🥇 RxMate — Idea Plan #1

> *"Three doctors couldn't catch this. One agent did."*

**Weighted score:** 8.85 (→ ~9.4 with execution-hardening)
**Track:** Ship It (deploy live on AWS + public URL)
**Sector:** Healthcare

---

## The problem (Idea & Impact)

An adult child manages an aging parent's medicines from another city. The parent sees
three different doctors who never talk to each other. There are 9 bottles in the drawer.
Nobody knows if any of them dangerously interact — until someone gets hurt.

**The person on the other side:** that adult child, and the parent whose life is at risk.
Every judge pictures their own parent's medicine drawer. Impact lands in one sentence.

## What it does (the ONE feature that must run)

1. Snap a photo of each medicine bottle.
2. A Bedrock vision agent extracts the drug names (user taps to confirm — the safety seam).
3. The agent checks every pair against a real drug-interaction dataset.
4. It renders a plain-language sheet: *"Ask your doctor about Warfarin + Ibuprofen — bleeding risk."*

**Framing rule (non-negotiable):** it surfaces *a possible interaction — ask your doctor.*
Never "stop taking X." This is both the ethical stance and what makes it safe to demo & ship.

## Why it wins the rubric

| Criterion | How RxMate scores |
|-----------|-------------------|
| **Idea & Impact** | Universal, instantly legible, real health stakes. 10/10. |
| **Built on AWS** | Bedrock Claude **vision** + agent tool-use = AWS's exact 2026 flagship pattern. |
| **Learning** | Textbook "first agent, first deploy" story. |
| **Execution** | Interaction check is a **deterministic lookup** on a real dataset — the agent narrates, never invents. |
| **Demo Video** | 3-second gut-punch: two bottles → red interaction card. |

## Architecture

```
React (S3 + CloudFront)
   │  upload bottle photos → confirm names → view sheet
   ▼
API Gateway → Lambda
   │
   ▼
Strands Agent (Bedrock Claude)
   ├─ tool: extract_meds(image)      → Claude vision OCR of the label
   ├─ tool: check_interactions(drugs)→ deterministic lookup vs bundled dataset
   └─ tool: write_summary(findings)  → plain-language "ask your doctor" sheet
   │
   ▼
S3 (images) · DynamoDB (household med list)
```

**The safety seam:** vision *extracts* → human *confirms* → dataset *decides* → LLM *explains*.
The LLM is never the source of a medical fact.

## AWS services

Bedrock (Claude, vision) · Lambda · API Gateway · S3 · DynamoDB · CloudFront · (Cognito optional for households)

## 4-day build plan

- **Day 1:** Bundle a drug-interaction dataset; stand up `check_interactions` (deterministic) + Lambda + Bedrock access. Deploy a hello-world public URL early (Ship-It insurance).
- **Day 2:** `extract_meds` via Claude vision; tap-to-confirm UX. Wire the agent loop end to end on the backend.
- **Day 3:** React UI — snap → confirm → sheet. The red interaction card. Deploy frontend to S3/CloudFront.
- **Day 4:** Harden the hero demo (2–3 known-good bottles), record the 3-min video, write the blog post.

## Execution-hardening (8 → ~9.5)

- **Confirm step** turns a vision misread into a 1-second tap-correction, not a broken demo.
- **Rig the hero demo** with bottles you've verified read cleanly; "any bottle" is a stretch goal, not a dependency.
- **Deterministic interaction check** means the medical fact is correct by construction.

## 3-minute demo script

1. (0:00) "My dad sees three doctors. None of them talk." — open drawer, 4 bottles.
2. (0:30) Snap them. Names appear; tap to confirm.
3. (1:00) Red card: **Warfarin + Ibuprofen → bleeding risk.** Missed by every prescriber.
4. (1:45) Plain-language sheet renders.
5. (2:30) Architecture diagram — all serverless, Bedrock agent at center. "First agent, live on AWS."
6. (2:50) *"Three doctors couldn't catch this. One agent did."*

## Biggest risk & mitigation

**Risk:** Claude vision misreads a curved/glossy label on camera.
**Mitigation:** the tap-to-confirm seam + a rigged hero set of clean bottles. The value
(interaction detection) never depends on perfect OCR.
