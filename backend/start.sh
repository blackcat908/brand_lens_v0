#!/bin/bash
set -e

echo "Starting deployment..."
echo "Environment check:"
echo "PORT: $PORT"
echo "DATABASE_URL set: $(if [ -n "$DATABASE_URL" ]; then echo "YES"; else echo "NO"; fi)"

echo "Installing Playwright..."
python -m playwright install chromium

echo "Starting Gunicorn server..."
exec python -m gunicorn app:app --bind 0.0.0.0:$PORT --timeout 300 --workers 1 --preload 
