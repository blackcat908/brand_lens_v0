#!/usr/bin/env python3
"""
ULTRA-FAST Bulk Scraper Script
Scrapes 5 brands at a time in parallel using existing infrastructure
"""

import sys
import time
import logging
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from trustpilot_scraper import TrustpilotScraper
from database import init_db, get_db_session, get_brand_source_url
from config import BRANDS, SCRAPING_CONFIG

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(f'logs/bulk_scraper_{datetime.now().strftime("%Y%m%d")}.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

def check_brand_availability(brand_name):
    """Check if brand has source URL in database"""
    try:
        with get_db_session() as db:
            source_data = get_brand_source_url(db, brand_name)
            if source_data:
                logger.info(f"[SUCCESS] {brand_name}: Source URL available")
                return True
            else:
                logger.warning(f"[WARNING] {brand_name}: No source URL found - skipping")
                return False
    except Exception as e:
        logger.error(f"[ERROR] {brand_name}: Error checking availability: {e}")
        return False

def scrape_brand(brand_name, max_pages=None, start_page=1, ultra_fast=False):
    """Scrape a single brand with optional ultra-fast mode"""
    logger.info(f"[START] Starting scrape for brand: {brand_name} {'[ULTRA-FAST]' if ultra_fast else ''}")
    
    scraper = None
    try:
        scraper = TrustpilotScraper(headless=SCRAPING_CONFIG['headless'])
        
        if ultra_fast:
            # Ultra-fast mode: use the new ultra-fast method
            new_reviews = scraper.scrape_brand_reviews_ultra_fast(brand_name, max_pages, start_page)
            
        else:
            # Standard mode: use the original method
            new_reviews = scraper.scrape_brand_reviews(brand_name, max_pages, start_page)
        
        logger.info(f"[SUCCESS] {brand_name}: Scraping completed - {new_reviews} new reviews")
        return new_reviews
        
    except Exception as e:
        logger.error(f"[ERROR] {brand_name}: Scraping failed - {e}")
        return 0
        
    finally:
        # Always clean up browser resources properly
        if scraper:
            try:
                if hasattr(scraper, 'close_browser'):
                    scraper.close_browser()
                elif hasattr(scraper, 'browser') and scraper.browser:
                    scraper.browser.close()
                if hasattr(scraper, 'playwright') and scraper.playwright:
                    scraper.playwright.stop()
            except Exception as cleanup_error:
                logger.warning(f"Browser cleanup warning for {brand_name}: {cleanup_error}")
                # Force cleanup if normal cleanup fails
                try:
                    if hasattr(scraper, 'browser') and scraper.browser:
                        scraper.browser.close()
                except:
                    pass

def get_brands_to_scrape():
    """Get all brands except Wander Doll"""
    all_brands = BRANDS.copy()
    
    # Remove Wander Doll variations
    brands_to_exclude = ['wanderdoll', 'wander-doll', 'wander doll']
    brands_to_scrape = []
    
    for brand in all_brands:
        if brand.lower() not in [exclude.lower() for exclude in brands_to_exclude]:
            brands_to_scrape.append(brand)
    
    logger.info(f"Total brands to scrape: {len(brands_to_scrape)}")
    return brands_to_scrape

def get_remaining_brands():
    """Intelligently detect which brands still need to be scraped"""
    from database import get_db_session, Review, BrandSourceUrl
    
    all_brands = get_brands_to_scrape()
    remaining_brands = []
    
    try:
        with get_db_session() as session:
            for brand_name in all_brands:
                # Check if brand exists in database (has source URL)
                brand_source = session.query(BrandSourceUrl).filter(BrandSourceUrl.brand_name == brand_name).first()
                
                if not brand_source:
                    # Brand doesn't exist, needs to be scraped
                    remaining_brands.append(brand_name)
                    continue
                
                # Check if brand has any reviews
                review_count = session.query(Review).filter(Review.brand_name == brand_name).count()
                
                if review_count == 0:
                    # Brand exists but has no reviews, needs to be scraped
                    remaining_brands.append(brand_name)
                else:
                    # Brand has reviews, check if it's recent (within last 24 hours)
                    from datetime import datetime, timedelta
                    latest_review = session.query(Review).filter(
                        Review.brand_name == brand_name
                    ).order_by(Review.date.desc()).first()
                    
                    if latest_review and latest_review.date:
                        try:
                            # Parse the date string to datetime object
                            review_date = datetime.strptime(latest_review.date, '%Y-%m-%d')
                            # If latest review is older than 24 hours, consider it needs updating
                            if datetime.now() - review_date > timedelta(hours=24):
                                remaining_brands.append(brand_name)
                        except ValueError:
                            # If date parsing fails, consider it needs updating
                            remaining_brands.append(brand_name)
                    else:
                        remaining_brands.append(brand_name)
        
    except Exception as e:
        logger.warning(f"Could not check database for remaining brands: {e}")
        # Fallback: return all brands if database check fails
        remaining_brands = all_brands
    
    return remaining_brands

def show_scraping_status():
    """Show current scraping progress and status"""
    from database import get_db_session, Review, BrandSourceUrl
    
    all_brands = get_brands_to_scrape()
    completed_brands = []
    pending_brands = []
    failed_brands = []
    
    try:
        with get_db_session() as session:
            for brand_name in all_brands:
                # Check if brand exists in database (has source URL)
                brand_source = session.query(BrandSourceUrl).filter(BrandSourceUrl.brand_name == brand_name).first()
                
                if not brand_source:
                    pending_brands.append(brand_name)
                    continue
                
                # Check if brand has any reviews
                review_count = session.query(Review).filter(Review.brand_name == brand_name).count()
                
                if review_count == 0:
                    pending_brands.append(brand_name)
                else:
                    # Brand has reviews, check if it's recent
                    from datetime import datetime, timedelta
                    latest_review = session.query(Review).filter(
                        Review.brand_name == brand_name
                    ).order_by(Review.date.desc()).first()
                    
                    if latest_review and latest_review.date:
                        try:
                            # Parse the date string to datetime object
                            review_date = datetime.strptime(latest_review.date, '%Y-%m-%d')
                            hours_ago = (datetime.now() - review_date).total_seconds() / 3600
                            
                            if hours_ago < 24:
                                completed_brands.append((brand_name, review_count, f"{hours_ago:.1f}h ago"))
                            else:
                                pending_brands.append(brand_name)
                        except ValueError:
                            # If date parsing fails, consider it pending
                            pending_brands.append(brand_name)
                    else:
                        pending_brands.append(brand_name)
        
    except Exception as e:
        logger.warning(f"Could not check database status: {e}")
        # Fallback: show basic status without database
        print(f"\n{'='*60}")
        print(f"[SCRAPING STATUS] Basic Status (Database Unavailable)")
        print(f"{'='*60}")
        print(f"📊 Total brands: {len(all_brands)}")
        print(f"⏳ Status: Cannot determine (database error)")
        print(f"🚀 [NEXT STEPS]:")
        print(f"   • Use 'python bulk_scraper.py --sequential' to start fresh")
        print(f"   • Use 'python bulk_scraper.py --single <brand>' for specific brands")
        return
    
    # Display status
    print(f"\n{'='*60}")
    print(f"[SCRAPING STATUS] Current Progress")
    print(f"{'='*60}")
    print(f"📊 Total brands: {len(all_brands)}")
    print(f"✅ Completed: {len(completed_brands)}")
    print(f"⏳ Pending: {len(pending_brands)}")
    print(f"❌ Failed: {len(failed_brands)}")
    
    if completed_brands:
        print(f"\n✅ [COMPLETED BRANDS] (Last 24 hours):")
        for brand, count, time_ago in completed_brands:
            print(f"   • {brand}: {count} reviews ({time_ago})")
    
    if pending_brands:
        print(f"\n⏳ [PENDING BRANDS] (Need scraping):")
        for brand in pending_brands:
            print(f"   • {brand}")
    
    if pending_brands:
        print(f"\n🚀 [NEXT STEPS]:")
        print(f"   • Use 'python bulk_scraper.py --continue' to resume")
        print(f"   • Use 'python bulk_scraper.py --sequential' to start fresh")
        print(f"   • Use 'python bulk_scraper.py --single <brand>' for specific brands")
    else:
        print(f"\n🎉 [ALL DONE] All brands have been scraped recently!")

def scrape_single_brand_ultra_fast(brand_name, max_pages=None, start_page=1):
    """ULTRA-FAST scraping for a single brand - maximum speed, no delays"""
    logger.info(f"[ULTRA-FAST SINGLE] Starting ultra-fast scraping for brand: {brand_name}")
    
    start_time = time.time()
    
    try:
        # Initialize database
        init_db()
        
        # Check brand availability
        if not check_brand_availability(brand_name):
            logger.error(f"[ULTRA-FAST SINGLE] {brand_name}: Brand not available")
            return 0
        
        # Scrape with ultra-fast mode
        new_reviews = scrape_brand(brand_name, max_pages, start_page, ultra_fast=True)
        
        end_time = time.time()
        total_time = end_time - start_time
        
        if new_reviews > 0:
            logger.info(f"[ULTRA-FAST SINGLE] ✅ {brand_name}: {new_reviews} new reviews scraped in {total_time:.1f} seconds")
        else:
            logger.warning(f"[ULTRA-FAST SINGLE] ⚠️ {brand_name}: No new reviews scraped")
        
        return new_reviews
        
    except Exception as e:
        logger.error(f"[ULTRA-FAST SINGLE] ❌ {brand_name}: Error - {e}")
        return 0

def bulk_scrape(brands_to_scrape=None, max_pages_per_brand=None, start_page=1):
    """Bulk scrape multiple brands sequentially (original method)"""
    
    if brands_to_scrape is None:
        brands_to_scrape = get_brands_to_scrape()
    
    logger.info(f"[BULK] SEQUENTIAL BULK SCRAPING STARTED")
    logger.info(f"[INFO] Max pages per brand: {max_pages_per_brand or 'NO LIMIT - ALL PAGES'}")
    logger.info(f"[INFO] Starting from page: {start_page}")
    logger.info(f"[INFO] This will scrape ALL reviews for each brand!")
    
    # Initialize database
    init_db()
    
    total_reviews_scraped = 0
    successful_brands = 0
    failed_brands = 0
    
    start_time = time.time()
    
    for i, brand in enumerate(brands_to_scrape, 1):
        logger.info(f"\n{'='*60}")
        logger.info(f"[PROGRESS] Progress: {i}/{len(brands_to_scrape)} - Brand: {brand}")
        logger.info(f"{'='*60}")
        
        # Check if brand is available
        if not check_brand_availability(brand):
            failed_brands += 1
            continue
        
        # Scrape the brand
        new_reviews = scrape_brand(brand, max_pages_per_brand, start_page)
        
        if new_reviews > 0:
            successful_brands += 1
            total_reviews_scraped += new_reviews
            logger.info(f"[SUCCESS] {brand}: {new_reviews} new reviews scraped")
        else:
            failed_brands += 1
            logger.warning(f"[WARNING] {brand}: No new reviews scraped")
        
        # Add delay between brands
        if i < len(brands_to_scrape):
            logger.info(f"[INFO] Waiting 10 seconds before next brand...")
            time.sleep(10)
    
    end_time = time.time()
    total_time = end_time - start_time
    
    # Final summary
    logger.info(f"\n{'='*60}")
    logger.info(f"[COMPLETE] SEQUENTIAL BULK SCRAPING COMPLETED")
    logger.info(f"{'='*60}")
    logger.info(f"[SUMMARY] Summary:")
    logger.info(f"   [SUCCESS] Successful brands: {successful_brands}")
    logger.info(f"   [ERROR] Failed brands: {failed_brands}")
    logger.info(f"   [TOTAL] Total new reviews scraped: {total_reviews_scraped}")
    logger.info(f"   [TIME] Total time: {total_time:.2f} seconds")
    logger.info(f"   [AVG] Average time per brand: {total_time/len(brands_to_scrape):.2f} seconds")
    
    return {
        'successful_brands': successful_brands,
        'failed_brands': failed_brands,
        'total_reviews': total_reviews_scraped,
        'total_time': total_time
    }

def bulk_scrape_parallel_5(brands_to_scrape=None, max_pages_per_brand=None, start_page=1, max_workers=3, ultra_fast=True):
    """ULTRA-FAST bulk scrape brands in parallel with stable browser management"""
    
    if brands_to_scrape is None:
        brands_to_scrape = get_brands_to_scrape()
    
    mode_text = "ULTRA-FAST" if ultra_fast else "STANDARD"
    logger.info(f"[PARALLEL] {mode_text} PARALLEL BULK SCRAPING STARTED")
    logger.info(f"[INFO] Max pages per brand: {max_pages_per_brand or 'NO LIMIT - ALL PAGES'}")
    logger.info(f"[INFO] Starting from page: {start_page}")
    logger.info(f"[INFO] Parallel workers: {max_workers} brands at a time")
    logger.info(f"[INFO] Ultra-fast mode: {'ENABLED' if ultra_fast else 'DISABLED'}")
    logger.info(f"[INFO] This will scrape ALL reviews for each brand!")
    
    # Initialize database
    init_db()
    
    total_reviews_scraped = 0
    successful_brands = 0
    failed_brands = 0
    brand_results = {}
    
    start_time = time.time()
    
    # Process brands in smaller batches for stability
    batch_size = min(max_workers, 3)  # Max 3 brands at once for stability
    
    # Process brands in batches
    for i in range(0, len(brands_to_scrape), batch_size):
        batch = brands_to_scrape[i:i + batch_size]
        logger.info(f"\n[INFO] Processing batch {i//batch_size + 1}: {batch}")
        
        with ThreadPoolExecutor(max_workers=len(batch)) as executor:
            # Submit batch for parallel processing
            future_to_brand = {
                executor.submit(scrape_brand, brand, max_pages_per_brand, start_page, ultra_fast): brand 
                for brand in batch
            }
            
            # Process completed brands as they finish
            for future in as_completed(future_to_brand):
                brand = future_to_brand[future]
                try:
                    new_reviews = future.result()
                    if new_reviews > 0:
                        successful_brands += 1
                        total_reviews_scraped += new_reviews
                        brand_results[brand] = new_reviews
                        logger.info(f"[SUCCESS] {brand}: {new_reviews} new reviews scraped")
                    else:
                        failed_brands += 1
                        brand_results[brand] = 0
                        logger.warning(f"[WARNING] {brand}: No new reviews scraped")
                except Exception as e:
                    failed_brands += 1
                    brand_results[brand] = 0
                    logger.error(f"[ERROR] {brand}: Scraping failed - {e}")
        
        # Small delay between batches to prevent resource exhaustion
        if i + batch_size < len(brands_to_scrape):
            logger.info(f"[INFO] Batch {i//batch_size + 1} complete. Waiting 2 seconds before next batch...")
            time.sleep(2)
    
    end_time = time.time()
    total_time = end_time - start_time
    
    # Final summary
    logger.info(f"\n{'='*60}")
    logger.info(f"[COMPLETE] ULTRA-FAST PARALLEL BULK SCRAPING COMPLETED")
    logger.info(f"{'='*60}")
    logger.info(f"[SUMMARY] Summary:")
    logger.info(f"   [SUCCESS] Successful brands: {successful_brands}")
    logger.info(f"   [ERROR] Failed brands: {failed_brands}")
    logger.info(f"   [TOTAL] Total new reviews scraped: {total_reviews_scraped}")
    logger.info(f"   [TIME] Total time: {total_time:.2f} seconds")
    logger.info(f"   [AVG] Average time per brand: {total_time/len(brands_to_scrape):.2f} seconds")
    logger.info(f"   [SPEED] Parallel processing: {batch_size} brands simultaneously")
    
    # Show individual brand results
    logger.info(f"\n[BRAND RESULTS] Individual brand performance:")
    for brand, reviews in brand_results.items():
        status = "SUCCESS" if reviews > 0 else "FAILED"
        logger.info(f"   {brand}: {reviews} reviews - {status}")
    
    return {
        'successful_brands': successful_brands,
        'failed_brands': failed_brands,
        'total_reviews': total_reviews_scraped,
        'total_time': total_time,
        'brand_results': brand_results
    }

def bulk_scrape_sequential_ultra_fast(brands_to_scrape=None, max_pages_per_brand=None, start_page=1):
    """ULTRA-FAST sequential scraping - most stable option that avoids threading issues"""
    
    if brands_to_scrape is None:
        brands_to_scrape = get_brands_to_scrape()
    
    logger.info(f"[SEQUENTIAL] ULTRA-FAST SEQUENTIAL BULK SCRAPING STARTED")
    logger.info(f"[INFO] Max pages per brand: {max_pages_per_brand or 'NO LIMIT - ALL PAGES'}")
    logger.info(f"[INFO] Starting from page: {start_page}")
    logger.info(f"[INFO] Ultra-fast mode: ENABLED")
    logger.info(f"[INFO] This will scrape ALL reviews for each brand!")
    logger.info(f"[INFO] Processing brands one by one for maximum stability!")
    
    # Initialize database
    init_db()
    
    total_reviews_scraped = 0
    successful_brands = 0
    failed_brands = 0
    brand_results = {}
    
    start_time = time.time()
    
    # Process brands one by one (most stable)
    for i, brand in enumerate(brands_to_scrape, 1):
        logger.info(f"\n{'='*60}")
        logger.info(f"[PROGRESS] Progress: {i}/{len(brands_to_scrape)} - Brand: {brand}")
        logger.info(f"{'='*60}")
        
        try:
            new_reviews = scrape_brand(brand, max_pages_per_brand, start_page, ultra_fast=True)
            if new_reviews > 0:
                successful_brands += 1
                total_reviews_scraped += new_reviews
                brand_results[brand] = new_reviews
                logger.info(f"[SUCCESS] {brand}: {new_reviews} new reviews scraped")
            else:
                failed_brands += 1
                brand_results[brand] = 0
                logger.warning(f"[WARNING] {brand}: No new reviews scraped")
        except Exception as e:
            failed_brands += 1
            brand_results[brand] = 0
            logger.error(f"[ERROR] {brand}: Scraping failed - {e}")
        
        # Small delay between brands to prevent resource exhaustion
        if i < len(brands_to_scrape):
            logger.info(f"[INFO] {brand} complete. Waiting 2 seconds before next brand...")
            time.sleep(2)
    
    end_time = time.time()
    total_time = end_time - start_time
    
    # Final summary
    logger.info(f"\n{'='*60}")
    logger.info(f"[COMPLETE] ULTRA-FAST SEQUENTIAL BULK SCRAPING COMPLETED")
    logger.info(f"{'='*60}")
    logger.info(f"[SUMMARY] Summary:")
    logger.info(f"   [SUCCESS] Successful brands: {successful_brands}")
    logger.info(f"   [ERROR] Failed brands: {failed_brands}")
    logger.info(f"   [TOTAL] Total new reviews scraped: {total_reviews_scraped}")
    logger.info(f"   [TIME] Total time: {total_time:.2f} seconds")
    logger.info(f"   [AVG] Average time per brand: {total_time/len(brands_to_scrape):.2f} seconds")
    logger.info(f"   [SPEED] Sequential processing: 1 brand at a time (most stable)")
    
    # Show individual brand results
    logger.info(f"\n[BRAND RESULTS] Individual brand performance:")
    for brand, reviews in brand_results.items():
        status = "SUCCESS" if reviews > 0 else "FAILED"
        logger.info(f"   {brand}: {reviews} reviews - {status}")
    
    return {
        'successful_brands': successful_brands,
        'failed_brands': failed_brands,
        'total_reviews': total_reviews_scraped,
        'total_time': total_time,
        'brand_results': brand_results
    }

def main():
    """Main function for command line usage"""
    
    print("[START] ULTRA-FAST BULK SCRAPER FOR TRUSTPILOT REVIEWS")
    print("=" * 60)
    
    # Parse command line arguments
    if len(sys.argv) > 1:
        if sys.argv[1] == '--help' or sys.argv[1] == '-h':
            print("\n[START] ULTRA-FAST Bulk Scraper Usage:")
            print("  python bulk_scraper.py                    # Scrape ALL brands sequentially - NO PAGE LIMIT")
            print("  python bulk_scraper.py --all              # Scrape ALL brands sequentially - NO PAGE LIMIT")
            print("  python bulk_scraper.py --sequential       # [START] ULTRA-FAST: Scrape ALL brands one by one (MOST STABLE)")
            print("  python bulk_scraper.py --parallel         # [START] ULTRA-FAST: Scrape 3 brands at a time in parallel")
            print("  python bulk_scraper.py --parallel 3       # [START] ULTRA-FAST: Scrape 3 brands at a time in parallel")
            print("  python bulk_scraper.py --parallel 5       # [START] ULTRA-FAST: Scrape 5 brands at a time in parallel")
            print("  python bulk_scraper.py --parallel --ultra-fast  # [START] ULTRA-FAST: Maximum speed parallel scraping")
            print("  python bulk_scraper.py --single <brand>   # [START] ULTRA-FAST: Scrape single brand with maximum speed")
            print("  python bulk_scraper.py --resume 30        # Resume from page 30 for all brands")
            print("  python bulk_scraper.py --continue         # Continue from where we left off (remaining brands)")
            print("  python bulk_scraper.py --status           # Check current scraping progress")
            print("  python bulk_scraper.py --stop             # Gracefully stop scraper (Ctrl+C alternative)")
            print("\n[INFO] Examples:")
            print("  python bulk_scraper.py                    # Sequential scraping (all brands, all pages)")
            print("  python bulk_scraper.py --sequential       # [START] ULTRA-FAST sequential (MOST STABLE)")
            print("  python bulk_scraper.py --parallel         # [START] ULTRA-FAST parallel (3 brands at once)")
            print("  python bulk_scraper.py --parallel 3       # [START] ULTRA-FAST parallel (3 brands at once)")
            print("  python bulk_scraper.py --parallel 5       # [START] ULTRA-FAST parallel (5 brands at once)")
            print("  python bulk_scraper.py --parallel --ultra-fast  # [START] ULTRA-FAST parallel (maximum speed)")
            print("  python bulk_scraper.py --single house-of-cb  # [START] ULTRA-FAST single brand (maximum speed)")
            print("  python bulk_scraper.py --resume 50        # Resume from page 50")
            print("  python bulk_scraper.py --continue         # Continue with remaining brands")
            print("\n[INFO] Single Brand Ultra-Fast Mode:")
            print("  • Maximum speed for single brand")
            print("  • No delays between pages")
            print("  • Optimized browser handling")
            print("  • Perfect for quick single brand scraping")
            print("\n[INFO] Sequential Ultra-Fast Mode (MOST STABLE):")
            print("  • All brands scraped one by one")
            print("  • Ultra-fast performance for each brand")
            print("  • No threading issues")
            print("  • Perfect for reliable bulk operations")
            print("  • Can be stopped and resumed with --continue")
            print("\n[INFO] Parallel Mode Features:")
            print("  • 3 brands scraped simultaneously (default)")
            print("  • Ultra-fast performance")
            print("  • No page limits - gets ALL reviews")
            print("  • Good for speed, but may have threading issues")
            sys.exit(0)
        
        # Resume from specific page
        if sys.argv[1] == '--resume' and len(sys.argv) > 2:
            start_page = int(sys.argv[2])
            print(f"[RESUME] Resuming bulk scrape from page {start_page}")
            print(f"[INFO] Will scrape ALL brands (except Wander Doll) from page {start_page}")
            result = bulk_scrape(start_page=start_page)
            
        # Continue with remaining brands
        elif sys.argv[1] == '--continue':
            print("[CONTINUE] Continuing with remaining brands from where we left off")
            remaining_brands = get_remaining_brands()
            if remaining_brands:
                print(f"[INFO] Found {len(remaining_brands)} remaining brands to scrape")
                print(f"[INFO] Remaining brands: {', '.join(remaining_brands)}")
                result = bulk_scrape_sequential_ultra_fast(brands_to_scrape=remaining_brands)
            else:
                print("[INFO] All brands have been completed! No remaining work.")
                sys.exit(0)
                
        # Check current status
        elif sys.argv[1] == '--status':
            print("[STATUS] Checking current scraping progress...")
            show_scraping_status()
            sys.exit(0)
            
        # Gracefully stop scraper
        elif sys.argv[1] == '--stop':
            print("[STOP] Gracefully stopping scraper...")
            print("[INFO] Progress has been saved. Use '--continue' to resume later.")
            print("[INFO] Or use '--status' to check current progress.")
            sys.exit(0)
            
        # ULTRA-FAST Single brand scraping
        elif sys.argv[1] == '--single':
            if len(sys.argv) < 3:
                print("[ERROR] Please specify a brand name: python bulk_scraper.py --single <brand_name>")
                print("[INFO] Available brands:", ', '.join(get_brands_to_scrape()))
                sys.exit(1)
            
            brand_name = sys.argv[2]
            max_pages = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3].isdigit() else None
            start_page = int(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4].isdigit() else 1
            
            print(f"[SINGLE] ULTRA-FAST single brand scraping for: {brand_name}")
            print(f"[INFO] Starting from page: {start_page}")
            print(f"[INFO] Max pages: {max_pages or 'NO LIMIT - ALL PAGES'}")
            print(f"[INFO] Ultra-fast mode: NO DELAYS, MAXIMUM SPEED!")
            print(f"[INFO] This will be the fastest possible scraping for {brand_name}!")
            
            result = scrape_single_brand_ultra_fast(brand_name, max_pages, start_page)
            
        # ULTRA-FAST Parallel scraping
        elif sys.argv[1] == '--parallel':
            max_workers = 3  # Default to 3 brands at a time (more stable)
            ultra_fast = True  # Enable ultra-fast by default
            
            # Check for ultra-fast flag
            if len(sys.argv) > 2 and sys.argv[2] == '--ultra-fast':
                ultra_fast = True
                max_workers = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3].isdigit() else 3
            elif len(sys.argv) > 2 and sys.argv[2].isdigit():
                max_workers = int(sys.argv[2])
                ultra_fast = True  # Always use ultra-fast for parallel
            
            mode_text = "ULTRA-FAST" if ultra_fast else "STANDARD"
            print(f"[PARALLEL] {mode_text} parallel scraping with {max_workers} brands at once!")
            print(f"[INFO] Will scrape ALL brands (except Wander Doll) in parallel")
            print(f"[INFO] {max_workers} brands will be processed simultaneously")
            print(f"[INFO] Ultra-fast mode: {'ENABLED' if ultra_fast else 'DISABLED'}")
            print(f"[INFO] NO PAGE LIMIT - Will scrape ALL reviews!")
            print(f"[INFO] This will be MUCH faster than sequential scraping!")
            
            result = bulk_scrape_parallel_5(max_workers=max_workers, ultra_fast=ultra_fast)
            
        # All brands scraping (sequential)
        elif sys.argv[1] == '--all':
            print("[INFO] Scraping ALL brands (except Wander Doll) sequentially")
            print("[INFO] NO PAGE LIMIT - Will scrape ALL reviews!")
            result = bulk_scrape()
            
        # ULTRA-FAST Sequential scraping (most stable)
        elif sys.argv[1] == '--sequential':
            print("[SEQUENTIAL] ULTRA-FAST sequential scraping - MOST STABLE OPTION!")
            print("[INFO] Will scrape ALL brands (except Wander Doll) one by one")
            print("[INFO] Ultra-fast mode: ENABLED for each brand")
            print("[INFO] NO PAGE LIMIT - Will scrape ALL reviews!")
            print("[INFO] This avoids threading issues and is very reliable!")
            
            result = bulk_scrape_sequential_ultra_fast()
            
    else:
        # Default: scrape all brands (except Wander Doll) with NO page limit
        brands_to_scrape = get_brands_to_scrape()
        print("[START] Sequential scraping started - NO PAGE LIMIT")
        print("[INFO] Tip: Use '--parallel' for ULTRA-FAST parallel scraping (3 brands at once)!")
        print("[INFO] Tip: Use '--sequential' for ULTRA-FAST sequential scraping (most stable)!")
        
        result = bulk_scrape()
    
    # Exit with appropriate code
    if result and result['failed_brands'] == 0:
        print("\n[SUCCESS] All brands scraped successfully!")
        sys.exit(0)
    elif result:
        print(f"\n[WARNING] {result['failed_brands']} brands failed")
        sys.exit(1)
    else:
        print("\n[ERROR] Scraping failed or was interrupted")
        sys.exit(1)

if __name__ == "__main__":
    main()
