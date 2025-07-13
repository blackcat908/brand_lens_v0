import os

# List of brands to scrape
BRANDS = [
    'wanderdoll',
    'murci',
    'bbxbrand',
    'becauseofalice',
    'oddmuse',
]

# Scraping settings
SCRAPING_CONFIG = {
    'delay_between_pages': (0, 1),  # min, max seconds (reduced for speed)
    'delay_between_brands': 1,     # seconds (reduced for speed)
    'max_retries': 3,               # retry attempts per page
    'timeout': 10,                  # seconds for page load (reduced for speed)
    'headless': True,               # browser headless mode
    'max_consecutive_empty': 3,     # stop after N empty pages
}

# Logging settings
LOGGING_CONFIG = {
    'log_dir': 'logs',
    'log_level': 'INFO',
    'log_to_console': True,
    'log_to_file': True,
}

# Database settings
DATABASE_URL = os.environ.get('DATABASE_URL', 'sqlite:///reviews.db') 