#!/usr/bin/env python3
import logging
from trustpilot_scraper import TrustpilotScraper

# Set up detailed logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def debug_scraping():
    print("=== Debugging Review Extraction ===")
    
    # Initialize scraper
    scraper = TrustpilotScraper(headless=False)  # Set to False to see what's happening
    
    try:
        # Test the scrape_page method directly
        test_url = "https://uk.trustpilot.com/review/ohpolly.com?languages=all"
        print(f"Testing URL: {test_url}")
        
        # Start browser
        scraper.start_browser()
        print("Browser started successfully")
        
        # Try to scrape the page
        page_reviews = scraper.scrape_page(test_url)
        print(f"Raw page_reviews result: {page_reviews}")
        print(f"Type: {type(page_reviews)}")
        print(f"Length: {len(page_reviews) if page_reviews else 0}")
        
        if page_reviews:
            print(f"First review sample: {page_reviews[0] if len(page_reviews) > 0 else 'None'}")
        
    except Exception as e:
        print(f"Error during debugging: {e}")
        import traceback
        traceback.print_exc()
    finally:
        try:
            scraper.close_browser()
        except:
            pass

if __name__ == "__main__":
    debug_scraping()
