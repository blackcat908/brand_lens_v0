#!/usr/bin/env python3
import logging
from trustpilot_scraper import TrustpilotScraper

# Set up detailed logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def debug_full_scraper():
    print("=== Debugging Full Brand Scraping ===")
    
    # Initialize scraper
    scraper = TrustpilotScraper(headless=False)  # Set to False to see what's happening
    
    try:
        # Test scraping with NO page limit (like the full scraper)
        result = scraper.scrape_brand_reviews("oh-polly", max_pages=None)
        print(f"Full scraping result: {result} reviews found")
    except Exception as e:
        print(f"Error during full scraping: {e}")
        import traceback
        traceback.print_exc()
    finally:
        try:
            scraper.close_browser()
        except:
            pass

if __name__ == "__main__":
    debug_full_scraper()
