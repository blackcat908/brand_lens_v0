"""
Configuration file for Trustpilot Scraper
"""

import os

# Brand configurations
BRANDS = [
    'house-of-cb',
    'tala', 
    'oddmuse-london',
    'because-of-alice',
    'bbx-brand',
    'murci',
    'couture-club',
    'club-l-london',
    'jaki',
    'maniere-de-voir',
    'glory',
    'khanums',
    'dfyne',
    'cernucci',
    'motel-rocks',
    'nadine-merabi',
    'poster-girl',
    'represent',
    'represent-clo',
    'rat-and-boa',
    'oh-polly',
    'hera-clothing',
    'jaded-london',
    'meshki',
    'nobodys-child',
    'charli-london'
]

# Scraping settings
SCRAPING_CONFIG = {
    'max_pages_per_brand': None,  # No limit - scrape all pages until natural end
    'delay_between_brands': 10,  # Seconds to wait between brands
    'delay_between_pages': (0, 1),  # min, max seconds (random range for speed)
            'headless': True,           # Run browser in headless mode (invisible)
    'timeout': 60000,           # Page load timeout in milliseconds
    'max_retries': 3,           # retry attempts per page
    'max_consecutive_empty': 3, # stop after N empty pages
}

# Database settings - use Railway's reference variable
database_url = os.environ.get('DATABASE_URL')
if not database_url:
    print("WARNING: DATABASE_URL environment variable is not set!")
    print("Using SQLite fallback for local development")
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

# AI Service settings
AI_CONFIG = {
    'openai_api_key': os.environ.get('OPENAI_API_KEY') or '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',
    'model': 'gpt-3.5-turbo',
    'max_tokens': 4000,  # Increased for larger datasets
    'temperature': 0.7,
    # NO REVIEW LIMITS - Process ALL filtered reviews!
}

# Production settings
PRODUCTION_CONFIG = {
    'retry_attempts': 3,
    'retry_delay': 60,  # Seconds between retry attempts
    'max_concurrent_brands': 1,  # Don't scrape multiple brands simultaneously
} 
