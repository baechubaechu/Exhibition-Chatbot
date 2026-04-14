import os
from typing import Dict, List, Literal, Optional

import yaml
from pydantic import BaseModel, Field

Zone = Literal["zoneA", "zoneB", "all"]


class LightPreset(BaseModel):
    brightness: int = Field(ge=0, le=100)
    color_temp: int = Field(ge=1500, le=9000)
    transition_ms: int = Field(ge=0, le=15000)


class SoundPreset(BaseModel):
    track: str
    volume: int = Field(ge=0, le=100)
    fade_ms: int = Field(ge=0, le=15000)


class Scene(BaseModel):
    id: str
    hold_sec: int = Field(ge=5, le=3600)
    target_zone: Zone = "all"
    light: LightPreset
    sound: SoundPreset


class SceneCatalog(BaseModel):
    safe_scene: str
    scenes: List[Scene]


class SensorState(BaseModel):
    people_count: int = Field(ge=0, le=300)
    decibel: float = Field(ge=0, le=160)
    emotion_state: Literal["calm", "neutral", "active", "stressed"]
    occupancy_zone: Zone = "all"


class ChatHint(BaseModel):
    intent_tag: str
    confidence: float = Field(ge=0, le=1)
    target_zone: Zone = "all"


class OverrideInput(BaseModel):
    people_count: Optional[int] = Field(default=None, ge=0, le=300)
    decibel: Optional[float] = Field(default=None, ge=0, le=160)
    emotion_state: Optional[Literal["calm", "neutral", "active", "stressed"]] = None
    duration_sec: Optional[int] = Field(default=None, ge=5, le=3600)
    profile_name: Optional[str] = None
    target_zone: Zone = "all"


class SceneDecision(BaseModel):
    scene_id: str
    hold_sec: int
    target_zone: Zone
    reason: str


class SceneEngine:
    def __init__(self, catalog: SceneCatalog):
        self.catalog = catalog
        self.scene_map: Dict[str, Scene] = {scene.id: scene for scene in catalog.scenes}

    @classmethod
    def from_yaml(cls, path: str) -> "SceneEngine":
        with open(path, "r", encoding="utf-8") as f:
            parsed = yaml.safe_load(f)
        catalog = SceneCatalog.model_validate(parsed)
        return cls(catalog)

    def safe_scene(self, target_zone: Zone = "all") -> SceneDecision:
        scene = self.scene_map.get(self.catalog.safe_scene)
        if scene is None:
            raise ValueError("safe scene is missing in catalog")
        return SceneDecision(
            scene_id=scene.id,
            hold_sec=scene.hold_sec,
            target_zone=target_zone,
            reason="safe_fallback",
        )

    def choose_scene(
        self,
        sensor: Optional[SensorState],
        chat_hint: Optional[ChatHint],
        override: Optional[OverrideInput],
    ) -> SceneDecision:
        if override is not None:
            return self._from_override(override)

        if sensor is not None:
            if sensor.decibel >= 72 or sensor.people_count >= 20:
                return self._pick("dense_flux", "sensor:crowded", sensor.occupancy_zone)
            if sensor.emotion_state == "stressed":
                return self._pick("night_reflect", "sensor:stressed", sensor.occupancy_zone)
            if sensor.emotion_state == "active":
                return self._pick("critical_focus", "sensor:active", sensor.occupancy_zone)

        if chat_hint is not None and chat_hint.confidence >= 0.62:
            if "layer" in chat_hint.intent_tag or "section" in chat_hint.intent_tag:
                return self._pick("critical_focus", f"chat:{chat_hint.intent_tag}", chat_hint.target_zone)
            if "sound" in chat_hint.intent_tag:
                return self._pick("dense_flux", f"chat:{chat_hint.intent_tag}", chat_hint.target_zone)

        return self._pick("calm_gallery", "default", "all")

    def _from_override(self, override: OverrideInput) -> SceneDecision:
        if (override.decibel or 0) >= 72 or (override.people_count or 0) >= 20:
            return self._pick("dense_flux", "override:crowded", override.target_zone)
        if override.emotion_state == "stressed":
            return self._pick("night_reflect", "override:stressed", override.target_zone)
        if override.emotion_state == "active":
            return self._pick("critical_focus", "override:active", override.target_zone)
        return self._pick("calm_gallery", "override:default", override.target_zone)

    def _pick(self, scene_id: str, reason: str, zone: Zone) -> SceneDecision:
        scene = self.scene_map.get(scene_id)
        if scene is None:
            return self.safe_scene(zone)
        return SceneDecision(
            scene_id=scene.id,
            hold_sec=scene.hold_sec,
            target_zone=zone,
            reason=reason,
        )


def load_default_scene_engine() -> SceneEngine:
    base = os.path.dirname(os.path.dirname(__file__))
    path = os.path.join(base, "config", "scenes.yaml")
    return SceneEngine.from_yaml(path)
