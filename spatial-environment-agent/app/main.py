import asyncio
import os
from datetime import datetime, timezone
from typing import Any, Literal, Optional

import httpx
from fastapi import FastAPI, WebSocket
from pydantic import BaseModel, Field

from app.device.light_driver import LightDriver
from app.device.speaker_driver import SpeakerDriver
from app.scene_engine import ChatHint, OverrideInput, SceneDecision, SensorState, load_default_scene_engine

Zone = Literal["zoneA", "zoneB", "all"]


class RuntimeState(BaseModel):
    last_sensor: Optional[SensorState] = None
    last_hint: Optional[ChatHint] = None
    last_override: Optional[OverrideInput] = None
    last_decision: Optional[SceneDecision] = None
    last_updated: Optional[str] = None


class EventConsumer:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.after = 0
        self.client = httpx.AsyncClient(timeout=5)

    async def pull(self) -> list[dict[str, Any]]:
        params = {
            "after": self.after,
            "limit": 100,
            "topics": "sensor.state,scenario.override,chat.scene_hint,scene.execute",
        }
        r = await self.client.get(f"{self.base_url}/api/events/pull", params=params)
        r.raise_for_status()
        data = r.json()
        items = data.get("items", [])
        self.after = int(data.get("nextAfter", self.after))
        return items

    async def heartbeat(self, detail: str = "running") -> None:
        await self.client.post(
            f"{self.base_url}/api/events/heartbeat",
            json={"service": "env-service", "status": "ok", "detail": detail},
        )


class SceneExecutor:
    def __init__(self, light: LightDriver, speaker: SpeakerDriver, scene_engine=load_default_scene_engine()):
        self.light = light
        self.speaker = speaker
        self.scene_engine = scene_engine

    async def apply(self, decision: SceneDecision) -> None:
        scene = self.scene_engine.scene_map.get(decision.scene_id)
        if scene is None:
            scene = self.scene_engine.scene_map[self.scene_engine.catalog.safe_scene]
        await self.light.apply_scene(
            zone=decision.target_zone,
            brightness=scene.light.brightness,
            color_temp=scene.light.color_temp,
            transition_ms=scene.light.transition_ms,
        )
        await self.speaker.apply_scene(
            zone=decision.target_zone,
            track=scene.sound.track,
            volume=scene.sound.volume,
            fade_ms=scene.sound.fade_ms,
        )


app = FastAPI(title="Spatial Environment Agent")
state = RuntimeState()
engine = load_default_scene_engine()
executor = SceneExecutor(LightDriver(), SpeakerDriver(), engine)
bus = EventConsumer(os.getenv("EVENT_BRIDGE_BASE_URL", "http://127.0.0.1:3000"))
ws_clients: set[WebSocket] = set()
lock = asyncio.Lock()


async def broadcast() -> None:
    payload = state.model_dump()
    dead: list[WebSocket] = []
    for ws in ws_clients:
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        ws_clients.discard(ws)


async def decide_and_apply(reason: str) -> None:
    decision = engine.choose_scene(state.last_sensor, state.last_hint, state.last_override)
    if reason:
        decision.reason = reason
    await executor.apply(decision)
    state.last_decision = decision
    state.last_updated = datetime.now(timezone.utc).isoformat()
    await broadcast()


def parse_event(event: dict[str, Any]) -> tuple[str, Any]:
    topic = event.get("topic", "")
    payload = event.get("payload", {})
    return topic, payload


async def consume_loop() -> None:
    while True:
        try:
            events = await bus.pull()
            for e in events:
                topic, payload = parse_event(e)
                if topic == "sensor.state":
                    state.last_sensor = SensorState(
                        people_count=payload.get("peopleCount", 0),
                        decibel=payload.get("decibel", 0),
                        emotion_state=payload.get("emotionState", "neutral"),
                        occupancy_zone=payload.get("occupancyZone", "all"),
                    )
                    state.last_override = None
                    await decide_and_apply("sensor update")
                elif topic == "scenario.override":
                    state.last_override = OverrideInput(
                        people_count=payload.get("peopleCount"),
                        decibel=payload.get("decibel"),
                        emotion_state=payload.get("emotionState"),
                        duration_sec=payload.get("durationSec"),
                        profile_name=payload.get("profileName"),
                        target_zone=payload.get("targetZone", "all"),
                    )
                    await decide_and_apply("manual override")
                elif topic == "chat.scene_hint":
                    state.last_hint = ChatHint(
                        intent_tag=payload.get("intentTag", "general_exhibit"),
                        confidence=float(payload.get("confidence", 0.5)),
                        target_zone=payload.get("targetZone", "all"),
                    )
                    await decide_and_apply("chat hint")
                elif topic == "scene.execute":
                    decision = SceneDecision(
                        scene_id=payload.get("sceneId", "safe_neutral"),
                        hold_sec=int(payload.get("holdSec", 60)),
                        target_zone=payload.get("targetZone", "all"),
                        reason=payload.get("reason", "external execute"),
                    )
                    await executor.apply(decision)
                    state.last_decision = decision
                    state.last_updated = datetime.now(timezone.utc).isoformat()
                    await broadcast()

            await bus.heartbeat(detail="events consumed")
        except Exception as err:
            await bus.heartbeat(detail=f"degraded: {type(err).__name__}")
        await asyncio.sleep(2)


@app.on_event("startup")
async def on_startup() -> None:
    asyncio.create_task(consume_loop())


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/status")
async def status() -> dict[str, Any]:
    return state.model_dump()


@app.post("/override")
async def override(input_data: OverrideInput) -> dict[str, Any]:
    async with lock:
        state.last_override = input_data
        await decide_and_apply("manual override endpoint")
    return {"ok": True, "decision": state.last_decision.model_dump() if state.last_decision else None}


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    ws_clients.add(ws)
    try:
        await ws.send_json(state.model_dump())
        while True:
            await ws.receive_text()
    except Exception:
        ws_clients.discard(ws)
