import networkx as nx

from .graph_engine import EdgeProvenance


def detect_blind_spots(G: nx.DiGraph) -> list[dict]:
    """
    Find edges that are observed (xray/cloudtrail) but NOT declared
    (config/appregistry). These are hidden dependencies.
    """
    blind_spots = []
    declared = {EdgeProvenance.config, EdgeProvenance.appregistry}
    observed = {EdgeProvenance.xray, EdgeProvenance.cloudtrail}

    for u, v, data in G.edges(data=True):
        provs = set(data.get("provenances", []))
        has_observed = bool(provs & observed)
        has_declared = bool(provs & declared)

        if has_observed and not has_declared:
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
            data["is_blind_spot"] = True

    return blind_spots
