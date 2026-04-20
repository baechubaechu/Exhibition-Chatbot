# 이벤트 버스 계약 (MVP)

본 문서는 전시 인터랙티브 플랫폼에서 `Exhibition-Chatbot`과 `Environment Service`가 공유하는 이벤트 스키마를 정의합니다.

## 토픽

- `sensor.state`
- `scenario.override`
- `chat.scene_hint`
- `scene.execute`
- `ops.heartbeat`

## 공통 envelope

```json
{
  "eventId": "1713070000000-ab12cd34",
  "sessionId": "optional-chat-session",
  "source": "chat-api | control-ui | env-service",
  "timestamp": "2026-04-14T08:30:00.000Z",
  "ttlMs": 60000
}
```

## payload 스키마

### `sensor.state`

```json
{
  "peopleCount": 7,
  "decibel": 58.4,
  "emotionState": "neutral",
  "occupancyZone": "zoneA"
}
```

### `scenario.override`

```json
{
  "peopleCount": 15,
  "decibel": 72,
  "emotionState": "active",
  "durationSec": 120,
  "profileName": "crowded-demo",
  "targetZone": "all"
}
```

### `chat.scene_hint`

```json
{
  "intentTag": "section_focus",
  "confidence": 0.78,
  "locale": "ko",
  "messageSummary": "단면모형 A에서 동선이 어떻게 연결돼?",
  "targetZone": "zoneA"
}
```

### `scene.execute`

```json
{
  "sceneId": "dense_flux",
  "reason": "override:crowded-demo",
  "holdSec": 90,
  "targetZone": "all"
}
```

### `ops.heartbeat`

```json
{
  "service": "env-service",
  "status": "ok",
  "detail": "camera/mic online"
}
```

## API 엔드포인트

- `POST /api/events/publish`
- `GET /api/events/pull?after=0&topics=sensor.state,chat.scene_hint`
- `GET /api/events/state`
- `POST /api/events/heartbeat`
- `POST /api/events/recover`

## 운영 기본값

- 기본 TTL: 60초
- Heartbeat stale 판단: 20초
- Event queue 최대 보관: 최근 500개
