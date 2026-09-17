from abc import ABC, abstractmethod
from typing import Any


class DataSource(ABC):
    @abstractmethod
    def get_resources(self) -> list[dict]: ...

    @abstractmethod
    def get_xray_service_graph(self) -> dict: ...

    @abstractmethod
    def get_cloudtrail_events(self) -> list[dict]: ...

    @abstractmethod
    def get_tags(self) -> list[dict]: ...

    @abstractmethod
    def get_appregistry(self) -> list[dict]: ...

    @abstractmethod
    def get_alarms(self) -> list[dict]: ...

    @abstractmethod
    def get_incidents(self) -> list[dict]: ...


class MockDataSource(DataSource):
    def __init__(self, fixtures_path: str):
        import json
        import os

        def load(name: str) -> Any:
            with open(os.path.join(fixtures_path, name)) as f:
                return json.load(f)

        self._resources = load("config_resources.json")["resources"]
        self._xray = load("xray_service_graph.json")
        self._cloudtrail = load("cloudtrail_events.json")["events"]
        self._tags = load("tags.json")["resourceTagMappingList"]
        self._appregistry = load("appregistry.json")["applications"]
        self._alarms = load("alarms.json")["metricAlarms"]
        self._incidents = load("incidents.json")["incidents"]

    def get_resources(self) -> list[dict]:
        return self._resources

    def get_xray_service_graph(self) -> dict:
        return self._xray

    def get_cloudtrail_events(self) -> list[dict]:
        return self._cloudtrail

    def get_tags(self) -> list[dict]:
        return self._tags

    def get_appregistry(self) -> list[dict]:
        return self._appregistry

    def get_alarms(self) -> list[dict]:
        return self._alarms

    def get_incidents(self) -> list[dict]:
        return self._incidents
