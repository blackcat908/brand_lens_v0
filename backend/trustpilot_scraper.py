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

# Import our new database modules
from database import get_db_session, init_db, Review
from sentiment_analyzer import SentimentAnalyzer
from utils import canonical_brand_id

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
        # Normalize brand name for mapping
        normalized = brand_name.lower().replace('_', '').replace(' ', '').replace('www.', '')
        if 'wanderdoll' in normalized:
            normalized = 'wander-doll'
        brand_urls = {
            'wander-doll': f"https://uk.trustpilot.com/review/www.wander-doll.com?page={page_num}",
            'oddmuse': f"https://uk.trustpilot.com/review/oddmuse.co.uk?page={page_num}",
            'because-of-alice': f"https://uk.trustpilot.com/review/www.becauseofalice.com?page={page_num}",
            'bbxbrand': f"https://uk.trustpilot.com/review/bbxbrand.com?page={page_num}",
            'murci': f"https://uk.trustpilot.com/review/murci.co.uk?page={page_num}"
        }
        if normalized in brand_urls:
            return [brand_urls[normalized]]
        # Fallbacks
        fallback_urls = [
            f"https://uk.trustpilot.com/review/www.{normalized}.com?page={page_num}",
            f"https://uk.trustpilot.com/review/{normalized}.co.uk?page={page_num}"
        ]
        return fallback_urls

    def get_trustpilot_source_url(self, brand_name):
        brand_urls = {
            'wander-doll': "https://uk.trustpilot.com/review/www.wander-doll.com",
            'oddmuse': "https://uk.trustpilot.com/review/oddmuse.co.uk",
            'because-of-alice': "https://uk.trustpilot.com/review/www.becauseofalice.com",
            'bbxbrand': "https://uk.trustpilot.com/review/bbxbrand.com",
            'murci': "https://uk.trustpilot.com/review/murci.co.uk"
        }
        if brand_name.lower() in brand_urls:
            return brand_urls[brand_name.lower()]
        # Fallbacks
        return f"https://uk.trustpilot.com/review/www.{brand_name}.com"

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

    def scrape_brand_reviews(self, brand_name, max_pages=None, start_page=1):
        """Scrapes reviews for a brand, using ONLY the user-provided Trustpilot URL from the DB. No guessing."""
        from database import get_brand_source_url, get_db_session
        canon_id = canonical_brand_id(brand_name)
        print(f"[DEBUG] brand_name passed to scraper: '{brand_name}', canonical: '{canon_id}'")
        with get_db_session() as db:
            brand_source = get_brand_source_url(db, canon_id)
            print(f"[DEBUG] brand_source_url lookup result: {brand_source}")
            if brand_source and 'source_url' in brand_source:
                user_url = brand_source['source_url']
            else:
                print(f"[ERROR] No Trustpilot URL found for brand '{brand_name}'. Aborting.")
                return 0
            cursor = db.cursor()
            cursor.execute("SELECT review_link FROM reviews WHERE brand_name = ?", (canon_id,))
            existing_links = {row[0] for row in cursor.fetchall() if row[0]}
        print(f"Found {len(existing_links)} existing review links for '{brand_name}' in the database.")
        print("Starting browser...")
        self.start_browser()
        print("Browser started.")
        all_new_reviews = []
        page_num = start_page
        consecutive_empty_pages = 0
        max_consecutive_empty = 3  # Stop after 3 consecutive empty pages
        try:
            print(f"Starting to scrape {'all pages' if max_pages is None else f'pages {start_page} to {max_pages}'}...")
            consecutive_empty_pages = 0
            while True:
                if max_pages is not None and page_num > max_pages:
                    print(f"Reached max_pages limit ({max_pages}). Stopping.")
                    break
                print(f"\n--- Scraping Page {page_num} ---")
                page_url = f"{user_url.split('?')[0]}?page={page_num}"
                print(f"Trying URL: {page_url}")
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
                newly_found_on_page = [
                    r for r in page_reviews if r['review_link'] not in existing_links
                ]
                if newly_found_on_page:
                    all_new_reviews.extend(newly_found_on_page)
                    for review in newly_found_on_page:
                        existing_links.add(review['review_link'])
                    print(f"Found {len(newly_found_on_page)} new reviews on page {page_num}")
                else:
                    print(f"No new reviews found on page {page_num}")
                if len(newly_found_on_page) < len(page_reviews):
                    print("Encountered previously saved reviews. Likely reached the end of new content.")
                    if len(newly_found_on_page) == 0:
                        consecutive_empty_pages += 1
                        if consecutive_empty_pages >= 2:
                            print("Stopping: No new reviews found for 2 consecutive pages.")
                    break
                print(f"Page {page_num} scraped successfully. Continuing...")
                page_num += 1
                time.sleep(random.uniform(3, 7))
            print("Finished scraping loop.")
        finally:
            try:
                self.close_browser()
            except Exception as e:
                print("Error closing browser:", e)
        if all_new_reviews:
            with get_db_session() as db:
                cursor = db.cursor()
                for review_data in all_new_reviews:
                    try:
                        analysis = self.sentiment_analyzer.process_review(review_data['review'])
                        if analysis['sentiment_score'] is None:
                            print(f"[ERROR] Sentiment analysis returned None for review: {review_data['review'][:100]}")
                            continue
                        valid_categories = {'positive', 'negative', 'neutral'}
                        if analysis['sentiment_category'] not in valid_categories:
                            print(f"[ERROR] Invalid sentiment_category '{analysis['sentiment_category']}' for review: {review_data['review'][:100]}")
                            continue
                        date_val = review_data.get('date')
                        if not date_val or not isinstance(date_val, str) or len(date_val) < 10:
                            print(f"[ERROR] Invalid or missing date for review: {review_data['review'][:100]}")
                            continue
                        import re
                        if not re.match(r"^\d{4}-\d{2}-\d{2}$", date_val[:10]):
                            print(f"[ERROR] Date not in YYYY-MM-DD format for review: {review_data['review'][:100]}, date: {date_val}")
                            continue
                    except Exception as e:
                        print(f"[ERROR] Sentiment analysis failed for review: {review_data['review'][:100]} | Error: {e}")
                        continue
                    cursor.execute(
                        "INSERT INTO reviews (brand_name, customer_name, review, rating, date, review_link, sentiment_score, sentiment_category, categories) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (
                            canon_id,
                            review_data['customer_name'],
                            review_data['review'],
                            review_data['rating'],
                            review_data['date'],
                            review_data['review_link'],
                            analysis['sentiment_score'],
                            analysis['sentiment_category'],
                            json.dumps(analysis['keywords'])
                        )
                    )
                db.commit()
            print(f"Successfully saved {len(all_new_reviews)} new reviews for '{brand_name}' to the database.")
            return len(all_new_reviews)
        else:
            print("No new reviews found to save.")
            return 0

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
            dash_display_name = display_name.lower().replace(' ', '-')
            out_path_id = os.path.join(output_dir, f"{brand_id}-logo.{ext}")
            out_path_display = os.path.join(output_dir, f"{dash_display_name}-logo.{ext}")
            with open(out_path_id, "wb") as f:
                f.write(resp.content)
            with open(out_path_display, "wb") as f:
                f.write(resp.content)
            print(f"[LOGO] Saved logo to {out_path_id} and {out_path_display}")
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