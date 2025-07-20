#!/usr/bin/env python3
"""
Script to scrape a single brand from command line arguments
Usage: python scrape_single_brand.py --brand <brand_name>
"""

import argparse
import sys
import time
from robust_trustpilot_scraper import RobustTrustpilotScraper
from database import init_db
from robust_logger import setup_logger

logger = setup_logger('single_brand_scraper')

def scrape_single_brand(brand_name: str, dry_run=False):
    """Scrape reviews for a single brand. If dry_run, do not insert into DB."""
    try:
        # Initialize database (needed for ORM, but won't write if dry_run)
        init_db()
        logger.info(f"Starting scrape for brand: {brand_name} (dry_run={dry_run})")
        # Create scraper instance
        scraper = RobustTrustpilotScraper(headless=True)
        # Scrape only 1 page
        reviews = scraper.scrape_brand_reviews(brand_name, max_pages=50, dry_run=dry_run)
        logger.info(f"Completed scraping for brand: {brand_name}")
        if isinstance(reviews, int):
            print(f"SCRAPED_REVIEWS: {reviews}")
        else:
            print(f"SCRAPED_REVIEWS: {len(reviews)}")
            for idx, r in enumerate(reviews):
                print(f"[{idx+1}] {r}")
        return True
    except Exception as e:
        logger.error(f"Failed to scrape {brand_name}: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description='Scrape reviews for a single brand')
    parser.add_argument('--brand', required=False, help='Brand name to scrape')
    parser.add_argument('--dry-run', action='store_true', help='Scrape but do not insert into DB')
    args = parser.parse_args()
    valid_brands = ['wanderdoll', 'wander-doll', 'murci', 'bbxbrand', 'becauseofalice', 'oddmuse']
    if args.brand:
        if args.brand.lower() not in valid_brands:
            logger.error(f"Invalid brand name: {args.brand}")
            logger.error(f"Valid brands: {', '.join(valid_brands)}")
            sys.exit(1)
        success = scrape_single_brand(args.brand.lower(), dry_run=args.dry_run)
        sys.exit(0 if success else 1)
    else:
        # No brand specified: scrape one page for each brand in dry-run mode
        for brand in valid_brands:
            print(f"\n==== DRY RUN: {brand} ====")
            scrape_single_brand(brand, dry_run=True)

if __name__ == "__main__":
    main() 