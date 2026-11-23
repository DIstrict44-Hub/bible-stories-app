#!/usr/bin/env bash
# Start (or restart) the Bible Stories server in the background. Optional env in .env (see .env.example / NOTES.md)
cd "$(dirname "$0")"; mkdir -p logs
[ -f .env ] && set -a && . ./.env && set +a
[ -f logs/server.pid ] && kill "$(cat logs/server.pid)" 2>/dev/null && sleep 0.5
setsid nohup node "$PWD/server.js" >> logs/server.log 2>&1 < /dev/null &
echo $! > logs/server.pid
sleep 1; echo "PID $(cat logs/server.pid)"; tail -1 logs/server.log
