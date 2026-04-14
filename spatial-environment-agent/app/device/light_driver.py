from typing import Literal

Zone = Literal["zoneA", "zoneB", "all"]


class LightDriver:
    def __init__(self) -> None:
        self.last_command: dict | None = None

    async def apply_scene(self, *, zone: Zone, brightness: int, color_temp: int, transition_ms: int) -> None:
        # TODO: Tapo/Hue real SDK calls
        self.last_command = {
            "zone": zone,
            "brightness": brightness,
            "color_temp": color_temp,
            "transition_ms": transition_ms,
        }
