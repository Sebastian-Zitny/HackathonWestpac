#!/usr/bin/env bash
# Start backend (port 8000) and frontend dev server (port 5173) together.
set -e
cd "$(dirname "$0")"
(cd backend && python -m uvicorn app.main:app --reload --port 8000) &
BACK=$!
trap "kill $BACK" EXIT
cd frontend && npm run dev
