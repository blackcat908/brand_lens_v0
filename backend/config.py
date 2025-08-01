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
    'delay_between_pages': (0, 1),  # min, max seconds (random range for speed)
    'headless': True,           # Run browser in headless mode
    'timeout': 60000,           # Page load timeout in milliseconds
    'max_retries': 3,           # retry attempts per page
    'max_consecutive_empty': 3, # stop after N empty pages
}

# Database settings - use Railway's reference variable
database_url = os.environ.get('DATABASE_URL')
if not database_url:
    print("ERROR: DATABASE_URL environment variable is not set!")
    print("Please set DATABASE_URL in Railway variables to: ${{ Postgres.DATABASE_URL }}")
    # Use fallback for local development
    database_url = 'sqlite:///reviews.db'  # Fallback to SQLite for local development

DATABASE_CONFIG = {
    'url': database_url,
    'echo': False,  # Set to True for SQL debugging
}

# Logging settings
LOGGING_CONFIG = {
    'level': 'INFO',
    'format': '%(asctime)s - %(levelname)s - %(message)s',
    'log_dir': 'logs',
    'max_log_files': 30,  # Keep last 30 days of logs
    'log_to_console': True,  # Log to console
    'log_to_file': True,     # Log to file
}

# Production settings
PRODUCTION_CONFIG = {
    'retry_attempts': 3,
    'retry_delay': 60,  # Seconds between retry attempts
    'max_concurrent_brands': 1,  # Don't scrape multiple brands simultaneously
} 
