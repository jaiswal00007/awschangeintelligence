import json
import os
import urllib.request
import urllib.error


def _fallback_verdict(risk_level: str, signals: dict, blind_spots: list,
                      historical_matches: list, change_type: str) -> dict:
    """Deterministic fallback — used when LLM proxy is unavailable or MOCK_BEDROCK=true."""
    if risk_level == "critical":
        verdict = "CRITICAL RISK — do not proceed without a change plan."
        rec = "Block this change. Create a change plan, validate all dependencies, notify affected teams, and schedule a maintenance window."
    elif risk_level == "high":
        verdict = "HIGH RISK — proceed only with explicit validation steps."
        rec = "Run a canary deployment. Validate all flagged dependencies before full rollout."
    elif risk_level == "medium":
        verdict = "MEDIUM RISK — proceed with caution and monitoring."
        rec = "Ensure rollback is ready. Notify owning teams and monitor alarms closely for 30 minutes post-change."
    else:
        verdict = "LOW RISK — change appears safe to proceed."
        rec = "Standard change process. Monitor for 15 minutes post-change."

    reasoning = []

    if signals.get("customer_facing", 0) > 0:
        reasoning.append("This change reaches a customer-facing surface — user-visible impact is possible.")

    if change_type == "delete":
        reasoning.append("Delete operations are irreversible. Recovery requires redeployment.")
    elif change_type == "downsize":
        reasoning.append("Downsizing compute resources risks OOM errors or latency spikes under load.")

    if blind_spots:
        bs = blind_spots[0]
        reasoning.append(
            f"Hidden dependency detected: {bs['source_name']} calls {bs['target_name']} "
            f"({bs['observed_count']:,} times observed in telemetry) but this relationship "
            f"is absent from AppRegistry and AWS Config — an undocumented blast radius."
        )

    if historical_matches:
        best = historical_matches[0]
        if best["outage_minutes"] > 0:
            reasoning.append(
                f"Historical precedent: {best['incident_id']} — a similar {change_type} on "
                f"the same resource type caused a {best['outage_minutes']}-minute outage. "
                f"Root cause: {best['root_cause']}"
            )
        else:
            reasoning.append(
                f"Historical precedent: {best['incident_id']} — a similar change caused an SLA breach. "
                f"Root cause: {best['root_cause']}"
            )

    if signals.get("blast_radius_size", 0) > 8:
        reasoning.append("Blast radius is broad — multiple resources, applications, and teams are in scope.")

    change_plan = _build_change_plan(risk_level, blind_spots, historical_matches, change_type)

    return {
        "verdict": verdict,
        "reasoning": reasoning or ["No elevated risk signals detected."],
        "recommendation": rec,
        "change_plan": change_plan,
    }


def _build_change_plan(risk_level: str, blind_spots: list,
                       historical_matches: list, change_type: str) -> list[str]:
    if risk_level not in ("high", "critical"):
        return []
    steps = []
    steps.append("Notify all owning teams listed in the blast radius before proceeding.")
    for bs in blind_spots:
        steps.append(
            f"Validate hidden dependency: {bs['source_name']} → {bs['target_name']} "
            f"({bs['observed_count']:,} calls/week observed in telemetry). "
            f"Confirm this service has a fallback or will not break."
        )
    if change_type == "delete":
        steps.append("Confirm no other services invoke the target resource (check X-Ray service map for the past 30 days).")
        steps.append("Prepare rollback: keep deployment artifact available for immediate redeployment.")
    elif change_type == "downsize":
        steps.append("Run a load test at peak traffic profile before applying to production.")
        steps.append("Deploy to a canary (10% traffic) and monitor error rates for 15 minutes before full rollout.")
    if historical_matches:
        best = historical_matches[0]
        steps.append(f"Review postmortem {best['incident_id']} to avoid repeating root cause: {best['root_cause'][:80]}...")
    steps.append("Set up enhanced CloudWatch monitoring for 1 hour post-change.")
    steps.append("Schedule rollback window: ensure on-call engineer is available for 30 minutes after change.")
    return steps


def get_verdict(
    change_request: dict,
    blast_radius: dict,
    affected_nodes: list,
    blind_spots: list,
    historical_matches: list,
    risk: dict,
) -> dict:
    mock_mode = os.getenv("MOCK_BEDROCK", "true").lower() == "true"

    fallback = _fallback_verdict(
        risk["level"], risk["signals"], blind_spots,
        historical_matches, change_request["change_type"]
    )

    if mock_mode:
        return fallback

    proxy_url = os.getenv("LLM_PROXY_URL", "http://localhost:6655")
    api_key = os.getenv("LLM_PROXY_API_KEY", "")
    model = os.getenv("LLM_PROXY_MODEL", "claude-sonnet-4-5")

    prompt_data = {
        "change": change_request,
        "blast_radius": blast_radius,
        "top_affected_nodes": affected_nodes[:8],
        "blind_spots": blind_spots,
        "historical_matches": historical_matches[:3],
        "risk": risk,
    }

    system_prompt = (
        "You are an AWS change-risk analyst. "
        "Reason ONLY over the provided graph data and signals. "
        "Do NOT invent dependencies or resources not listed. "
        "Be specific and actionable. "
        "Return valid JSON matching the output schema."
    )

    user_prompt = (
        "Analyze this AWS change and return a JSON object with keys: "
        "verdict (string, 1-2 sentences), reasoning (array of strings, 3-5 items), "
        "recommendation (string, specific action), change_plan (array of strings, ordered steps). "
        f"Data: {json.dumps(prompt_data)}"
    )

    path = os.getenv("LLM_PROXY_PATH", "/anthropic/v1/messages")

    payload = json.dumps({
        "model": model,
        "max_tokens": 1024,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}],
    }).encode()

    req = urllib.request.Request(
        f"{proxy_url}{path}",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read())
        text = body["content"][0]["text"]
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(text[start:end])
        return fallback
    except Exception as e:
        print("LLM PROXY ERROR:", e)
        return fallback
