from playwright.sync_api import sync_playwright
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def debug_trustpilot_page():
    """Debug what's actually in the Trustpilot review page"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)  # Make visible so we can see
        page = browser.new_page()
        
        try:
            # Get Tala URL from database
            import sqlite3
            conn = sqlite3.connect('reviews.db')
            cursor = conn.cursor()
            cursor.execute("SELECT source_url FROM brand_source_urls WHERE brand_name = 'tala'")
            result = cursor.fetchone()
            conn.close()
            
            if result:
                base_url = result[0]
                # Remove any existing page parameter and add page=1
                if '?' in base_url:
                    base_url = base_url.split('?')[0]
                url = f"{base_url}?page=1"
                print(f"Using database URL: {url}")
            else:
                print("Tala URL not found in database")
                return
            logger.info(f"Testing URL: {url}")
            
            page.goto(url, wait_until='domcontentloaded', timeout=30000)
            
            # Wait for reviews to load
            page.wait_for_selector('article', timeout=10000)
            
            # Get all review articles
            articles = page.query_selector_all('article')
            logger.info(f"Found {len(articles)} article elements")
            
            if articles:
                # Examine the first article in detail
                first_article = articles[0]
                logger.info("=== FIRST ARTICLE ANALYSIS ===")
                
                # Get all text content
                all_text = first_article.text_content()
                logger.info(f"All text content: {all_text[:500]}...")
                
                # Look for customer name
                name_selectors = [
                    '[data-consumer-name-typography]',
                    'span[class*="name"]',
                    'div[class*="name"]',
                    'p[class*="name"]'
                ]
                
                for selector in name_selectors:
                    elem = first_article.query_selector(selector)
                    if elem:
                        logger.info(f"Customer name found with {selector}: {elem.text_content()}")
                        break
                
                # Look for review text
                review_selectors = [
                    '[data-service-review-text-typography]',
                    '.styles_reviewContent__tuXiN p',
                    'p[class*="review"]',
                    'div[class*="review"]',
                    'p'  # Generic p tags
                ]
                
                for selector in review_selectors:
                    elems = first_article.query_selector_all(selector)
                    if elems:
                        logger.info(f"Review text elements found with {selector}: {len(elems)} elements")
                        for i, elem in enumerate(elems[:3]):  # Show first 3
                            text = elem.text_content()
                            if text:
                                logger.info(f"  Element {i}: {text[:100]}...")
                
                # Look for date
                date_selectors = [
                    'p:contains("Date of experience")',
                    'span[class*="date"]',
                    'div[class*="date"]'
                ]
                
                for selector in date_selectors:
                    try:
                        if ':contains' in selector:
                            # Handle contains selector manually
                            all_p = first_article.query_selector_all('p')
                            for p in all_p:
                                text = p.text_content()
                                if text and "Date of experience" in text:
                                    logger.info(f"Date found: {text}")
                                    break
                        else:
                            elem = first_article.query_selector(selector)
                            if elem:
                                logger.info(f"Date found with {selector}: {elem.text_content()}")
                                break
                    except Exception as e:
                        continue
                
                # Look for rating
                rating_selectors = [
                    'img[alt*="Rated"]',
                    'span[class*="rating"]',
                    'div[class*="rating"]'
                ]
                
                for selector in rating_selectors:
                    elem = first_article.query_selector(selector)
                    if elem:
                        if selector.startswith('img'):
                            alt = elem.get_attribute('alt')
                            logger.info(f"Rating found with {selector}: {alt}")
                        else:
                            logger.info(f"Rating found with {selector}: {elem.text_content()}")
                        break
                
                # Get HTML structure
                html = first_article.inner_html()
                logger.info(f"HTML structure (first 1000 chars): {html[:1000]}...")
                
            browser.close()
            
        except Exception as e:
            logger.error(f"Error: {e}")
            browser.close()

if __name__ == "__main__":
    debug_trustpilot_page()
