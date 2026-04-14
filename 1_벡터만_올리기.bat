@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 전시챗봇 - 벡터만 올리기
echo.
echo [0/3] PDF/이미지 → 텍스트 (없으면 바로 끝남) …
call npm run extract:media
if errorlevel 1 goto err
echo.
echo [1/3] 원문 폴더 wiki\sources 를 Supabase raw_chunks 에 올립니다...
call npm run ingest:raw
if errorlevel 1 goto err
echo.
echo [2/3] 정리 위키 wiki\canonical 을 Supabase wiki_chunks 에 올립니다...
call npm run ingest:wiki
if errorlevel 1 goto err
echo.
echo ===== 완료 =====
echo 챗봇이 최신 원문/위키를 검색할 수 있습니다.
goto end
:err
echo.
echo ===== 실패 =====
echo Node.js 설치 여부, 이 폴더에서 npm install 했는지, .env.local 키를 확인하세요.
:end
echo.
pause
