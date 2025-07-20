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
from nltk.stem import WordNetLemmatizer
from nltk.tokenize import word_tokenize
import nltk
import logging
logger = logging.getLogger(__name__)

# Import our new database modules
from database import get_db_session, init_db, Review
from sentiment_analyzer import SentimentAnalyzer
from sqlalchemy import text
# REMOVED: from utils import canonical_brand_id

# Add this helper function at the top-level (after imports, before TrustpilotScraper)
def parse_date_flexibly(date_str):
    """Try multiple date formats and return a datetime object or None if all fail."""
    formats = [
        '%B %d, %Y',   # July 07, 2025
        '%d %b %Y',    # 07 Jul 2025
        '%d %B %Y',    # 07 July 2025
        '%b %d, %Y',   # Jul 07, 2025
        '%d.%m.%Y',    # 07.07.2025
        '%Y-%m-%d',    # 2025-07-07
    ]
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt)
        except Exception:
            continue
    return None

class TrustpilotScraper:
    def __init__(self, headless: bool = True):
        self.headless = headless
        self.playwright = None
        self.browser: Browser | None = None
        self.page: Page | None = None
        self.sentiment_analyzer = SentimentAnalyzer()
        # Initialize lemmatizer once for the entire scraper instance
        try:
            nltk.data.find('corpora/wordnet')
        except LookupError:
            nltk.download('wordnet')
        try:
            nltk.data.find('tokenizers/punkt')
        except LookupError:
            nltk.download('punkt')
        self.lemmatizer = WordNetLemmatizer()
        
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
            self.page.goto(url, wait_until='networkidle', timeout=60000)
            review_cards = self.page.query_selector_all('article')
            
            page_reviews = []
            for card in review_cards:
                name_elem = card.query_selector('[data-consumer-name-typography]')
                date_text = None
                for p_tag in card.query_selector_all('p'):
                    p_content = p_tag.text_content()
                    if p_content and "Date of experience:" in p_content:
                        raw_date = p_content.replace("Date of experience:", "").strip()
                        # Use flexible date parsing
                        parsed_date = parse_date_flexibly(raw_date)
                        if parsed_date:
                            date_text = parsed_date.strftime("%Y-%m-%d")
                        else:
                            print(f"[ERROR] Could not parse date '{raw_date}' for review: {p_content[:100]}")
                            date_text = None
                        break
                
                if not name_elem or not date_text:
                    continue

                rating_img = card.query_selector('img[alt*="Rated"]')
                star_rating = None
                if rating_img:
                    alt_text = rating_img.get_attribute('alt')
                    if alt_text:
                        match = re.search(r'Rated (\d) out of 5 stars', alt_text)
                        if match:
                            star_rating = int(match.group(1))

                title_elem = card.query_selector('h2')
                body_elem = card.query_selector('p')
                
                # Extract review link - find individual review links in review titles
                review_link = None
                
                # Look for review links in the review content area
                review_content = card.query_selector('.styles_reviewContent__tuXiN')
                if review_content:
                    # Find links within the review content
                    link_elem = review_content.query_selector('.link_internal__Eam_b')
                    if link_elem:
                        href = link_elem.get_attribute('href')
                        if href:
                            if href.startswith('/'):
                                review_link = f"https://uk.trustpilot.com{href}"
                            elif href.startswith('http'):
                                review_link = href
                            else:
                                review_link = f"https://uk.trustpilot.com/{href}"
                
                # Fallback: if no individual link found, use the page URL
                if not review_link:
                    review_link = url
                
                title_text = ''
                if title_elem and title_elem.text_content():
                    title_raw = title_elem.text_content()
                    title_text = title_raw.strip() if title_raw is not None else ''
                body_text = ''
                if body_elem and body_elem.text_content():
                    body_raw = body_elem.text_content()
                    body_text = body_raw.strip() if body_raw is not None else ''
                customer_name = ''
                if name_elem and name_elem.text_content():
                    name_raw = name_elem.text_content()
                    customer_name = name_raw.strip() if name_raw is not None else ''
                page_reviews.append({
                    'customer_name': customer_name,
                    'review': body_text,
                    'rating': star_rating,
                    'date': date_text,
                    'review_link': review_link
                })
            return page_reviews
        except Exception as e:
            print(f"Error scraping page {url}: {e}")
            return []

    def get_trustpilot_url(self, brand_name, page_num):
        # Only use the source URL from the DB, do not guess or canonicalize.
        from database import get_brand_source_url, get_db_session
        with get_db_session() as db:
            brand_source = get_brand_source_url(db, brand_name)
            if brand_source and 'source_url' in brand_source:
                return [f"{brand_source['source_url']}?page={page_num}"]
            else:
                print(f"[ERROR] No Trustpilot URL found for brand '{brand_name}'. Aborting.")
                return []

    def get_trustpilot_source_url(self, brand_name):
        # Only use the source URL from the DB, do not guess or canonicalize.
        from database import get_brand_source_url, get_db_session
        with get_db_session() as db:
            brand_source = get_brand_source_url(db, brand_name)
            if brand_source and 'source_url' in brand_source:
                return brand_source['source_url']
            else:
                print(f"[ERROR] No Trustpilot URL found for brand '{brand_name}'. Aborting.")
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
        print(f"[BRANDNAME] Extracting brand name from: {trustpilot_url}")
        from playwright.sync_api import sync_playwright
        import re
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            try:
                page.goto(trustpilot_url, wait_until="networkidle", timeout=60000)
                # Use robust selector for Trustpilot brand name
                brand_elem = page.query_selector("span[class*='title_title_displayName']")
                if brand_elem:
                    brand_name_raw = brand_elem.text_content()
                    if brand_name_raw:
                        brand_name = brand_name_raw.strip()
                        print(f"[BRANDNAME] Found brand name (span): {brand_name}")
                        browser.close()
                        return brand_name
                # Fallback: try the main <h1> selector
                h1_elem = page.query_selector('h1')
                if h1_elem:
                    h1_text = h1_elem.text_content()
                    if h1_text:
                        brand_name = re.sub(r"Reviews.*", "", h1_text).strip()
                        print(f"[BRANDNAME] Found brand name (h1): {brand_name}")
                        browser.close()
                        return brand_name
                # Fallback: try a more specific selector if needed
                h1_alt = page.query_selector('h1[data-business-unit-title-typography]')
                if h1_alt:
                    h1_alt_text = h1_alt.text_content()
                    if h1_alt_text:
                        brand_name = re.sub(r"Reviews.*", "", h1_alt_text).strip()
                        print(f"[BRANDNAME] Found brand name (alt): {brand_name}")
                        browser.close()
                        return brand_name
                print("[BRANDNAME] Brand name not found on page.")
                browser.close()
                return None
            except Exception as e:
                print(f"[BRANDNAME] Error extracting brand name: {e}")
                browser.close()
                return None

    def scrape_brand_reviews(self, brand_name, max_pages=50, start_page=1, cancel_event=None):
        """Scrapes reviews for a brand, using ONLY the user-provided Trustpilot URL from the DB. No guessing."""
        from database import get_brand_source_url, get_db_session, Review, get_brand_keywords, get_global_keywords
        import json
        print(f"[DEBUG] brand_name passed to scraper: '{brand_name}'")
        # NLTK resources already initialized in __init__
        
        # Get database session and fetch initial data
        with get_db_session() as db:
            brand_source = get_brand_source_url(db, brand_name)
            print(f"[DEBUG] brand_source_url lookup result: {brand_source}")
            if brand_source and brand_source.get('source_url'):
                user_url = brand_source['source_url']
            else:
                print(f"[ERROR] No Trustpilot URL found for brand '{brand_name}'. Aborting.")
                return 0
            
            # Fetch all brand and global keywords for category tagging
            brand_keywords = get_brand_keywords(db, brand_name)
            global_keywords = get_global_keywords(db)
            # Parse keywords from JSON strings to lists
            for category, keywords_json in global_keywords.items():
                if isinstance(keywords_json, str):
                    global_keywords[category] = json.loads(keywords_json)
            for category, keywords_json in brand_keywords.items():
                if isinstance(keywords_json, str):
                    brand_keywords[category] = json.loads(keywords_json)
            
            # Debug: Check if keywords are loaded
            print(f"[DEBUG] Global keywords loaded: {len(global_keywords)} categories")
            for cat, keywords in global_keywords.items():
                print(f"[DEBUG] Category '{cat}': {len(keywords)} keywords")
            print(f"[DEBUG] Brand keywords loaded: {len(brand_keywords)} categories")
            

        
        print("Starting browser...")
        self.start_browser()
        print("Browser started.")
        
        # Get initial count of existing reviews
        with get_db_session() as db:
            existing_reviews_count = db.query(Review).filter(Review.brand_name == brand_name).count()
            print(f"Found {existing_reviews_count} existing reviews in database for '{brand_name}'")
        
        total_new_reviews = 0
        page_num = start_page
        consecutive_empty_pages = 0
        max_consecutive_empty = 3  # Stop after 3 consecutive empty pages
        
        try:
            print(f"Starting to scrape {'all pages' if max_pages is None else f'pages {start_page} to {max_pages}'}...")
            consecutive_empty_pages = 0
            
            while True:
                if cancel_event is not None and cancel_event.is_set():
                    print(f"[CANCEL] Scraper stopped by cancel button for brand: {brand_name}")
                    break
                if max_pages is not None and page_num > max_pages:
                    print(f"Reached max_pages limit ({max_pages}). Stopping.")
                    break
                
                print(f"\n=== PROCESSING PAGE {page_num} ===")
                page_url = f"{user_url.split('?')[0]}?page={page_num}"
                print(f"Scraping URL: {page_url}")
                
                try:
                    page_reviews = self.scrape_page(page_url)
                except Exception as e:
                    print(f"Error accessing {page_url}: {e}")
                    page_reviews = []
                
                if not page_reviews:
                    consecutive_empty_pages += 1
                    print(f"No reviews found on page {page_num}. Consecutive empty pages: {consecutive_empty_pages}")
                    if consecutive_empty_pages >= max_consecutive_empty:
                        print(f"Stopping: {consecutive_empty_pages} consecutive empty pages reached.")
                        break
                    page_num += 1
                    time.sleep(random.uniform(3, 7))
                    continue
                
                consecutive_empty_pages = 0
                print(f"Found {len(page_reviews)} reviews on page {page_num}")
                
                # Get existing review links for this page - use separate session to avoid locks
                existing_links = set()
                try:
                    with get_db_session() as db:
                        result = db.execute(text("SELECT review_link FROM reviews WHERE brand_name = :brand_name"), {"brand_name": brand_name})
                        existing_links = {row[0] for row in result.fetchall() if row[0]}
                except Exception as e:
                    print(f"Error getting existing links: {e}")
                    continue
                
                newly_found_on_page = [
                    r for r in page_reviews if r['review_link'] not in existing_links
                ]
                
                print(f"Found {len(newly_found_on_page)} new reviews on page {page_num}")
                
                if newly_found_on_page:
                    # Process and insert reviews in smaller batches to avoid long locks
                    page_new_reviews = 0
                    batch_size = 5  # Process 5 reviews at a time
                    
                    for i in range(0, len(newly_found_on_page), batch_size):
                        batch = newly_found_on_page[i:i + batch_size]
                        batch_new_reviews = 0
                        
                        try:
                            with get_db_session() as db:
                                for review in batch:
                                    try:
                                        review_text = review.get('review', '')
                                        
                                        # Sentiment analysis
                                        sentiment = self.sentiment_analyzer.process_review(review_text)
                                        review['sentiment_score'] = sentiment['sentiment_score']
                                        review['sentiment_category'] = sentiment['sentiment_category']
                                        
                                        matched_categories = set()
                                        matched_keywords = set()
                                        
                                        # Clean and lemmatize review text
                                        review_text_clean = review_text.lower().strip()
                                        review_tokens = word_tokenize(review_text_clean)
                                        review_lemmas = [self.lemmatizer.lemmatize(token) for token in review_tokens]
                                        review_lemmas_set = set(review_lemmas)
                                        
                                        def keyword_in_text(keyword, review_text, review_lemmas_set):
                                            """
                                            Check if a keyword is present in the review text.
                                            Handles both single words and phrases with proper lemmatization.
                                            """
                                            keyword_clean = keyword.lower().strip()
                                            
                                            # For single words: check if lemmatized form exists in review lemmas
                                            if ' ' not in keyword_clean:
                                                keyword_lemma = self.lemmatizer.lemmatize(keyword_clean)
                                                match = keyword_lemma in review_lemmas_set
                                                return match
                                            
                                            # For phrases: check if all words in phrase exist in review (lemmatized)
                                            phrase_tokens = word_tokenize(keyword_clean)
                                            phrase_lemmas = [self.lemmatizer.lemmatize(token) for token in phrase_tokens]
                                            
                                            # Check if all lemmatized words in the phrase exist in the review
                                            all_words_present = all(lemma in review_lemmas_set for lemma in phrase_lemmas)
                                            
                                            # Additional check: ensure the phrase appears in the original text (case-insensitive)
                                            phrase_in_text = keyword_clean in review_text
                                            
                                            match = all_words_present and phrase_in_text
                                            return match
                                        
                                        # Brand-specific categories
                                        for category, keywords in brand_keywords.items():
                                            for kw in keywords:
                                                if keyword_in_text(kw, review_text_clean, review_lemmas_set):
                                                    matched_categories.add(category)
                                                    matched_keywords.add(kw)
                                        
                                        # Global categories
                                        for category, keywords in global_keywords.items():
                                            for kw in keywords:
                                                if keyword_in_text(kw, review_text_clean, review_lemmas_set):
                                                    matched_categories.add(category)
                                                    matched_keywords.add(kw)
                                        
                                        # Store category names and matched keywords
                                        review['categories'] = json.dumps(sorted(matched_categories))
                                        review['matched_keywords'] = json.dumps(sorted(matched_keywords))
                                        
                                        # Debug: Log if any keywords were matched
                                        if matched_categories or matched_keywords:
                                            print(f"[DEBUG] Matched categories: {matched_categories}, keywords: {matched_keywords}")
                                        

                                        review['brand_name'] = brand_name
                                        
                                        # Create and insert the review immediately
                                        new_review = Review(
                                            brand_name=review.get('brand_name'),
                                            customer_name=review.get('customer_name'),
                                            review=review.get('review'),
                                            rating=review.get('rating'),
                                            date=review.get('date'),
                                            review_link=review.get('review_link'),
                                            sentiment_score=review.get('sentiment_score'),
                                            sentiment_category=review.get('sentiment_category'),
                                            categories=review.get('categories', ''),
                                            matched_keywords=review.get('matched_keywords', '')
                                        )
                                        db.add(new_review)
                                        batch_new_reviews += 1
                                        
                                    except Exception as e:
                                        print(f"[ERROR] Failed to process review: {e}")
                                        continue
                                
                                # Commit batch immediately to release lock
                                db.commit()
                                print(f"✓ Batch {i//batch_size + 1}: Inserted {batch_new_reviews} reviews")
                                page_new_reviews += batch_new_reviews
                                
                        except Exception as e:
                            print(f"[ERROR] Failed to process batch: {e}")
                            continue
                        
                        # Small delay between batches to reduce database contention
                        time.sleep(0.1)
                    
                    print(f"✓ Page {page_num}: Inserted {page_new_reviews} new reviews to database")
                    total_new_reviews += page_new_reviews
                else:
                    print(f"✓ Page {page_num}: No new reviews found")
                
                if len(newly_found_on_page) < len(page_reviews):
                    print("Encountered previously saved reviews. Likely reached the end of new content.")
                    if len(newly_found_on_page) == 0:
                        consecutive_empty_pages += 1
                        if consecutive_empty_pages >= 2:
                            print("Stopping: No new reviews found for 2 consecutive pages.")
                    break
                
                print(f"✓ Page {page_num} completed. Total new reviews so far: {total_new_reviews}")
                page_num += 1
                time.sleep(random.uniform(3, 7))
            
            print("Finished scraping loop.")
        finally:
            try:
                self.close_browser()
            except Exception as e:
                print("Error closing browser:", e)
        
        print(f"🎉 Scraping complete! Total new reviews saved: {total_new_reviews}")
        return total_new_reviews

def fetch_trustpilot_logo(trustpilot_url, brand_id, display_name, output_dir="frontend/public/logos"):
    print("[LOGO] fetch_trustpilot_logo CALLED")
    try:
        from playwright.sync_api import sync_playwright
        import os
        print(f"[LOGO] Fetching logo for brand: {display_name} (ID: {brand_id}) from {trustpilot_url}")
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(trustpilot_url, wait_until="networkidle", timeout=60000)
            # Use the specific selector for Trustpilot business profile logo
            logo_elem = page.query_selector('img.business-profile-image_image__V14jr')
            if not logo_elem:
                print("[LOGO] Specific selector failed. Printing all image URLs for debugging:")
                for img in page.query_selector_all('img'):
                    print("[LOGO] Found image src:", img.get_attribute('src'))
                browser.close()
                return False
            logo_url = logo_elem.get_attribute("src")
            if not logo_url:
                print("[LOGO] Logo src not found.")
                browser.close()
                return False
            print(f"[LOGO] Found logo URL: {logo_url}")
            resp = requests.get(logo_url)
            ext = logo_url.split('.')[-1].split('?')[0].lower()
            print(f"[LOGO] Logo file type: {ext}")
            os.makedirs(output_dir, exist_ok=True)
            # Only save to one location, using the true brand name
            safe_brand_name = display_name.replace('/', '_').replace('\\', '_')
            out_path = os.path.join(output_dir, f"{safe_brand_name}-logo.{ext}")
            with open(out_path, "wb") as f:
                f.write(resp.content)
            print(f"[LOGO] Saved logo to {out_path}")
            browser.close()
            return True
    except Exception as e:
        print(f"[LOGO] ERROR: {e}")
        return False

def main():
    """Main function to run the scraper."""
    if len(sys.argv) < 2:
        print("Usage: python trustpilot_scraper.py <brand_name> [max_pages]")
        sys.exit(1)
    
    # Initialize the database and create tables if they don't exist
    init_db()
    
    brand_name = sys.argv[1]
    max_pages = int(sys.argv[2]) if len(sys.argv) > 2 else None
    
    print(f"Starting Trustpilot scraper for brand: {brand_name}")
    scraper = TrustpilotScraper(headless=True)
    new_reviews_count = scraper.scrape_brand_reviews(brand_name, max_pages)
    print(f"Scraping complete. Found {new_reviews_count} new reviews.")

if __name__ == "__main__":
    main() 