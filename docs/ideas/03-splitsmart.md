# 🥉 SplitSmart — Idea Plan #3

> *"12 IOUs became 3 transfers. Nobody had to be the awkward one."*

**Weighted score:** 7.35
**Track:** Ship It (deploy live on AWS + public URL)
**Sector:** Finance

**Role in the top 3:** the *safest-to-ship hedge.* Different sector from #1 and #2, near-zero
hallucination risk (the math is deterministic), and universally relatable to broke students —
Kunal's exact audience. Lower emotional ceiling than RxMate/FirstPR, but the highest floor.

---

## The problem (Idea & Impact)

Someone always fronts the group dinner bill and is too embarrassed to chase four friends for
₹340 each over WhatsApp. The awkwardness means people just eat the loss.

**The person on the other side:** the broke student who's always out of pocket and hates asking.

## What it does (the ONE feature that must run)

1. Drop a photo of a group receipt into a shared link.
2. A Bedrock vision agent itemizes it; each person taps what they had.
3. A deterministic debt-settlement algorithm minimizes the number of transfers.
4. Output: *"Ravi pays Ana ₹210. Done. 3 transfers instead of 12."*

## Why it's the reliable bronze

| Criterion | How SplitSmart scores |
|-----------|-----------------------|
| **Idea & Impact** | Relatable and finance-themed, but lower stakes than health/first-PR. |
| **Built on AWS** | Bedrock vision (itemize) + serverless. Solid, if less agent-heavy. |
| **Learning** | Good "first agent + first deploy" story. |
| **Execution** | **Highest of the three** — the settlement is pure deterministic math; vision only reads a flat receipt (easier than a curved bottle). |
| **Demo Video** | Clean before→after: crumpled receipt → one-line settlement. |

## Architecture

```
React (S3 + CloudFront)  — shareable group link
   │  upload receipt → each person picks items → see settlement
   ▼
API Gateway → Lambda
   │
   ▼
Bedrock Claude (vision)  → itemize receipt lines + prices
   │
   ▼
settlement algorithm (deterministic, in Lambda)  → minimal transfer set
   │
   ▼
S3 (receipt images) · DynamoDB (group + who-had-what)
```

## AWS services

Bedrock (Claude, vision) · Lambda · API Gateway · S3 · DynamoDB · CloudFront · Cognito (group identity)

## 4-day build plan

- **Day 1:** Deterministic settlement algorithm + Lambda + Bedrock. Deploy a public URL early.
- **Day 2:** Vision itemization of a flat receipt; item-assignment data model in DynamoDB.
- **Day 3:** React UI — upload, per-person item picker, settlement view, shareable link.
- **Day 4:** Polish (Best UI prize is in play here), record 3-min video, blog post.

## Execution-hardening

- Flat receipts read far more reliably than curved bottles — vision risk is already low.
- Let users edit any misread line item before settling — same confirm-seam pattern as RxMate.
- The settlement math is deterministic, so the core value can never be wrong.

## 3-minute demo script

1. (0:00) "I always pay for the group dinner. I never get it back."
2. (0:30) Snap the receipt → items appear.
3. (1:00) Each friend taps what they had.
4. (1:45) Settlement: "3 transfers instead of 12," with exact amounts.
5. (2:30) Architecture — serverless, Bedrock vision. "First deploy on AWS."
6. (2:50) *"Nobody had to be the awkward one."*

## Biggest risk & mitigation

**Risk:** vision misreads a line item.
**Mitigation:** editable line items before settling; the deterministic math guarantees the
final answer is correct once items are confirmed. This is the lowest-risk idea of the three.
