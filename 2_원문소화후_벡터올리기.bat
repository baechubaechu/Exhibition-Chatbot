@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 전시챗봇 - 원문 소화(전체) + 벡터 올리기
echo.
echo [주의] OpenAI API 를 많이 호출합니다. 시간이 오래 걸리고 비용이 나갈 수 있습니다.
echo wiki\sources 에 넣은 원문을 알고리즘대로 각 canonical 문서에 초안으로 붙인 뒤,
echo Supabase 에 벡터를 다시 올립니다.
echo.
pause
echo.
echo [1/2] 전체 canonical 소화 중...
call npm run digest:all-canonical
if errorlevel 1 goto err
echo.
echo [2/2] 벡터 올리기...
call npm run sync:knowledge
if errorlevel 1 goto err
echo.
echo ===== 완료 =====
echo wiki\canonical\*.md 맨 아래 "자동 소화 초안" 을 꼭 읽고 고친 뒤, 다시 이 배치를 돌리면 반영됩니다.
goto end
:err
echo.
echo ===== 실패 =====
echo .env.local 의 OPENAI_API_KEY, Supabase 키를 확인하세요.
:end
echo.
pause
