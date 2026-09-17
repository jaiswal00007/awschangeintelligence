def match(
    incidents: list[dict],
    resource_type: str,
    change_type: str,
    affected_apps: list[str],
) -> list[dict]:
    """
    Fuzzy match current change against incident history.
    Similarity = type match (0.5) + change_type match (0.3) + app overlap (0.2).
    """
    results = []
    for inc in incidents:
        sim = 0.0

        if inc.get("resourceType") == resource_type:
            sim += 0.6

        # change_type already gated above — add bonus for exact resource name match
        if inc.get("resourceName") and inc.get("resourceName") in resource_type:
            sim += 0.2

        inc_apps = set(inc.get("affectedApps", []))
        cur_apps = set(affected_apps)
        if inc_apps and cur_apps:
            overlap = len(inc_apps & cur_apps) / max(len(inc_apps), len(cur_apps))
            sim += 0.2 * overlap

        # Require both resource type AND change type to match for a result
        if inc.get("changeType") != change_type:
            continue

        if sim >= 0.5:
            results.append({
                "incident_id": inc["id"],
                "similarity": round(sim, 2),
                "outage_minutes": inc.get("outageMinutes", 0),
                "date": inc.get("date", ""),
                "root_cause": inc.get("rootCause", ""),
                "affected_apps": inc.get("affectedApps", []),
                "severity": inc.get("severity", ""),
            })

    return sorted(results, key=lambda x: x["similarity"], reverse=True)
