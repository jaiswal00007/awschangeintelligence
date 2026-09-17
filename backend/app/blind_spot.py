import networkx as nx

from .graph_engine import EdgeProvenance


def detect_all_blind_spots(G: nx.DiGraph) -> None:
    """Mark all blind-spot edges on the graph (called once at startup)."""
    declared = {EdgeProvenance.config, EdgeProvenance.appregistry}
    observed = {EdgeProvenance.xray, EdgeProvenance.cloudtrail}
    for u, v, data in G.edges(data=True):
        provs = set(data.get("provenances", []))
        if (provs & observed) and not (provs & declared):
            data["is_blind_spot"] = True
        else:
            data.setdefault("is_blind_spot", False)


def detect_blind_spots_for_target(G: nx.DiGraph, target_id: str,
                                   affected_ids: set[str]) -> list[dict]:
    """
    Return blind-spot edges directly relevant to a change on target_id.
    Relevant means the hidden edge either:
      1. Points TO the target resource directly (hidden caller of target), OR
      2. Points TO a direct neighbor of target (hop-1) from a source that is
         completely outside the blast radius — i.e. a hidden inbound dep one
         step away from the changed resource.
    This keeps noise out: a blind spot between two resources deep in the blast
    zone is owned by *those* resources, not by the current change target.
    """
    declared = {EdgeProvenance.config, EdgeProvenance.appregistry}
    observed = {EdgeProvenance.xray, EdgeProvenance.cloudtrail}

    # Direct neighbors of the target (1 hop in either direction)
    direct_neighbors: set[str] = set(G.predecessors(target_id)) | set(G.successors(target_id))

    blind_spots = []

    for u, v, data in G.edges(data=True):
        provs = set(data.get("provenances", []))
        has_observed = bool(provs & observed)
        has_declared = bool(provs & declared)
        if not (has_observed and not has_declared):
            continue

        touches_target = (v == target_id)
        # Crossing edge: source is outside blast, dest is a direct neighbor of target
        src_type = G.nodes[u].get("node_type", "resource")
        trivial = src_type in ("team", "alarm", "customer")
        crosses_into_blast = (
            not trivial
            and u not in affected_ids
            and v in direct_neighbors
            and v != target_id
        )

        if not (touches_target or crosses_into_blast):
            continue

        src_data = G.nodes[u]
        dst_data = G.nodes[v]
        primary_prov = (
            EdgeProvenance.xray if EdgeProvenance.xray in provs
            else EdgeProvenance.cloudtrail
        )
        blind_spots.append({
            "source_id": u,
            "source_name": src_data.get("name", u),
            "target_id": v,
            "target_name": dst_data.get("name", v),
            "observed_via": primary_prov,
            "observed_count": data.get("observed_count", 0),
            "confidence": data.get("confidence", 0.0),
            "why_hidden": (
                f"Edge exists in {primary_prov.value} "
                f"({data.get('observed_count', 0):,} calls) "
                f"but is absent from AppRegistry and AWS Config relationships."
            ),
        })

    return blind_spots
