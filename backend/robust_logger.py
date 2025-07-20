import logging
import os
from datetime import datetime
from robust_config import LOGGING_CONFIG

def setup_logger(name='scraper'):
    log_dir = LOGGING_CONFIG['log_dir']
    os.makedirs(log_dir, exist_ok=True)
    log_level = getattr(logging, LOGGING_CONFIG['log_level'].upper(), logging.INFO)
    log_file = os.path.join(log_dir, f"{name}_{datetime.now().strftime('%Y%m%d')}.log")

    handlers = []
    if LOGGING_CONFIG['log_to_file']:
        handlers.append(logging.FileHandler(log_file, encoding='utf-8'))
    if LOGGING_CONFIG['log_to_console']:
        handlers.append(logging.StreamHandler())

    logging.basicConfig(
        level=log_level,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=handlers
    )
    return logging.getLogger(name) 