# Spatial Environment Agent (FastAPI)

로컬 전시장 노트북에서 실행하는 환경 제어 서비스입니다.

## 실행

```powershell
cd spatial-environment-agent
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:EVENT_BRIDGE_BASE_URL="http://127.0.0.1:3000"
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## 제공 API

- `GET /health`
- `GET /status`
- `POST /override`
- `WS /ws`

## 동작 요약

- Next.js 이벤트 버스(`/api/events/pull`)를 polling
- `sensor.state`, `scenario.override`, `chat.scene_hint`, `scene.execute` 처리
- 씬 엔진이 선택한 프리셋을 조명/스피커 드라이버에 전달
- `/api/events/heartbeat`로 주기적 상태 보고

실장치 연동 시 `app/device/*.py`의 TODO 구간을 SDK 호출로 교체하세요.
