"""
Configuration file for Trustpilot Scraper
"""

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
    'max_pages_per_brand': 3,  # Limit pages for production
    'delay_between_brands': 10,  # Seconds to wait between brands
    'delay_between_pages': 5,   # Seconds to wait between pages
    'headless': True,           # Run browser in headless mode
    'timeout': 60000,           # Page load timeout in milliseconds
}

# Database settings
DATABASE_CONFIG = {
    'url': 'postgresql://brand_dashboard_db_user:Ap52k5jyHun9mh55cJ9kVbAHW3wAl1M1@dpg-d1ps4rc9c44c738v2ap0-a.oregon-postgres.render.com:5432/brand_dashboard_db?sslmode=require',
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