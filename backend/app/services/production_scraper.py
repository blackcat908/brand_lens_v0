#!/usr/bin/env python3
"""
Production Trustpilot Scraper
This script can be run as a scheduled job (cron, Windows Task Scheduler, etc.)
"""

import logging
import sys
import time
from datetime import datetime
from pathlib import Path
from sqlalchemy import func
from trustpilot_scraper import TrustpilotScraper
from database import init_db, get_db_session, Review

# Configure logging
def setup_logging():
    """Setup logging configuration for production"""
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)
    
    log_file = log_dir / f"scraper_{datetime.now().strftime('%Y%m%d')}.log"
    
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(log_file),
            logging.StreamHandler(sys.stdout)
        ]
    )
    return logging.getLogger(__name__)

def scrape_all_brands():
    """Scrape all configured brands"""
    logger = setup_logging()
    
    # List of brands to scrape
    brands = [
        'wander-doll',  # Use dash to match correct Trustpilot URL
        'murci', 
        'bbxbrand',
        'becauseofalice',
        'oddmuse'
    ]
    
    # Initialize database
    try:
        init_db()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        return False
    
    scraper = None
    success_count = 0
    total_brands = len(brands)
    
    try:
        for brand in brands:
            logger.info(f"Starting scrape for brand: {brand}")
            
            try:
                scraper = TrustpilotScraper(headless=True)
                # PILOT SCRAPE: Only scrape 2 pages (about 40 reviews) per brand for testing
                scraper.scrape_brand_reviews(brand, max_pages=2)  # <-- PILOT SCRAPE: change to None for full scrape
                success_count += 1
                logger.info(f"Successfully scraped {brand}")
                
            except Exception as e:
                logger.error(f"Failed to scrape {brand}: {e}")
                continue
                
            finally:
                if scraper:
                    try:
                        scraper.close_browser()
                    except:
                        pass
                
            # Wait between brands to be respectful
            time.sleep(10)
    
    except Exception as e:
        logger.error(f"Critical error in scraping process: {e}")
        return False
    
    logger.info(f"Scraping completed. {success_count}/{total_brands} brands successful")
    return success_count == total_brands

def get_scraping_stats():
    """Get statistics about scraped data"""
    try:
        with get_db_session() as db:
            cursor = db.cursor()
            cursor.execute('SELECT COUNT(*) FROM reviews')
            total_reviews = cursor.fetchone()[0]
            cursor.execute('SELECT brand_name, COUNT(id) FROM reviews GROUP BY brand_name')
            brand_counts = cursor.fetchall()
            stats = {
                'total_reviews': total_reviews,
                'brands': {brand: count for brand, count in brand_counts}
            }
            return stats
    except Exception as e:
        logging.error(f"Failed to get stats: {e}")
        return None

if __name__ == "__main__":
    success = scrape_all_brands()
    
    # Get and log statistics
    stats = get_scraping_stats()
    if stats:
        logging.info(f"Database stats: {stats}")
    
    # Exit with appropriate code for scheduling systems
    sys.exit(0 if success else 1) 