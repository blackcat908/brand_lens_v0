#!/bin/bash
python -m playwright install chromium
exec python -m gunicorn app:app --bind 0.0.0.0:$PORT --timeout 300 