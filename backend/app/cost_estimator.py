from __future__ import annotations


def estimate_cost_deltas(
    costs: list[dict],
    affected_nodes: list[dict],
    change_type: str,
    before: dict | None,
    after: dict | None,
) -> list[dict]:
    cost_map = {c["resourceArn"]: c for c in costs}
    result = []
    for node in affected_nodes:
        node = dict(node)
        profile = cost_map.get(node.get("node_id", ""))
        if profile:
            delta = _compute_delta(profile, change_type, before, after)
            if delta is not None:
                node["cost_delta"] = delta
        result.append(node)
    return result


def _compute_delta(
    profile: dict,
    change_type: str,
    before: dict | None,
    after: dict | None,
) -> dict | None:
    baseline = profile.get("monthlyBaseline", 0.0)
    dim = profile.get("scalingDimension", "none")

    if change_type == "delete":
        return {
            "monthly_delta_usd": round(-baseline, 2),
            "driver": "dependency_on_deleted_resource",
            "baseline_usd": round(baseline, 2),
            "confidence": 0.6,
        }

    if change_type in ("downsize", "scale", "config_change") and before and after:
        if dim == "memorySize":
            old_mem = before.get("memorySize") or before.get("memory")
            new_mem = after.get("memorySize") or after.get("memory")
            if old_mem and new_mem and old_mem != new_mem:
                ratio = int(new_mem) / int(old_mem)
                return {
                    "monthly_delta_usd": round(baseline * (ratio - 1), 2),
                    "driver": f"memory_{old_mem}MB_to_{new_mem}MB",
                    "baseline_usd": round(baseline, 2),
                    "confidence": 0.75,
                }

        elif dim == "dbInstanceClass":
            old_class = before.get("dbInstanceClass") or before.get("instanceClass")
            new_class = after.get("dbInstanceClass") or after.get("instanceClass")
            rates = profile.get("instanceTypeRates", {})
            if old_class and new_class and old_class in rates and new_class in rates:
                delta = round((rates[new_class] - rates[old_class]) * 730, 2)
                return {
                    "monthly_delta_usd": delta,
                    "driver": f"instance_{old_class}_to_{new_class}",
                    "baseline_usd": round(baseline, 2),
                    "confidence": 0.85,
                }

        elif dim == "billingMode":
            old_mode = before.get("billingMode")
            new_mode = after.get("billingMode")
            if old_mode and new_mode and old_mode != new_mode:
                if new_mode == "PAY_PER_REQUEST":
                    return {
                        "monthly_delta_usd": round(baseline * 0.8, 2),
                        "driver": "billing_provisioned_to_on_demand",
                        "baseline_usd": round(baseline, 2),
                        "confidence": 0.6,
                    }
                else:
                    return {
                        "monthly_delta_usd": round(-baseline * 0.4, 2),
                        "driver": "billing_on_demand_to_provisioned",
                        "baseline_usd": round(baseline, 2),
                        "confidence": 0.6,
                    }

    return None
