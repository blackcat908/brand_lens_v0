import time
import random
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
from database import get_db_session, init_db, Review
from robust_config import BRANDS, SCRAPING_CONFIG
from robust_logger import setup_logger
import string
from sqlalchemy.exc import IntegrityError
import sys

logger = setup_logger('trustpilot_scraper')

class RobustTrustpilotScraper:
    def __init__(self, headless=True):
        self.headless = headless
        self.playwright = None
        self.browser = None
        self.page = None

    def start_browser(self):
        self.playwright = sync_playwright().start()
        self.browser = self.playwright.chromium.launch(headless=self.headless)
        self.page = self.browser.new_page()
        self.page.set_extra_http_headers({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })

    def close_browser(self):
        if self.browser:
            self.browser.close()
        if self.playwright:
            self.playwright.stop()

    def get_trustpilot_url(self, brand_name, page_num):
        # Special case for wander-doll with dash
        if brand_name == 'wander-doll':
            return [f"https://uk.trustpilot.com/review/www.wander-doll.com?page={page_num}"]
        # Existing logic for other brands
        if brand_name == 'wanderdoll':
            return [f"https://uk.trustpilot.com/review/www.wander-doll.com?page={page_num}",
                    f"https://uk.trustpilot.com/review/wanderdoll.co.uk?page={page_num}"]
        if brand_name == 'bbxbrand':
            return [f"https://uk.trustpilot.com/review/bbxbrand.com?page={page_num}"]
        if brand_name == 'becauseofalice':
            return [f"https://uk.trustpilot.com/review/www.becauseofalice.com?page={page_num}"]
        if brand_name == 'murci':
            return [f"https://uk.trustpilot.com/review/murci.co.uk?page={page_num}"]
        if brand_name == 'oddmuse':
            return [f"https://uk.trustpilot.com/review/oddmuse.co.uk?page={page_num}"]
        # Default fallback
        return [f"https://uk.trustpilot.com/review/www.{brand_name}.com?page={page_num}"]

    def get_trustpilot_source_url(self, brand_name):
        brand_urls = {
            'wander-doll': "https://uk.trustpilot.com/review/www.wander-doll.com",
            'oddmuse': "https://uk.trustpilot.com/review/oddmuse.co.uk",
            'becauseofalice': "https://uk.trustpilot.com/review/www.becauseofalice.com",
            'bbxbrand': "https://uk.trustpilot.com/review/bbxbrand.com",
            'murci': "https://uk.trustpilot.com/review/murci.co.uk"
        }
        if brand_name.lower() in brand_urls:
            return brand_urls[brand_name.lower()]
        # Fallbacks
        return f"https://uk.trustpilot.com/review/www.{brand_name}.com"

    def normalize_text(self, text):
        if not text:
            return ''
        return text.strip().lower().translate(str.maketrans('', '', string.punctuation))

    def scrape_page(self, url):
        for attempt in range(1, SCRAPING_CONFIG['max_retries'] + 1):
            try:
                if not self.page:
                    logger.error('Page is not initialized')
                    return []
                self.page.goto(url, wait_until='networkidle', timeout=20000)  # 20 seconds timeout
                review_cards = self.page.query_selector_all('article') if self.page else []
                page_reviews = []
                for card in review_cards:
                    name_elem = card.query_selector('[data-consumer-name-typography]')
                    name_text = name_elem.text_content() if name_elem and name_elem.text_content() else ''
                    name_text = name_text.strip() if name_text else ''
                    date_text = None
                    for p_tag in card.query_selector_all('p'):
                        p_content = p_tag.text_content() if p_tag else ''
                        if p_content and "Date of experience:" in p_content:
                            date_text = p_content.replace("Date of experience:", "").strip()
                            break
                    if not name_text or not date_text:
                        continue
                    rating_img = card.query_selector('img[alt*="Rated"]')
                    star_rating = None
                    if rating_img:
                        alt_text = rating_img.get_attribute('alt')
                        if alt_text:
                            import re
                            match = re.search(r'Rated (\d) out of 5 stars', alt_text)
                            if match:
                                star_rating = int(match.group(1))
                    title_elem = card.query_selector('h2')
                    body_elem = card.query_selector('p')
                    title_text = title_elem.text_content() if title_elem and title_elem.text_content() else ''
                    body_text = body_elem.text_content() if body_elem and body_elem.text_content() else ''
                    title_text = title_text.strip() if title_text else ''
                    body_text = body_text.strip() if body_text else ''
                    review_link = None
                    review_content = card.query_selector('.styles_reviewContent__tuXiN')
                    if review_content:
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
                    if not review_link:
                        review_link = url
                    page_reviews.append({
                        'customer_name': name_text,
                        'review': body_text.strip(),
                        'rating': star_rating,
                        'date': date_text,
                        'review_link': review_link
                    })
                if not page_reviews:
                    logger.error(f"No reviews found on {url} after loading page.")
                return page_reviews
            except PlaywrightTimeoutError as e:
                logger.warning(f"Timeout loading {url} (attempt {attempt}/{SCRAPING_CONFIG['max_retries']})")
            except Exception as e:
                logger.error(f"Error scraping {url} (attempt {attempt}/{SCRAPING_CONFIG['max_retries']}): {e}")
            time.sleep(random.uniform(*SCRAPING_CONFIG['delay_between_pages']))
        logger.error(f"Failed to scrape {url} after {SCRAPING_CONFIG['max_retries']} attempts.")
        return []

    def scrape_brand_reviews(self, brand_name, max_pages=None, dry_run=False):
        self.start_browser()
        logger.info("Browser started.")
        all_new_reviews = []
        page_num = 2  # Start from page 2 for update button test
        last_page = 7  # End at page 7 (inclusive)
        try:
            logger.info(f"Starting to scrape pages 2–7 for {brand_name} (for update button test)...")
            N = 20  # Number of reviews per Trustpilot page
            while True:
                if page_num > last_page:
                    logger.info(f"Reached last_page limit ({last_page}) for {brand_name}. Stopping.")
                    break
                logger.info(f"--- Scraping Page {page_num} --- [TEST MODE: Only pages 2–7]")
                url_formats = self.get_trustpilot_url(brand_name, page_num)
                page_reviews = []
                working_url = None
                for url in url_formats:
                    logger.info(f"Trying URL: {url}")
                    page_reviews = self.scrape_page(url)
                    if page_reviews:
                        working_url = url
                        logger.info(f"Success! Using URL: {url}")
                        break
                    else:
                        logger.info(f"No reviews found at: {url}")
                if not page_reviews:
                    logger.info(f"No reviews found on page {page_num}. Stopping.")
                    break
                logger.info(f"Processing {len(page_reviews)} reviews on page {page_num}.")
                with get_db_session() as db:
                    if page_num == 2:  # Only on first page scraped in this test
                        # Get existing review links for this brand
                        existing_links = set(row['review_link'] for row in db.execute('SELECT review_link FROM reviews WHERE brand_name = ?', (brand_name,)).fetchall() if row['review_link'])
                        existing_composites = set((row['customer_name'], self.normalize_text(row['review'])) for row in db.execute('SELECT customer_name, review FROM reviews WHERE brand_name = ?', (brand_name,)).fetchall())
                        self._existing_links = existing_links
                        self._existing_composites = existing_composites
                        print(f"[DEBUG] Comparing against {len(existing_links)} existing review links and {len(existing_composites)} composite reviews")
                    db_links = self._existing_links
                    db_composites = self._existing_composites
                new_reviews_on_page = 0
                for idx, review in enumerate(page_reviews):
                    review_link = review.get('review_link')
                    customer_name = review['customer_name']
                    norm_review = self.normalize_text(review['review'])
                    composite_key = (customer_name, norm_review)
                    if review_link and review_link in db_links:
                        continue
                    if composite_key in db_composites:
                        continue
                    all_new_reviews.append(review)
                    new_reviews_on_page += 1
                logger.info(f"Found {new_reviews_on_page} new reviews on page {page_num}.")
                if new_reviews_on_page < len(page_reviews):
                    logger.info(f"Not all reviews on page {page_num} are new. Stopping scrape.")
                    break
                logger.info(f"All {new_reviews_on_page} reviews on page {page_num} are new. Continuing to next page...")
                page_num += 1
                time.sleep(random.uniform(*SCRAPING_CONFIG['delay_between_pages']))
            logger.info("Finished scraping loop.")
        finally:
            logger.info("Closing browser...")
            self.close_browser()
            logger.info("Browser closed.")
        if dry_run:
            return all_new_reviews
        if all_new_reviews:
            with get_db_session() as db:
                for review_data in all_new_reviews:
                    exists = None
                    if review_data.get('review_link'):
                        exists = db.execute('SELECT 1 FROM reviews WHERE brand_name = ? AND review_link = ? LIMIT 1', (brand_name, review_data['review_link'])).fetchone()
                    if not exists:
                        exists = db.execute('SELECT 1 FROM reviews WHERE brand_name = ? AND customer_name = ? AND review = ? LIMIT 1', (brand_name, review_data['customer_name'], review_data['review'])).fetchone()
                    if exists:
                        logger.info(f"Duplicate review detected for {brand_name} - {review_data['customer_name']} (link or composite). Skipping insert.")
                        continue
                    try:
                        db.execute('INSERT INTO reviews (brand_name, customer_name, review, rating, date, review_link) VALUES (?, ?, ?, ?, ?, ?)',
                                   (brand_name, review_data['customer_name'], review_data['review'], review_data['rating'], review_data['date'], review_data['review_link']))
                        db.commit()
                    except Exception as e:
                        db.rollback()
                        logger.warning(f"Error inserting review for {brand_name} - {review_data['customer_name']}: {e}")
            logger.info(f"Successfully saved {len(all_new_reviews)} new reviews for '{brand_name}' to the database.")
            return len(all_new_reviews)
        else:
            logger.info("No new reviews found to save.")
            return 0

def scrape_all_brands():
    init_db()
    for brand in BRANDS:
        logger.info(f"\n==== SCRAPING BRAND: {brand} ====")
        try:
            scraper = RobustTrustpilotScraper(headless=SCRAPING_CONFIG['headless'])
            scraper.scrape_brand_reviews(brand)
        except Exception as e:
            logger.error(f"Failed to scrape {brand}: {e}")
        time.sleep(SCRAPING_CONFIG['delay_between_brands'])

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        brand_name = sys.argv[1]
        max_pages = int(sys.argv[2]) if len(sys.argv) > 2 else None
        scraper = RobustTrustpilotScraper(headless=True)
        scraper.scrape_brand_reviews(brand_name, max_pages)
    else:
        scrape_all_brands() 