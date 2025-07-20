#!/usr/bin/env python3
"""
Local script to add database indexes
"""

import psycopg2
import sys

def add_indexes():
    """Add indexes to improve query performance"""
    print("Adding database indexes for better performance...")
    
    # Database connection details
    db_url = "postgresql://trustpilot_reviews_55fi_user:PpcbpA3oDt2hrFurDSrPGkdzgzg2c2gQ@dpg-d1r5ok8dl3ps73f3oh70-a.oregon-postgres.render.com/trustpilot_reviews_55fi"
    
    try:
        # Connect to database
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor()
        
        print("✅ Connected to database successfully!")
        
        # List of indexes to create
        indexes = [
            ("idx_reviews_brand_name", "CREATE INDEX IF NOT EXISTS idx_reviews_brand_name ON reviews(brand_name)"),
            ("idx_reviews_rating", "CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating)"),
            ("idx_reviews_date", "CREATE INDEX IF NOT EXISTS idx_reviews_date ON reviews(date)"),
            ("idx_reviews_sentiment_category", "CREATE INDEX IF NOT EXISTS idx_reviews_sentiment_category ON reviews(sentiment_category)"),
            ("idx_reviews_categories", "CREATE INDEX IF NOT EXISTS idx_reviews_categories ON reviews(categories)"),
            ("idx_reviews_brand_rating", "CREATE INDEX IF NOT EXISTS idx_reviews_brand_rating ON reviews(brand_name, rating)"),
            ("idx_reviews_brand_sentiment", "CREATE INDEX IF NOT EXISTS idx_reviews_brand_sentiment ON reviews(brand_name, sentiment_category)"),
            ("idx_reviews_brand_date", "CREATE INDEX IF NOT EXISTS idx_reviews_brand_date ON reviews(brand_name, date)"),
            ("idx_reviews_review_link", "CREATE INDEX IF NOT EXISTS idx_reviews_review_link ON reviews(review_link)"),
            ("idx_reviews_customer_name", "CREATE INDEX IF NOT EXISTS idx_reviews_customer_name ON reviews(customer_name)")
        ]
        
        for index_name, sql in indexes:
            print(f"Adding {index_name}...")
            cursor.execute(sql)
            print(f"  ✅ {index_name} added successfully!")
        
        conn.commit()
        print("\n✅ All indexes added successfully!")
        
        # Check existing indexes
        cursor.execute("""
            SELECT indexname 
            FROM pg_indexes 
            WHERE tablename = 'reviews'
            ORDER BY indexname
        """)
        
        existing_indexes = cursor.fetchall()
        print("\n📋 Existing indexes on 'reviews' table:")
        for row in existing_indexes:
            print(f"  - {row[0]}")
        
        cursor.close()
        conn.close()
        
        return True
        
    except ImportError:
        print("❌ psycopg2 not installed. Installing...")
        print("Run: pip install psycopg2-binary")
        return False
    except Exception as e:
        print(f"❌ Error adding indexes: {e}")
        return False

if __name__ == "__main__":
    success = add_indexes()
    
    if success:
        print("\n🎉 Database optimization complete!")
        print("Your queries should now be much faster, especially:")
        print("  - Filtering by brand")
        print("  - Filtering by rating")
        print("  - Filtering by date range")
        print("  - Filtering by sentiment")
        print("  - Filtering by categories (sizing, fit, etc.)")
        print("  - Searching by customer name")
    else:
        print("\n❌ Failed to add indexes. Check the error above.") 