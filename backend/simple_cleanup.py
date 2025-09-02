#!/usr/bin/env python3
"""
Simple database cleanup script using sqlite3 directly.
This will delete all reviews except Wander Doll and update URLs.
"""

import sqlite3
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def clean_database_simple():
    """Clean database using sqlite3 directly"""
    try:
        # Connect to database
        conn = sqlite3.connect('reviews.db')
        cursor = conn.cursor()
        
        # Step 1: Get current state
        cursor.execute("SELECT COUNT(*) FROM reviews")
        total_reviews = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM reviews WHERE brand_name = ?", ("Wander Doll",))
        wander_doll_reviews = cursor.fetchone()[0]
        
        other_reviews = total_reviews - wander_doll_reviews
        
        logger.info(f"Current database state:")
        logger.info(f"  Total reviews: {total_reviews}")
        logger.info(f"  Wander Doll reviews: {wander_doll_reviews}")
        logger.info(f"  Other brand reviews: {other_reviews}")
        
        if other_reviews == 0:
            logger.info("Database is already clean - only Wander Doll reviews exist.")
            return
        
        # Step 2: Delete all reviews except Wander Doll
        logger.info("Deleting all reviews except Wander Doll...")
        cursor.execute("DELETE FROM reviews WHERE brand_name != ?", ("Wander Doll",))
        deleted_count = cursor.rowcount
        logger.info(f"Successfully deleted {deleted_count} reviews")
        
        # Step 3: Update all brand source URLs to include languages=all
        logger.info("Updating brand source URLs to include languages=all...")
        
        # Get all brand source URLs
        cursor.execute("SELECT brand_name, source_url FROM brand_source_urls")
        brand_urls = cursor.fetchall()
        
        updated_count = 0
        for brand_name, source_url in brand_urls:
            if brand_name == "Wander Doll":
                continue  # Skip Wander Doll
            
            # Check if URL already has languages=all
            if "languages=all" in source_url:
                logger.info(f"  {brand_name}: Already has languages=all")
                continue
            
            # Add languages=all parameter
            if "?" in source_url:
                # URL already has parameters, add languages=all
                new_url = source_url.replace("?", "?languages=all&")
            else:
                # URL has no parameters, add languages=all
                new_url = source_url + "?languages=all"
            
            # Update the URL
            cursor.execute(
                "UPDATE brand_source_urls SET source_url = ? WHERE brand_name = ?",
                (new_url, brand_name)
            )
            
            logger.info(f"  {brand_name}: {source_url} → {new_url}")
            updated_count += 1
        
        logger.info(f"Updated {updated_count} brand URLs to include languages=all")
        
        # Step 4: Verify the cleanup
        cursor.execute("SELECT COUNT(*) FROM reviews")
        remaining_reviews = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM reviews WHERE brand_name = ?", ("Wander Doll",))
        remaining_wander_doll = cursor.fetchone()[0]
        
        logger.info(f"Cleanup verification:")
        logger.info(f"  Remaining reviews: {remaining_reviews}")
        logger.info(f"  Remaining Wander Doll reviews: {remaining_wander_doll}")
        
        if remaining_reviews == remaining_wander_doll:
            logger.info("✓ Database cleanup successful!")
            logger.info("✓ All brand URLs updated to include languages=all")
            logger.info("✓ Ready for fresh start scraping!")
        else:
            logger.error("❌ Database cleanup failed - unexpected state!")
        
        # Commit changes and close
        conn.commit()
        conn.close()
        
    except Exception as e:
        logger.error(f"Error during database cleanup: {e}")
        if 'conn' in locals():
            conn.close()
        raise

def main():
    """Main function"""
    try:
        logger.info("=== Simple Database Cleanup for Fresh Start ===")
        logger.info("This script will:")
        logger.info("1. Delete ALL reviews except Wander Doll")
        logger.info("2. Update all brand URLs to include languages=all")
        logger.info("3. Prepare database for fresh start scraping")
        
        # Ask for confirmation
        response = input("\n⚠️  WARNING: This will delete ALL reviews except Wander Doll! ⚠️\nDo you want to proceed? (yes/no): ").lower().strip()
        if response not in ['yes', 'y']:
            logger.info("Operation cancelled by user")
            return
        
        clean_database_simple()
        logger.info("=== Database cleanup completed successfully ===")
        
    except Exception as e:
        logger.error(f"Script failed: {e}")

if __name__ == "__main__":
    main()
