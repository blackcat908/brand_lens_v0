"""
Configuration file for Trustpilot Scraper
"""

import os

# Brand configurations
BRANDS = [
    'wanderdoll',
    'murci', 
    'bbxbrand',
    'becauseofalice',
    'oddmuse'
]

# Scraping settings
SCRAPING_CONFIG = {
    'max_pages_per_brand': 50,  # Limit pages for production
    'delay_between_brands': 10,  # Seconds to wait between brands
    'delay_between_pages': 5,   # Seconds to wait between pages
    'headless': True,           # Run browser in headless mode
    'timeout': 60000,           # Page load timeout in milliseconds
}

# Database settings
if os.environ.get('DATABASE_URL'):
    DATABASE_CONFIG = {
        'url': os.environ['DATABASE_URL'],
        'echo': False,
    }
elif os.environ.get('RENDER', '').lower() == 'true':
    # On Render, use Postgres
    DATABASE_CONFIG = {
        'url': 'postgresql://trustpilot_reviews_55fi_user:PpcbpA3oDt2hrFurDSrPGkdzgzg2c2gQ@dpg-d1r5ok8dl3ps73f3oh70-a.oregon-postgres.render.com/trustpilot_reviews_55fi',
        'echo': False,  # Set to True for SQL debugging
    }
else:
    # Local dev: use SQLite
    DATABASE_CONFIG = {
        'url': 'sqlite:///migrations/reviews.db',
        'echo': False,
    }

# Logging settings
LOGGING_CONFIG = {
    'level': 'INFO',
    'format': '%(asctime)s - %(levelname)s - %(message)s',
    'log_dir': 'logs',
    'max_log_files': 30,  # Keep last 30 days of logs
}

# Production settings
PRODUCTION_CONFIG = {
    'retry_attempts': 3,
    'retry_delay': 60,  # Seconds between retry attempts
    'max_concurrent_brands': 1,  # Don't scrape multiple brands simultaneously
} 