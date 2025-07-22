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
def get_database_url():
    """Build database URL from individual environment variables"""
    # Check if we have individual PostgreSQL variables (Railway linked services)
    if all([os.environ.get('PGHOST'), os.environ.get('PGPORT'), os.environ.get('PGDATABASE')]):
        pguser = os.environ.get('PGUSER', 'postgres')
        pgpassword = os.environ.get('PGPASSWORD', '')
        pghost = os.environ.get('PGHOST')
        pgport = os.environ.get('PGPORT')
        pgdatabase = os.environ.get('PGDATABASE')
        return f"postgresql://{pguser}:{pgpassword}@{pghost}:{pgport}/{pgdatabase}"
    
    # Fallback to DATABASE_URL if provided
    elif os.environ.get('DATABASE_URL'):
        return os.environ['DATABASE_URL']
    
    # Local dev: use SQLite
    else:
        return 'sqlite:///migrations/reviews.db'

DATABASE_CONFIG = {
    'url': get_database_url(),
    'echo': False,  # Set to True for SQL debugging
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
