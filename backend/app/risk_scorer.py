import math


def score(
    blast_radius: dict,
    change_type: str,
    blind_spots: list[dict],
    historical_matches: list[dict],
    affected_nodes: list[dict],
) -> dict:
    """
    Deterministic weighted risk score 0-100.
    LLM narrates; this score is authoritative.
    """
    signals: dict[str, float] = {}

    # Customer-facing surface reached (weight 30)
    if blast_radius.get("customer_facing"):
        signals["customer_facing"] = 30.0

    # Change type severity (weight 20)
    severity = {
        "delete": 1.0,
        "iam_change": 0.9,
        "downsize": 0.6,
        "scale": 0.4,
        "config_change": 0.3,
    }.get(change_type, 0.3)
    signals["change_type_severity"] = round(20.0 * severity, 1)

    # Blast radius size log-scaled (weight 15)
    total_nodes = (
        blast_radius.get("resources", 0)
        + blast_radius.get("applications", 0)
        + blast_radius.get("teams", 0)
        + blast_radius.get("alarms", 0)
    )
    if total_nodes > 0:
        log_factor = min(math.log(total_nodes + 1) / math.log(20), 1.0)
        signals["blast_radius_size"] = round(15.0 * log_factor, 1)

    # Blind spot present (weight 15)
    if blind_spots:
        signals["blind_spot_present"] = 15.0

    # Historical incident match (weight 12)
    if historical_matches:
        best = max(historical_matches, key=lambda m: m.get("similarity", 0))
        signals["historical_incident"] = round(12.0 * best.get("similarity", 0), 1)

    # Prod-critical node in blast radius (weight 8)
    critical_types = {"critical", "high"}
    for node in affected_nodes:
        if node.get("criticality", "").lower() in critical_types:
            signals["prod_critical_node"] = 8.0
            break

    total = sum(signals.values())
    score_val = min(round(total), 100)

    if score_val >= 75:
        level = "critical"
    elif score_val >= 50:
        level = "high"
    elif score_val >= 25:
        level = "medium"
    else:
        level = "low"

    return {
        "score": score_val,
        "level": level,
        "signals": signals,
    }
