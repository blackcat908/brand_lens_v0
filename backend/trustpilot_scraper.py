from __future__ import annotations
import asyncio
import time
from playwright.sync_api import sync_playwright, Page, Browser, Playwright
import re
import random
from datetime import datetime
import sys
import os
import json
import requests
from PIL import Image
from io import BytesIO
import logging
logger = logging.getLogger(__name__)

# Import our new database modules
from database import get_brand_source_url, get_db_session, get_brand_keywords, get_global_keywords, init_db, get_brand_logo, update_brand_logo
from sentiment_analyzer import SentimentAnalyzer
from sqlalchemy import text
from database import Review # Added missing import

# Initialize NLTK data at module level to prevent WordListCorpusReader errors
try:
    import nltk
    # Download required NLTK data with quiet=True to avoid compatibility issues
    nltk.download('punkt', quiet=True)
    nltk.download('wordnet', quiet=True)
    nltk.download('omw-1.4', quiet=True)
    logger.info("NLTK data initialized successfully")
except Exception as nltk_init_error:
    logger.warning(f"NLTK initialization warning: {nltk_init_error}")

# Add this helper function at the top-level (after imports, before TrustpilotScraper)
def parse_date_flexibly(date_str):
    """Try multiple date formats and return a datetime object or None if all fail."""
    if not date_str:
        return None
    
    # Clean the date string
    date_str = str(date_str).strip()
    
    formats = [
        '%Y-%m-%dT%H:%M:%S.%fZ',  # ISO format: 2025-08-23T23:16:30.000Z
        '%Y-%m-%dT%H:%M:%SZ',     # ISO format: 2025-08-23T23:16:30Z
        '%Y-%m-%dT%H:%M:%S',      # ISO format: 2025-08-23T23:16:30
        '%Y-%m-%d',                # YYYY-MM-DD
        '%B %d, %Y',               # July 07, 2025
        '%d %b %Y',                # 07 Jul 2025
        '%d %B %Y',                # 07 July 2025
        '%b %d, %Y',               # Jul 07, 2025
        '%d.%m.%Y',                # 07.07.2025
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt)
        except Exception:
            continue
    
    # If all formats fail, try to extract just the date part from ISO strings
    if 'T' in date_str and '-' in date_str:
        try:
            # Extract just the date part (before the T)
            date_part = date_str.split('T')[0]
            return datetime.strptime(date_part, '%Y-%m-%d')
        except Exception:
            pass
    
    return None

class TrustpilotScraper:
    def __init__(self, headless: bool = True):
        self.headless = headless
        self.playwright = None
        self.browser: Browser | None = None
        self.page: Page | None = None
        self.sentiment_analyzer = SentimentAnalyzer()
        
    def start_browser(self):
        """Initialize the browser"""
        self.playwright = sync_playwright().start()
        self.browser = self.playwright.chromium.launch(headless=self.headless)
        self.page = self.browser.new_page()
        self.page.set_extra_http_headers({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
        
    def close_browser(self):
        """Close the browser and playwright"""
        if self.browser:
            self.browser.close()
        if self.playwright:
            self.playwright.stop()
            
    def scrape_page(self, url):
        """Scrapes a single page of reviews."""
        try:
            if self.page is None:
                raise Exception("Page is not initialized")
            self.page.goto(url, wait_until='domcontentloaded', timeout=30000)
            # Wait for review cards to load (faster timeout)
            try:
                self.page.wait_for_selector('article', timeout=10000)
            except:
                pass  # Continue even if timeout
            review_cards = self.page.query_selector_all('article')
            
            page_reviews = []
            for card in review_cards:
                # Updated selectors based on current Trustpilot structure
                name_elem = card.query_selector('[data-consumer-name-typography]')
                if not name_elem:
                    # Fallback: try alternative name selectors
                    name_elem = card.query_selector('[data-consumer-name]')
                
                date_text = None
                # Look for date in multiple locations
                date_selectors = [
                    '[data-review-date]',
                    'time',
                    'span[class*="date"]',
                    '[data-service-review-date]'
                ]
                
                for selector in date_selectors:
                    try:
                        date_elem = card.query_selector(selector)
                        if date_elem:
                            date_attr = date_elem.get_attribute('data-review-date') or date_elem.get_attribute('datetime') or date_elem.get_attribute('data-service-review-date') or date_elem.text_content()
                            if date_attr:
                                parsed_date = parse_date_flexibly(date_attr.strip())
                                if parsed_date:
                                    date_text = parsed_date.strftime("%Y-%m-%d")
                                    break
                    except Exception as e:
                        logger.debug(f"Date extraction failed for selector {selector}: {e}")
                        continue
                
                if not name_elem or not date_text:
                    logger.debug(f"Skipping review - name: {bool(name_elem)}, date: {bool(date_text)}")
                    continue

                # Updated rating extraction
                star_rating = None
                # Method 1: Try data attribute first
                rating_elem = card.query_selector('[data-service-review-rating]')
                if rating_elem:
                    rating_attr = rating_elem.get_attribute('data-service-review-rating')
                    if rating_attr and rating_attr.isdigit():
                        star_rating = int(rating_attr)
                
                # Method 2: Fallback to image alt text
                if not star_rating:
                    rating_img = card.query_selector('img[alt*="Rated"]')
                    if rating_img:
                        alt_text = rating_img.get_attribute('alt')
                        if alt_text:
                            match = re.search(r'Rated (\d) out of 5 stars', alt_text)
                            if match:
                                star_rating = int(match.group(1))

                # Updated title and body extraction
                title_elem = card.query_selector('[data-review-title-typography]')
                if not title_elem:
                    title_elem = card.query_selector('h2, h3, [data-review-title]')
                
                body_elem = card.query_selector('[data-service-review-text-typography]')
                if not body_elem:
                    body_elem = card.query_selector('p')
                
                # Extract review link - find individual review links
                review_link = None
                
                # Method 1: Look for the specific data-review-title-typography link (most reliable)
                title_link = card.query_selector('[data-review-title-typography]')
                if title_link:
                    # Check if this element is an anchor tag
                    if title_link.evaluate('el => el.tagName === "A"'):
                        href = title_link.get_attribute('href')
                        if href and '/reviews/' in href:
                            if href.startswith('/'):
                                review_link = f"https://uk.trustpilot.com{href}"
                            elif href.startswith('http'):
                                review_link = href
                            else:
                                review_link = f"https://uk.trustpilot.com/{href}"
                
                # Method 2: Look for any link with /reviews/ pattern in the entire card
                if not review_link:
                    all_links = card.query_selector_all('a[href*="/reviews/"]')
                    for link in all_links:
                        href = link.get_attribute('href')
                        if href and '/reviews/' in href:
                            if href.startswith('/'):
                                review_link = f"https://uk.trustpilot.com{href}"
                            elif href.startswith('http'):
                                review_link = href
                            else:
                                review_link = f"https://uk.trustpilot.com/{href}"
                            break
                
                # Method 3: Look for title wrapped in an anchor tag
                if not review_link:
                    title_link = card.query_selector('h2 a, h3 a, [data-review-title] a')
                    if title_link:
                        href = title_link.get_attribute('href')
                        if href and '/reviews/' in href:
                            if href.startswith('/'):
                                review_link = f"https://uk.trustpilot.com{href}"
                            elif href.startswith('http'):
                                review_link = href
                            else:
                                review_link = f"https://uk.trustpilot.com/{href}"
                
                # Method 4: Look for any element with data-review-title-typography that might be wrapped in an anchor
                if not review_link:
                    title_elem = card.query_selector('[data-review-title-typography]')
                    if title_elem:
                        # Check if this element is wrapped in an anchor tag using evaluate
                        is_wrapped_in_anchor = title_elem.evaluate('''el => {
                            let parent = el.parentElement;
                            while (parent && parent.tagName !== 'A' && parent !== el.closest('[data-testid*="service-review-card-"]')) {
                                parent = parent.parentElement;
                            }
                            return parent && parent.tagName === 'A' ? parent.getAttribute('href') : null;
                        }''')
                        if is_wrapped_in_anchor and '/reviews/' in is_wrapped_in_anchor:
                            href = is_wrapped_in_anchor
                            if href.startswith('/'):
                                review_link = f"https://uk.trustpilot.com{href}"
                            elif href.startswith('http'):
                                review_link = href
                            else:
                                review_link = f"https://uk.trustpilot.com/{href}"
                
                # Extract customer name first (needed for logging)
                customer_name = ''
                if name_elem and name_elem.text_content():
                    name_raw = name_elem.text_content()
                    customer_name = name_raw.strip() if name_raw is not None else ''
                
                # CRITICAL: Never fall back to page URL - this breaks duplication logic!
                if not review_link:
                    # Skip this review instead of using page URL (no warning log)
                    continue
                
                title_text = ''
                if title_elem and title_elem.text_content():
                    title_raw = title_elem.text_content()
                    title_text = title_raw.strip() if title_raw is not None else ''
                body_text = ''
                if body_elem and body_elem.text_content():
                    body_raw = body_elem.text_content()
                    body_text = body_raw.strip() if body_raw is not None else ''
                page_reviews.append({
                    'customer_name': customer_name,
                    'review': body_text,
                    'rating': star_rating,
                    'date': date_text,
                    'review_link': review_link
                })
                # Removed debug print to clean up logs
            return page_reviews
        except Exception as e:
            logger.error(f"Error scraping page {url}: {e}")
            return []

    def get_trustpilot_url(self, brand_name, page_num):
        """Get Trustpilot URL from database with proper languages=all parameter"""
        try:
            with get_db_session() as db:
                brand_source = get_brand_source_url(db, brand_name)
                if brand_source and 'source_url' in brand_source:
                    base_url = brand_source['source_url']
                    # Remove any existing page parameter
                    if '?' in base_url:
                        base_url = base_url.split('?')[0]
                    
                    # Add languages=all parameter for all pages
                    if page_num == 1:
                        return f"{base_url}?languages=all"
                    else:
                        return f"{base_url}?languages=all&page={page_num}"
                else:
                    logger.error(f"No Trustpilot URL found in database for brand '{brand_name}'")
                    return None
        except Exception as e:
            logger.error(f"Error getting Trustpilot URL for {brand_name}: {e}")
            return None

    def get_trustpilot_source_url(self, brand_name):
        """Get Trustpilot source URL from database - NO FALLBACKS, NO NORMALIZATION"""
        try:
            with get_db_session() as db:
                brand_source = get_brand_source_url(db, brand_name)
                if brand_source and 'source_url' in brand_source:
                    return brand_source['source_url']
                else:
                    logger.error(f"No Trustpilot URL found in database for brand '{brand_name}'")
                    return None
        except Exception as e:
            logger.error(f"Error getting Trustpilot source URL for {brand_name}: {e}")
            return None

    def get_fallback_urls(self, user_url):
        # Generate smart fallback variations based on the user_url
        from urllib.parse import urlparse
        parsed = urlparse(user_url)
        base = parsed.scheme + '://' + parsed.netloc
        path = parsed.path
        fallbacks = set()
        # Try with and without www.
        if 'www.' in path:
            fallbacks.add(base + path.replace('www.', '', 1))
        else:
            parts = path.split('/')
            if len(parts) > 2:
                parts[2] = 'www.' + parts[2]
                fallbacks.add(base + '/'.join(parts))
        # Try .com and .co.uk
        if '.com' in path:
            fallbacks.add(base + path.replace('.com', '.co.uk'))
        if '.co.uk' in path:
            fallbacks.add(base + path.replace('.co.uk', '.com'))
        return list(fallbacks)

    def extract_brand_name(self, trustpilot_url: str) -> str | None:
        """Extract the official brand name from a Trustpilot page using Playwright."""
        logger.info(f"[BRANDNAME] Extracting brand name from: {trustpilot_url}")
        from playwright.sync_api import sync_playwright
        import re
        import time
        
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(
                    headless=True,
                    args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
                )
                page = browser.new_page()
                
                # Set a shorter timeout and add retries
                page.goto(trustpilot_url, wait_until="domcontentloaded", timeout=15000)
                time.sleep(1)  # Small delay to ensure page loads
                
                # Use robust selector for Trustpilot brand name
                brand_elem = page.query_selector("span[class*='title_title_displayName']")
                if brand_elem:
                    brand_name_raw = brand_elem.text_content()
                    if brand_name_raw:
                        brand_name = brand_name_raw.strip()
                        logger.info(f"[BRANDNAME] Found brand name (span): {brand_name}")
                        return brand_name
                        
                # Fallback: try the main <h1> selector
                h1_elem = page.query_selector('h1')
                if h1_elem:
                    h1_text = h1_elem.text_content()
                    if h1_text:
                        brand_name = re.sub(r"Reviews.*", "", h1_text).strip()
                        logger.info(f"[BRANDNAME] Found brand name (h1): {brand_name}")
                        return brand_name
                        
                # Fallback: try a more specific selector if needed
                h1_alt = page.query_selector('h1[data-business-unit-title-typography]')
                if h1_alt:
                    h1_alt_text = h1_alt.text_content()
                    if h1_alt_text:
                        brand_name = re.sub(r"Reviews.*", "", h1_alt_text).strip()
                        logger.info(f"[BRANDNAME] Found brand name (alt): {brand_name}")
                        return brand_name
                        
                logger.info("[BRANDNAME] Brand name not found on page.")
                return None
                
        except Exception as e:
            logger.error(f"[BRANDNAME] Error extracting brand name: {e}")
            return None

    def scrape_brand_reviews(self, brand_name, max_pages=50, start_page=1, is_new_brand=False):
        """ULTRA-FAST scraper for a brand - single browser instance, minimal logging, 2-3 seconds per page"""
        import time
        start_time = time.time()
        
        logger.info(f"[SCRAPER] Starting scraping for: {brand_name}")
        
        with get_db_session() as db:
            brand_source = get_brand_source_url(db, brand_name)
            if brand_source and 'source_url' in brand_source:
                user_url = brand_source['source_url']
            else:
                logger.error(f"[ERROR] No Trustpilot URL found for brand '{brand_name}'. Aborting.")
                return 0
            
            # Fetch keywords for analysis
            brand_keywords = get_brand_keywords(db, brand_name)
            global_keywords = get_global_keywords(db)
            
            # Get initial count of existing reviews
            existing_reviews_count = db.query(Review).filter(Review.brand_name == brand_name).count()
            logger.info(f"[SCRAPER] Found {existing_reviews_count} existing reviews for '{brand_name}'")
        
        # Start single browser instance
        logger.info("[SCRAPER] Starting browser...")
        browser_start = time.time()
        self.start_browser()
        logger.info(f"[SCRAPER] Browser started in {browser_start - start_time:.2f}s")
        
        # Fetch logo for the brand (ultra-fast) using existing browser instance
        try:
            with get_db_session() as db:
                existing_logo = get_brand_logo(db, brand_name)
                if not existing_logo:
                    logger.info(f"[LOGO] Fetching logo for {brand_name}...")
                    logo_start = time.time()
                    self.fetch_logo_with_existing_browser(user_url, brand_name)
                    logo_end = time.time()
                    logger.info(f"[LOGO] Logo fetched in {logo_end - logo_start:.2f}s")
                else:
                    logger.info(f"[LOGO] Logo already exists for {brand_name}")
        except Exception as e:
            logger.warning(f"[LOGO] Logo fetch failed: {e}")
        
        # Get total review count for pagination (ultra-fast)
        total_reviews = self.get_total_reviews_count_from_trustpilot(brand_name)
        if total_reviews:
            estimated_pages = (total_reviews // 20) + 1
            logger.info(f"[COUNT] Total reviews: {total_reviews}, estimated pages: {estimated_pages}")
        else:
            estimated_pages = 50  # Default fallback
            logger.warning("[COUNT] Could not get total review count, using default 50 pages")
        
        total_new_reviews = 0
        page_num = start_page
        consecutive_empty_pages = 0
        max_consecutive_empty = 3
        
        try:
            logger.info(f"[SCRAPER] Starting to scrape {'all pages' if max_pages is None else f'pages {start_page} to {max_pages}'}...")
            scrape_start = time.time()
            
            while page_num <= estimated_pages and consecutive_empty_pages < max_consecutive_empty:
                if max_pages is not None and page_num > max_pages:
                    logger.info(f"[SCRAPER] Reached max_pages limit ({max_pages}). Stopping.")
                    break
                
                page_start = time.time()
                
                # Navigate to page (ultra-fast) - correct URL structure
                if page_num == 1:
                    page_url = f"{user_url}?languages=all"
                else:
                    page_url = f"{user_url}?languages=all&page={page_num}"
                logger.info(f"[SCRAPER] Navigating to: {page_url}")
                self.page.goto(page_url, wait_until='domcontentloaded', timeout=8000)
                
                # Wait minimal time for reviews to load
                try:
                    self.page.wait_for_selector('article', timeout=3000)
                except:
                    pass
                
                # Scroll down to load the main reviews section (skip sample reviews)
                try:
                    # Scroll to find the main reviews section
                    self.page.evaluate("window.scrollTo(0, 800)")  # Scroll down to skip sample reviews
                    time.sleep(0.5)  # Wait for content to load
                except:
                    pass
                
                # Get review cards from the main reviews section only
                # Look for the main reviews container, not the sample reviews at the top
                review_cards = self.page.query_selector_all('article[data-service-review-card-paper="true"]')
                
                if not review_cards:
                    consecutive_empty_pages += 1
                    logger.warning(f"[SCRAPER] No reviews on page {page_num}, consecutive empty: {consecutive_empty_pages}")
                    page_num += 1
                    continue
                
                consecutive_empty_pages = 0
                
                # Process reviews with expanded handling (ultra-fast)
                page_reviews = []
                
                # First pass: Click all expand buttons
                expand_buttons_clicked = 0
                for card in review_cards:
                    try:
                        # Look for expand buttons and click them
                        expand_buttons = card.query_selector_all('button[name="review-stack-show"]')
                        for expand_button in expand_buttons:
                            try:
                                expand_button.click()
                                expand_buttons_clicked += 1
                                time.sleep(0.1)  # Minimal wait for expansion
                            except:
                                pass
                    except:
                        pass
                

                
                # Second pass: Extract all reviews (including expanded ones)
                # Get all review cards again after expansion - use the same selector as before
                review_cards_after_expansion = self.page.query_selector_all('article[data-service-review-card-paper="true"]')
                


                
                for card in review_cards_after_expansion:
                    try:
                        # Ultra-fast review extraction with flexible selectors
                        name_elem = card.query_selector('[data-consumer-name-typography]')
                        if not name_elem:
                            name_elem = card.query_selector('[data-consumer-name]')
                        if not name_elem:
                            name_elem = card.query_selector('span[class*="consumer-name"]')
                        
                        # Date extraction with multiple selectors
                        date_elem = None
                        date_selectors = [
                            '[data-review-date]',
                            'time',
                            'span[class*="date"]',
                            '[data-service-review-date]'
                        ]
                        for selector in date_selectors:
                            date_elem = card.query_selector(selector)
                            if date_elem:
                                break
                        
                        # Rating extraction with multiple selectors
                        rating_elem = card.query_selector('[data-service-review-rating]')
                        if not rating_elem:
                            rating_elem = card.query_selector('img[alt*="Rated"]')
                        
                        # Title extraction with multiple selectors
                        title_elem = card.query_selector('[data-review-title-typography]')
                        if not title_elem:
                            title_elem = card.query_selector('h2, h3, [data-review-title]')
                        
                        # Body extraction with multiple selectors
                        body_elem = card.query_selector('[data-service-review-text-typography]')
                        if not body_elem:
                            body_elem = card.query_selector('p')
                        
                        # Use title as body when body is missing (for short reviews like "Amazing team x")
                        if not body_elem and title_elem:
                            body_elem = title_elem
                        
                        # Only require essential elements (name and date are critical)
                        if not name_elem or not date_elem:
                            continue
                        
                        # Extract data with fallbacks
                        customer_name = name_elem.text_content().strip()
                        
                        # Date extraction with multiple fallbacks
                        date_attr = date_elem.get_attribute('data-review-date') or date_elem.get_attribute('datetime') or date_elem.get_attribute('data-service-review-date') or date_elem.text_content()
                        
                        # Rating extraction with fallbacks
                        star_rating = None
                        if rating_elem:
                            if rating_elem.get_attribute('data-service-review-rating'):
                                star_rating = rating_elem.get_attribute('data-service-review-rating')
                            elif rating_elem.get_attribute('alt'):
                                alt_text = rating_elem.get_attribute('alt')
                                import re
                                match = re.search(r'Rated (\d) out of 5 stars', alt_text)
                                if match:
                                    star_rating = match.group(1)
                        
                        # Title and body extraction with fallbacks
                        title_text = title_elem.text_content().strip() if title_elem else ''
                        body_text = body_elem.text_content().strip() if body_elem else ''
                        
                        # Parse date
                        parsed_date = parse_date_flexibly(date_attr.strip())
                        if not parsed_date:
                            continue
                        date_text = parsed_date.strftime("%Y-%m-%d")
                        
                        # Get review link with multiple fallbacks
                        review_link = None
                        
                        # Try title link first
                        title_link = card.query_selector('[data-review-title-typography]')
                        if title_link:
                            if title_link.evaluate('el => el.tagName === "A"'):
                                href = title_link.get_attribute('href')
                                if href and '/reviews/' in href:
                                    if href.startswith('/'):
                                        review_link = f"https://uk.trustpilot.com{href}"
                                    elif href.startswith('http'):
                                        review_link = href
                                    else:
                                        review_link = f"https://uk.trustpilot.com/{href}"
                        
                        # Try all links in the card
                        if not review_link:
                            all_links = card.query_selector_all('a[href*="/reviews/"]')
                            for link in all_links:
                                href = link.get_attribute('href')
                                if href and '/reviews/' in href:
                                    if href.startswith('/'):
                                        review_link = f"https://uk.trustpilot.com{href}"
                                    elif href.startswith('http'):
                                        review_link = href
                                    else:
                                        review_link = f"https://uk.trustpilot.com/{href}"
                                    break
                        
                        # For new brands, we can be more lenient with missing review links
                        if not review_link and not is_new_brand:
                            continue
                        
                        # Create review data with fallbacks for missing elements
                        # Use body text if available, otherwise use title text (review summary)
                        review_content = body_text if body_text else title_text
                        if not review_content:
                            review_content = 'No review text available'
                        
                        review_data = {
                            'customer_name': customer_name,
                            'review': review_content,
                            'rating': int(star_rating) if star_rating and star_rating.isdigit() else None,
                            'date': date_text,
                            'review_link': review_link or f"https://uk.trustpilot.com/review/{brand_name.lower().replace(' ', '-')}"
                        }
                        
                        page_reviews.append(review_data)
                        
                    except Exception as e:
                        continue  # Skip problematic reviews
                
                if page_reviews:
                    # Check for existing reviews (skip for new brands)
                    if is_new_brand:
                        newly_found_on_page = page_reviews
                    else:
                        with get_db_session() as db:
                            result = db.execute(text("SELECT review_link FROM reviews WHERE brand_name = :brand_name"), {"brand_name": brand_name})
                            existing_links = {row[0] for row in result.fetchall() if row[0]}
                        newly_found_on_page = [r for r in page_reviews if r['review_link'] not in existing_links]
                    
                    # Process and insert reviews (ultra-fast)
                    if newly_found_on_page:
                        page_new_reviews = 0
                        with get_db_session() as db:
                            for review_data in newly_found_on_page:
                                try:
                                    # Ultra-fast sentiment analysis
                                    analysis = self.sentiment_analyzer.process_review(review_data['review'])
                                    if analysis['sentiment_score'] is None:
                                        continue
                                    
                                    # Ultra-fast keyword processing (simplified)
                                    review_text_lower = review_data['review'].lower()
                                    matched_categories = set()
                                    matched_keywords = set()
                                    
                                    # Get keywords
                                    brand_keywords = get_brand_keywords(db, brand_name)
                                    global_keywords = get_global_keywords(db)
                                    
                                    # Simple keyword matching
                                    for category, keywords in brand_keywords.items():
                                        for kw in keywords:
                                            if kw.lower() in review_text_lower:
                                                matched_categories.add(category)
                                                matched_keywords.add(kw)
                                    
                                    for category, keywords in global_keywords.items():
                                        for kw in keywords:
                                            if kw.lower() in review_text_lower:
                                                matched_categories.add(category)
                                                matched_keywords.add(kw)
                                    
                                    # Insert review
                                    categories_json = json.dumps(sorted(matched_categories))
                                    matched_keywords_json = json.dumps(sorted(matched_keywords))
                                    
                                    db.execute(
                                        text("INSERT INTO reviews (brand_name, customer_name, review, rating, date, review_link, sentiment_score, sentiment_category, categories, matched_keywords) VALUES (:brand_name, :customer_name, :review, :rating, :date, :review_link, :sentiment_score, :sentiment_category, :categories, :matched_keywords)"),
                                        {
                                            "brand_name": brand_name,
                                            "customer_name": review_data['customer_name'],
                                            "review": review_data['review'],
                                            "rating": review_data['rating'],
                                            "date": review_data['date'],
                                            "review_link": review_data['review_link'],
                                            "sentiment_score": analysis['sentiment_score'],
                                            "sentiment_category": analysis['sentiment_category'],
                                            "categories": categories_json,
                                            "matched_keywords": matched_keywords_json
                                        }
                                    )
                                    page_new_reviews += 1
                                    
                                except Exception as e:
                                    continue
                            
                            db.commit()
                        
                        total_new_reviews += page_new_reviews
                        page_end = time.time()
                        page_time = page_end - page_start
                        logger.info(f"[SCRAPER] Page {page_num}/{estimated_pages}: {page_new_reviews} reviews saved, completed in {page_time:.1f}s, total review count: {total_new_reviews}")
                    else:
                        page_end = time.time()
                        page_time = page_end - page_start
                        logger.info(f"[SCRAPER] Page {page_num}/{estimated_pages}: No new reviews, completed in {page_time:.1f}s, total review count: {total_new_reviews}")
                else:
                    consecutive_empty_pages += 1
                    page_end = time.time()
                    page_time = page_end - page_start
                    logger.warning(f"[SCRAPER] Page {page_num}/{estimated_pages}: No reviews extracted, completed in {page_time:.1f}s, total review count: {total_new_reviews}")
                
                # Check if we should continue
                if not is_new_brand and len(newly_found_on_page) < len(page_reviews):
                    logger.info("[SCRAPER] Encountered existing reviews, stopping")
                    break
                
                page_num += 1
                # NO DELAYS between pages!
            
            scrape_end = time.time()
            logger.info(f"[SCRAPER] Scraping completed in {scrape_end - scrape_start:.2f}s")
            logger.info(f"[SCRAPER] Total new reviews: {total_new_reviews}")
            
            total_end = time.time()
            total_time = total_end - start_time
            logger.info(f"[SCRAPER] Complete operation finished in {total_time:.2f}s")
            
        except Exception as e:
            logger.error(f"[SCRAPER] Error: {e}")
            return 0
        finally:
            try:
                self.close_browser()
            except:
                pass
        
        return total_new_reviews

    def scrape_brand_reviews_improved(self, brand_name, max_pages=None, start_page=1, is_new_brand=False):
        """Improved scraping method with better pagination and expanded review handling"""
        with get_db_session() as db:
            brand_source = get_brand_source_url(db, brand_name)
            if brand_source and 'source_url' in brand_source:
                user_url = brand_source['source_url']
            else:
                logger.error(f"[ERROR] No Trustpilot URL found for brand '{brand_name}'. Aborting.")
                return 0
            
            # Fetch keywords for analysis
            brand_keywords = get_brand_keywords(db, brand_name)
            global_keywords = get_global_keywords(db)
            
        logger.info("Starting browser...")
        self.start_browser()
        logger.info("Browser started.")
        
        # Get total review count from Trustpilot for proper pagination
        total_trustpilot_reviews = self.get_total_reviews_count_from_trustpilot(brand_name)
        
        if total_trustpilot_reviews:
            # Calculate estimated pages needed
            estimated_pages = (total_trustpilot_reviews // 20) + 1
            logger.info(f"Trustpilot shows {total_trustpilot_reviews} total reviews. Estimated pages needed: {estimated_pages}")
            
            # For new brands, use the estimated pages as max_pages
            if is_new_brand and max_pages is None:
                max_pages = estimated_pages
                logger.info(f"New brand detected. Setting max_pages to {max_pages}")
        else:
            logger.warning("Could not get total review count from Trustpilot. Using default max_pages.")
        
        # Get initial count of existing reviews
        with get_db_session() as db:
            existing_reviews_count = db.query(Review).filter(Review.brand_name == brand_name).count()
            logger.info(f"Found {existing_reviews_count} existing reviews in database for '{brand_name}'")
        
        # For new brands, don't check for duplicates
        if is_new_brand:
            logger.info("New brand detected. Skipping duplicate checks.")
            existing_links = set()
        else:
            # Get existing review links for duplicate checking
            with get_db_session() as db:
                result = db.execute(text("SELECT review_link FROM reviews WHERE brand_name = :brand_name"), {"brand_name": brand_name})
                existing_links = {row[0] for row in result.fetchall() if row[0]}
        
        total_new_reviews = 0
        page_num = start_page
        consecutive_empty_pages = 0
        max_consecutive_empty = 3
        
        try:
            logger.info(f"Starting improved scraping for {'all pages' if max_pages is None else f'pages {start_page} to {max_pages}'}...")
            
            while True:
                if max_pages is not None and page_num > max_pages:
                    logger.info(f"Reached max_pages limit ({max_pages}). Stopping.")
                    break
                
                logger.info(f"\n=== PROCESSING PAGE {page_num} ===")
                page_url = self.get_trustpilot_url(brand_name, page_num)
                if not page_url:
                    logger.error(f"Could not get Trustpilot URL for {brand_name}")
                    break
                
                logger.info(f"Scraping URL: {page_url}")
                
                try:
                    # Use the improved scraping method that handles expanded reviews
                    page_reviews = self.scrape_page_with_expanded_reviews(page_url)
                except Exception as e:
                    logger.error(f"Error accessing {page_url}: {e}")
                    page_reviews = []
                
                if not page_reviews:
                    consecutive_empty_pages += 1
                    logger.warning(f"No reviews found on page {page_num}. Consecutive empty pages: {consecutive_empty_pages}")
                    if consecutive_empty_pages >= max_consecutive_empty:
                        logger.warning(f"Stopping: {consecutive_empty_pages} consecutive empty pages reached.")
                        break
                    page_num += 1
                    continue
                
                consecutive_empty_pages = 0
                logger.info(f"Found {len(page_reviews)} reviews on page {page_num}")
                
                # Filter out existing reviews (skip for new brands)
                if is_new_brand:
                    newly_found_on_page = page_reviews
                    logger.info(f"New brand: Processing all {len(newly_found_on_page)} reviews on page {page_num}")
                else:
                    newly_found_on_page = [r for r in page_reviews if r['review_link'] not in existing_links]
                logger.info(f"Found {len(newly_found_on_page)} new reviews on page {page_num}")
                
                if newly_found_on_page:
                    # Process and insert reviews immediately for this page
                    page_new_reviews = 0
                    logger.info(f"Processing {len(newly_found_on_page)} reviews on page {page_num}...")
                    
                    with get_db_session() as db:
                        for i, review_data in enumerate(newly_found_on_page, 1):
                            try:
                                review_text = review_data['review']
                                logger.info(f"Processing review {i}/{len(newly_found_on_page)} on page {page_num}")
                                
                                # Sentiment analysis (ultra-fast, minimal logging)
                                analysis = self.sentiment_analyzer.process_review(review_text)
                                if analysis['sentiment_score'] is None:
                                    continue
                                valid_categories = {'positive', 'negative', 'neutral'}
                                if analysis['sentiment_category'] not in valid_categories:
                                    continue
                                
                                date_val = review_data.get('date')
                                if not date_val or not isinstance(date_val, str) or len(date_val) < 10:
                                    continue
                                import re
                                if not re.match(r"^\d{4}-\d{2}-\d{2}$", date_val[:10]):
                                    continue
                                
                                # Keyword/Category Tagging (ultra-fast, minimal logging)
                                try:
                                    from nltk.stem import WordNetLemmatizer
                                    from nltk.tokenize import word_tokenize
                                    import nltk
                                    
                                    try:
                                        nltk.download('punkt', quiet=True)
                                        nltk.download('wordnet', quiet=True)
                                        nltk.download('omw-1.4', quiet=True)
                                    except Exception as download_error:
                                        logger.warning(f"NLTK download warning: {download_error}")
                                    
                                    try:
                                        nltk.data.find('tokenizers/punkt')
                                        nltk.data.find('corpora/wordnet')
                                    except LookupError:
                                        logger.warning("NLTK data not accessible, will use fallback method")
                                        raise Exception("NLTK data not accessible")
                                    
                                    lemmatizer = WordNetLemmatizer()
                                    
                                    review_text_clean = review_text.lower().strip()
                                    review_tokens = word_tokenize(review_text_clean)
                                    review_lemmas = [lemmatizer.lemmatize(token) for token in review_tokens]
                                    review_lemmas_set = set(review_lemmas)
                                    
                                    review_words = set(review_text_clean.split())
                                    
                                    def keyword_in_text(keyword, review_text, review_lemmas_set, lemmatizer):
                                        keyword_clean = keyword.lower().strip()
                                        
                                        if ' ' not in keyword_clean:
                                            keyword_lemma = lemmatizer.lemmatize(keyword_clean)
                                            match = keyword_lemma in review_lemmas_set
                                            return match
                                        
                                        keyword_words = keyword_clean.split()
                                        phrase_lemmas = [lemmatizer.lemmatize(word) for word in keyword_words]
                                        
                                        all_words_present = all(lemma in review_lemmas_set for lemma in phrase_lemmas)
                                        phrase_in_text = keyword_clean in review_text_clean
                                        
                                        match = all_words_present and phrase_in_text
                                        return match
                                        
                                except Exception as nltk_error:
                                    logger.warning(f"NLTK lemmatization failed, using simple keyword matching: {nltk_error}")
                                    
                                    review_text_clean = review_text.lower().strip()
                                    review_words = set(review_text_clean.split())
                                    
                                    def keyword_in_text(keyword, review_text, review_lemmas_set, lemmatizer):
                                        keyword_clean = keyword.lower().strip()
                                        return keyword_clean in review_text_clean
                                    
                                    review_lemmas_set = review_words
                                    lemmatizer = None
                                
                                matched_categories = set()
                                matched_keywords = set()
                                
                                # Brand-specific categories
                                for category, keywords in brand_keywords.items():
                                    for kw in keywords:
                                        try:
                                            if keyword_in_text(kw, review_text_clean, review_lemmas_set, lemmatizer):
                                                matched_categories.add(category)
                                                matched_keywords.add(kw)
                                        except Exception as kw_error:
                                            logger.warning(f"Keyword matching error for '{kw}': {kw_error}")
                                            continue
                                
                                # Global categories
                                for category, keywords in global_keywords.items():
                                    for kw in keywords:
                                        try:
                                            if keyword_in_text(kw, review_text_clean, review_lemmas_set, lemmatizer):
                                                matched_categories.add(category)
                                                matched_keywords.add(kw)
                                        except Exception as kw_error:
                                            logger.warning(f"Keyword matching error for '{kw}': {kw_error}")
                                            continue
                                
                                categories_json = json.dumps(sorted(matched_categories))
                                matched_keywords_json = json.dumps(sorted(matched_keywords))
                                
                                # Insert the review
                                logger.info(f"  Review {i}: Inserting into database...")
                                import sqlite3
                                try:
                                    db.execute(
                                        text("INSERT INTO reviews (id, brand_name, customer_name, review, rating, date, review_link, sentiment_score, sentiment_category, categories, matched_keywords) VALUES (DEFAULT, :brand_name, :customer_name, :review, :rating, :date, :review_link, :sentiment_score, :sentiment_category, :categories, :matched_keywords)"),
                                        {
                                            "brand_name": brand_name,
                                            "customer_name": review_data['customer_name'],
                                            "review": review_data['review'],
                                            "rating": review_data['rating'],
                                            "date": review_data['date'],
                                            "review_link": review_data['review_link'],
                                            "sentiment_score": analysis['sentiment_score'],
                                            "sentiment_category": analysis['sentiment_category'],
                                            "categories": categories_json,
                                            "matched_keywords": matched_keywords_json
                                        }
                                    )
                                except Exception as e:
                                    if "DEFAULT" in str(e) or "syntax error" in str(e):
                                        try:
                                            db.execute(
                                                text("INSERT INTO reviews (brand_name, customer_name, review, rating, date, review_link, sentiment_score, sentiment_category, categories, matched_keywords) VALUES (:brand_name, :customer_name, :review, :rating, :date, :review_link, :sentiment_score, :sentiment_category, :categories, :matched_keywords)"),
                                                {
                                                    "brand_name": brand_name,
                                                    "customer_name": review_data['customer_name'],
                                                    "review": review_data['review'],
                                                    "rating": review_data['rating'],
                                                    "date": review_data['date'],
                                                    "review_link": review_data['review_link'],
                                                    "sentiment_score": analysis['sentiment_score'],
                                                    "sentiment_category": analysis['sentiment_category'],
                                                    "categories": categories_json,
                                                    "matched_keywords": matched_keywords_json
                                                }
                                            )
                                        except Exception as fallback_error:
                                            logger.error(f"[ERROR] Fallback INSERT also failed: {fallback_error}")
                                            continue
                                    else:
                                        raise e
                                
                                page_new_reviews += 1
                                logger.info(f"  Review {i}: ✅ Completed successfully")
                                
                            except Exception as e:
                                logger.error(f"[ERROR] Failed to process review {i}: {e}")
                                continue
                        
                        # Commit all reviews for this page
                        db.commit()
                        logger.info(f"[SUCCESS] Page {page_num}: Inserted {page_new_reviews} new reviews to database")
                        logger.info(f"✅ Page {page_num} completed successfully!")
                        total_new_reviews += page_new_reviews
                else:
                    logger.info(f"✓ Page {page_num}: No new reviews found")
                
                # For new brands, continue until we've processed all estimated pages
                if is_new_brand:
                    if page_num >= estimated_pages:
                        logger.info(f"[SCRAPER] Reached estimated pages ({estimated_pages}) for new brand. Stopping.")
                        break
                else:
                    # For existing brands, check if we're hitting duplicates
                    if len(newly_found_on_page) < len(page_reviews):
                        logger.info("[SCRAPER] Encountered previously saved reviews. Stopping.")
                        break
                
                logger.info(f"[SCRAPER] Page {page_num} completed. Total new reviews: {total_new_reviews}")
                page_num += 1
            
            logger.info("Finished improved scraping loop.")
        finally:
            try:
                self.close_browser()
            except Exception as e:
                logger.error(f"Error closing browser: {e}")
            pass
        
        logger.info(f"[COMPLETE] Improved scraping complete! Total new reviews saved: {total_new_reviews}")
        return total_new_reviews

    def scrape_page_with_expanded_reviews(self, url):
        """Scrapes a single page of reviews, handling expanded reviews from same customer"""
        try:
            if self.page is None:
                raise Exception("Page is not initialized")
            
            self.page.goto(url, wait_until='domcontentloaded', timeout=30000)
            
            # Wait for review cards to load
            try:
                self.page.wait_for_selector('article', timeout=10000)
            except:
                pass
                    
            # Get all review cards
            review_cards = self.page.query_selector_all('article')
            logger.info(f"Found {len(review_cards)} initial review cards")
            
            # Process each card and handle expanded reviews
            all_reviews = []
            for card in review_cards:
                # Handle expanded reviews for this card
                expanded_cards = self.handle_expanded_reviews(card)
                
                                                # Process each review (original + expanded)
                for review_card in expanded_cards:
                    try:
                        # Use the same extraction logic as the original scrape_page method
                        name_elem = review_card.query_selector('[data-consumer-name-typography]')
                        if not name_elem:
                            name_elem = review_card.query_selector('[data-consumer-name]')
                        
                        date_text = None
                        date_selectors = [
                            '[data-review-date]',
                            'time',
                            'span[class*="date"]',
                            '[data-service-review-date]'
                        ]
                        
                        for selector in date_selectors:
                            try:
                                date_elem = review_card.query_selector(selector)
                                if date_elem:
                                    date_attr = date_elem.get_attribute('data-review-date') or date_elem.get_attribute('datetime') or date_elem.get_attribute('data-service-review-date') or date_elem.text_content()
                                    if date_attr:
                                        parsed_date = parse_date_flexibly(date_attr.strip())
                                        if parsed_date:
                                            date_text = parsed_date.strftime("%Y-%m-%d")
                                            break
                            except Exception as e:
                                continue
                        
                        if not name_elem or not date_text:
                            continue

                        # Rating extraction
                        star_rating = None
                        rating_elem = review_card.query_selector('[data-service-review-rating]')
                        if rating_elem:
                            rating_attr = rating_elem.get_attribute('data-service-review-rating')
                            if rating_attr and rating_attr.isdigit():
                                star_rating = int(rating_attr)
                        
                        if not star_rating:
                            rating_img = review_card.query_selector('img[alt*="Rated"]')
                            if rating_img:
                                alt_text = rating_img.get_attribute('alt')
                                if alt_text:
                                    match = re.search(r'Rated (\d) out of 5 stars', alt_text)
                                    if match:
                                        star_rating = int(match.group(1))

                        # Title and body extraction
                        title_elem = review_card.query_selector('[data-review-title-typography]')
                        if not title_elem:
                            title_elem = review_card.query_selector('h2, h3, [data-review-title]')
                        
                        body_elem = review_card.query_selector('[data-service-review-text-typography]')
                        if not body_elem:
                            body_elem = review_card.query_selector('p')
                        
                        # Review link extraction (same logic as original)
                        review_link = None
                        title_link = review_card.query_selector('[data-review-title-typography]')
                        if title_link:
                            if title_link.evaluate('el => el.tagName === "A"'):
                                href = title_link.get_attribute('href')
                                if href and '/reviews/' in href:
                                    if href.startswith('/'):
                                        review_link = f"https://uk.trustpilot.com{href}"
                                    elif href.startswith('http'):
                                        review_link = href
                                    else:
                                        review_link = f"https://uk.trustpilot.com/{href}"
                        
                        if not review_link:
                            all_links = review_card.query_selector_all('a[href*="/reviews/"]')
                            for link in all_links:
                                href = link.get_attribute('href')
                                if href and '/reviews/' in href:
                                    if href.startswith('/'):
                                        review_link = f"https://uk.trustpilot.com{href}"
                                    elif href.startswith('http'):
                                        review_link = href
                                    else:
                                        review_link = f"https://uk.trustpilot.com/{href}"
                            break
                
                        if not review_link:
                            continue
                        
                        # Extract text content
                        customer_name = name_elem.text_content().strip() if name_elem else ''
                        title_text = title_elem.text_content().strip() if title_elem else ''
                        body_text = body_elem.text_content().strip() if body_elem else ''
                        
                        all_reviews.append({
                            'customer_name': customer_name,
                            'review': body_text,
                            'rating': star_rating,
                            'date': date_text,
                            'review_link': review_link
                        })
                        
                    except Exception as e:
                        logger.warning(f"Error processing expanded review: {e}")
                        continue
                    
            logger.info(f"Total reviews extracted (including expanded): {len(all_reviews)}")
            return all_reviews
            
        except Exception as e:
            logger.error(f"Error scraping page {url}: {e}")
            return []

    def handle_expanded_reviews(self, card):
        """Handle 'See more reviews by [Customer]' buttons to expand additional reviews"""
        try:
            # Look for the "See X more review by [Customer]" button
            # From the image, this is a button with name="review-stack-show"
            expand_button = card.query_selector('button[name="review-stack-show"]')
            
            if expand_button:
                button_text = expand_button.text_content()
                logger.info(f"Found expand button: {button_text}")
                
                # Click the button to expand additional reviews
                expand_button.click()
                
                # Wait a moment for the additional reviews to load
                import time
                time.sleep(1)
                
                # Now look for additional review cards that were expanded
                # These should be additional article elements within the same card
                additional_reviews = card.query_selector_all('article')
                
                if len(additional_reviews) > 1:
                    logger.info(f"Expanded {len(additional_reviews) - 1} additional reviews")
                    return additional_reviews
                else:
                    logger.info("No additional reviews found after expansion")
                    return [card]
            else:
                return [card]
                            
        except Exception as e:
            logger.warning(f"Error handling expanded reviews: {e}")
            return [card]

    def get_total_reviews_count(self, page):
        """Get total number of reviews for a brand"""
        try:
            # Look for total reviews count in various selectors
            selectors = [
                '[data-service-review-count]',
                '[data-testid="reviews-count"]',
                '.reviews-count',
                '.business-profile-header_reviews-count__'
            ]
            
            for selector in selectors:
                try:
                    count_elem = page.query_selector(selector)
                    if count_elem:
                        count_text = count_elem.text_content()
                        if count_text:
                            # Extract number from text like "1,234 reviews" or "1,234"
                            import re
                            numbers = re.findall(r'[\d,]+', count_text)
                            if numbers:
                                count = int(numbers[0].replace(',', ''))
                                return count
                except:
                    continue
            
            # Fallback: count visible review cards
            review_cards = page.query_selector_all('article')
            if review_cards:
                return len(review_cards)
            
            return 0
            
        except Exception as e:
            logger.warning(f"Could not get total reviews count: {e}")
            return 0

    def get_total_reviews_count_from_trustpilot(self, brand_name):
        """Extract total number of reviews from Trustpilot page using the selectors from the image"""
        try:
            # Get the base URL for the brand
            base_url = self.get_trustpilot_source_url(brand_name)
            if not base_url:
                logger.error(f"Could not get Trustpilot URL for {brand_name}")
                return None
            
            # Navigate to the main Trustpilot page
            self.page.goto(base_url, wait_until='domcontentloaded', timeout=30000)
            
            # Wait for the page to load
            try:
                self.page.wait_for_selector('h1', timeout=10000)
            except:
                pass
            
            # Extract total reviews count using the selectors from the image
            # The image shows the count is in a span within h1 with class containing "reviewsAndRating"
            selectors = [
                'h1 span[class*="reviewsAndRating"]',  # From the image: styles_reviewsAndRating_OIRXy
                'h1 span[class*="clickable"] span',    # Alternative path from image
                '[data-testid="reviews-count"]',
                '.business-profile-header_reviews-count__',
                'span[class*="reviews"]',
                'h1 span:contains("reviews")'
            ]
            
            for selector in selectors:
                try:
                    count_elem = self.page.query_selector(selector)
                    if count_elem:
                        count_text = count_elem.text_content()
                        if count_text:
                            logger.info(f"Found review count text: '{count_text}' with selector: {selector}")
                            # Extract number from text like "Reviews 445" or "445 reviews" or "445"
                            import re
                            numbers = re.findall(r'[\d,]+', count_text)
                            if numbers:
                                count = int(numbers[0].replace(',', ''))
                                logger.info(f"Extracted total review count: {count}")
                                return count
                except Exception as e:
                    logger.debug(f"Selector {selector} failed: {e}")
                    continue
            
            # Fallback: try to find any text containing numbers and "review"
            try:
                page_text = self.page.text_content()
                import re
                # Look for patterns like "445 reviews", "Reviews 445", etc.
                patterns = [
                    r'(\d{1,3}(?:,\d{3})*)\s*reviews?',
                    r'reviews?\s*(\d{1,3}(?:,\d{3})*)',
                    r'(\d{1,3}(?:,\d{3})*)\s*Reviews?'
                ]
                
                for pattern in patterns:
                    matches = re.findall(pattern, page_text, re.IGNORECASE)
                    if matches:
                        count = int(matches[0].replace(',', ''))
                        logger.info(f"Extracted total review count using pattern '{pattern}': {count}")
                        return count
            except Exception as e:
                logger.debug(f"Pattern matching failed: {e}")
            
            logger.warning(f"Could not extract total review count for {brand_name}")
            return None
            
        except Exception as e:
            logger.error(f"Error getting total reviews count for {brand_name}: {e}")
            return None

    def fetch_logo_with_existing_browser(self, trustpilot_url, brand_name):
        """Fetch logo using the existing browser instance to avoid async conflicts."""
        logger.info(f"[LOGO] Fetching logo for brand: {brand_name} using existing browser")
        try:
            import base64
            
            # Navigate to the brand page
            self.page.goto(trustpilot_url, wait_until="domcontentloaded", timeout=30000)
            
            # Use the specific selector for Trustpilot business profile logo
            logo_elem = self.page.query_selector('img.business-profile-image_image__V14jr')
            if not logo_elem:
                logger.warning("[LOGO] Specific selector failed. Trying alternative selectors...")
                # Try alternative selectors
                logo_elem = self.page.query_selector('img[alt*="logo"], img[alt*="Logo"], img[alt*="brand"]')
                if not logo_elem:
                    logger.warning("[LOGO] No logo found with any selector.")
                    return False
            
            logo_url = logo_elem.get_attribute("src")
            if not logo_url:
                logger.warning("[LOGO] Logo src not found.")
                return False
            
            logger.info(f"[LOGO] Found logo URL: {logo_url}")
            resp = requests.get(logo_url)
            resp.raise_for_status()  # Raise exception for bad status codes
            
            # Determine file extension and MIME type
            ext = logo_url.split('.')[-1].split('?')[0].lower()
            if ext not in ['jpg', 'jpeg', 'png', 'gif']:
                ext = 'jpg'  # Default to jpg
            
            mime_type = f"image/{ext}" if ext != 'jpeg' else "image/jpeg"
            
            # Convert to base64 for database storage
            logo_base64 = f"data:{mime_type};base64,{base64.b64encode(resp.content).decode('utf-8')}"
            
            # Generate filename for database storage
            filename = f"{brand_name}-logo.{ext}"
            
            # Save to database only
            try:
                with get_db_session() as db:
                    success = update_brand_logo(db, brand_name, logo_base64, filename, mime_type)
                    if success:
                        logger.info(f"[LOGO] Successfully saved logo to database for {brand_name}")
                        return True
                    else:
                        logger.warning(f"[LOGO] Failed to save logo to database for {brand_name}")
                        return False
            except Exception as db_error:
                logger.error(f"[LOGO] Database error: {db_error}")
                return False
            
        except Exception as e:
            logger.error(f"[LOGO] ERROR: {e}")
            return False

def fetch_trustpilot_logo(trustpilot_url, brand_name):
    """Fetch logo from Trustpilot and save to database only."""
    logger.info(f"[LOGO] Fetching logo for brand: {brand_name} from {trustpilot_url}")
    try:
        from playwright.sync_api import sync_playwright
        import base64
        
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(trustpilot_url, wait_until="domcontentloaded", timeout=30000)
            
            # Use the specific selector for Trustpilot business profile logo
            logo_elem = page.query_selector('img.business-profile-image_image__V14jr')
            if not logo_elem:
                logger.warning("[LOGO] Specific selector failed. Trying alternative selectors...")
                # Try alternative selectors
                logo_elem = page.query_selector('img[alt*="logo"], img[alt*="Logo"], img[alt*="brand"]')
                if not logo_elem:
                    logger.warning("[LOGO] No logo found with any selector.")
                    browser.close()
                    return False
            
            logo_url = logo_elem.get_attribute("src")
            if not logo_url:
                logger.warning("[LOGO] Logo src not found.")
                browser.close()
                return False
            
            logger.info(f"[LOGO] Found logo URL: {logo_url}")
            resp = requests.get(logo_url)
            resp.raise_for_status()  # Raise exception for bad status codes
            
            # Determine file extension and MIME type
            ext = logo_url.split('.')[-1].split('?')[0].lower()
            if ext not in ['jpg', 'jpeg', 'png', 'gif']:
                ext = 'jpg'  # Default to jpg
            
            mime_type = f"image/{ext}" if ext != 'jpeg' else "image/jpeg"
            
            # Convert to base64 for database storage
            logo_base64 = f"data:{mime_type};base64,{base64.b64encode(resp.content).decode('utf-8')}"
            
            # Generate filename for database storage
            filename = f"{brand_name}-logo.{ext}"
            
            # Save to database only
            try:
                with get_db_session() as db:
                    success = update_brand_logo(db, brand_name, logo_base64, filename, mime_type)
                    if success:
                        logger.info(f"[LOGO] Successfully saved logo to database for {brand_name}")
                        browser.close()
                        return True
                    else:
                        logger.warning(f"[LOGO] Failed to save logo to database for {brand_name}")
                        browser.close()
                        return False
            except Exception as db_error:
                logger.error(f"[LOGO] Database error: {db_error}")
                browser.close()
                return False
            
    except Exception as e:
        logger.error(f"[LOGO] ERROR: {e}")
        return False

def main():
    """Main function to run the scraper."""
    if len(sys.argv) < 2:
        print("Usage: python trustpilot_scraper.py <brand_name> [max_pages]")
        sys.exit(1)
    
    # Initialize the database and create tables if they don't exist
    init_db()
    
    brand_name = sys.argv[1]
    max_pages = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    
    print(f"Starting Trustpilot scraper for brand: {brand_name}")
    scraper = TrustpilotScraper(headless=True)
    new_reviews_count = scraper.scrape_brand_reviews(brand_name, max_pages)
    print(f"Scraping complete. Found {new_reviews_count} new reviews.")

if __name__ == "__main__":
    main() 