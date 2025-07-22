#!/bin/bash
python -m playwright install chromium
exec gunicorn app:app --bind 0.0.0.0:$PORT 