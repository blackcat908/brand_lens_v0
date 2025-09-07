#!/usr/bin/env python3
"""
Run the Flask app without auto-reload to prevent Playwright from causing restarts
"""

from app import app

if __name__ == '__main__':
    print("Starting Flask app without auto-reload...")
    print("This prevents Playwright from causing Flask restarts during scraping.")
    print("Server will be available at http://127.0.0.1:5000")
    print("Press Ctrl+C to stop.")
    
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=True,        # Keep debug mode for error messages
        use_reloader=False # Disable auto-reload to prevent Playwright interruptions
    )
