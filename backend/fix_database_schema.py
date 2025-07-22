#!/usr/bin/env python3
"""
Database Schema Fix Script
Safely fixes the reviews table schema without losing any data.
"""

import os
import sys
from sqlalchemy import create_engine, text
from config import DATABASE_CONFIG

def fix_reviews_table():
    """Fix the reviews table schema to properly handle auto-incrementing IDs."""
    
    print("🔧 Starting database schema fix...")
    
    # Connect to database
    engine = create_engine(DATABASE_CONFIG['url'])
    
    with engine.connect() as conn:
        try:
            # Start transaction
            trans = conn.begin()
            
            print("📊 Checking current table structure...")
            
            # Check if id column exists and its current state
            result = conn.execute(text("""
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns 
                WHERE table_name = 'reviews' AND column_name = 'id'
            """))
            
            id_column_info = result.fetchone()
            
            if not id_column_info:
                print("❌ Error: 'id' column not found in reviews table")
                return False
            
            print(f"📋 Current id column: {id_column_info}")
            
            # Check how many records have NULL ids
            result = conn.execute(text("SELECT COUNT(*) FROM reviews WHERE id IS NULL"))
            null_count = result.fetchone()[0]
            
            print(f"📈 Found {null_count} records with NULL id values")
            
            if null_count == 0:
                print("✅ All records already have proper IDs. No fix needed.")
                return True
            
            # Step 1: Create a sequence for the id column
            print("🔢 Creating sequence for id column...")
            conn.execute(text("""
                CREATE SEQUENCE IF NOT EXISTS reviews_id_seq
                START WITH 1
                INCREMENT BY 1
                NO MINVALUE
                NO MAXVALUE
                CACHE 1
            """))
            
            # Step 2: Update existing NULL ids with sequential numbers
            print("🔄 Updating existing records with sequential IDs...")
            conn.execute(text("""
                UPDATE reviews 
                SET id = nextval('reviews_id_seq') 
                WHERE id IS NULL
            """))
            
            # Step 3: Make id column NOT NULL and set it as primary key
            print("🔒 Making id column NOT NULL and setting as primary key...")
            conn.execute(text("ALTER TABLE reviews ALTER COLUMN id SET NOT NULL"))
            
            # Step 4: Set up auto-increment for future inserts
            print("⚙️ Setting up auto-increment for future inserts...")
            conn.execute(text("ALTER TABLE reviews ALTER COLUMN id SET DEFAULT nextval('reviews_id_seq')"))
            
            # Step 5: Set the sequence to start from the highest existing id + 1
            print("🎯 Setting sequence to continue from highest existing ID...")
            conn.execute(text("""
                SELECT setval('reviews_id_seq', COALESCE((SELECT MAX(id) FROM reviews), 0) + 1, false)
            """))
            
            # Step 6: Add primary key constraint if it doesn't exist
            print("🔑 Adding primary key constraint...")
            conn.execute(text("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.table_constraints 
                        WHERE constraint_name = 'reviews_pkey' AND table_name = 'reviews'
                    ) THEN
                        ALTER TABLE reviews ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);
                    END IF;
                END $$;
            """))
            
            # Commit the transaction
            trans.commit()
            
            # Verify the fix
            print("✅ Verifying the fix...")
            result = conn.execute(text("SELECT COUNT(*) FROM reviews WHERE id IS NULL"))
            remaining_null = result.fetchone()[0]
            
            if remaining_null == 0:
                print("🎉 SUCCESS: All records now have proper IDs!")
                
                # Show some sample records
                result = conn.execute(text("SELECT id, brand_name FROM reviews ORDER BY id LIMIT 5"))
                samples = result.fetchall()
                print("📝 Sample records:")
                for sample in samples:
                    print(f"   ID: {sample[0]}, Brand: {sample[1]}")
                
                return True
            else:
                print(f"❌ ERROR: {remaining_null} records still have NULL ids")
                return False
                
        except Exception as e:
            print(f"❌ Error during schema fix: {e}")
            trans.rollback()
            return False

def update_insert_statement():
    """Update the scraper to include id in INSERT statements."""
    
    print("📝 Updating scraper INSERT statement...")
    
    # Read the current scraper file
    scraper_file = "trustpilot_scraper.py"
    
    try:
        with open(scraper_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Find and replace the INSERT statement
        old_insert = """text("INSERT INTO reviews (brand_name, customer_name, review, rating, date, review_link, sentiment_score, sentiment_category, categories, matched_keywords) VALUES (:brand_name, :customer_name, :review, :rating, :date, :review_link, :sentiment_score, :sentiment_category, :categories, :matched_keywords)")"""
        
        new_insert = """text("INSERT INTO reviews (id, brand_name, customer_name, review, rating, date, review_link, sentiment_score, sentiment_category, categories, matched_keywords) VALUES (DEFAULT, :brand_name, :customer_name, :review, :rating, :date, :review_link, :sentiment_score, :sentiment_category, :categories, :matched_keywords)")"""
        
        if old_insert in content:
            content = content.replace(old_insert, new_insert)
            
            with open(scraper_file, 'w', encoding='utf-8') as f:
                f.write(content)
            
            print("✅ Updated INSERT statement to include id column")
            return True
        else:
            print("⚠️ Could not find the INSERT statement to update")
            return False
            
    except Exception as e:
        print(f"❌ Error updating scraper: {e}")
        return False

if __name__ == "__main__":
    print("🚀 Database Schema Fix Tool")
    print("=" * 50)
    
    # Fix the database schema
    if fix_reviews_table():
        print("\n✅ Database schema fixed successfully!")
        
        # Update the scraper
        if update_insert_statement():
            print("✅ Scraper updated successfully!")
        else:
            print("⚠️ Scraper update failed - you may need to update manually")
        
        print("\n🎉 All fixes completed!")
        print("\n📋 Next steps:")
        print("1. Commit and push the updated scraper")
        print("2. Test the scraper with a small brand")
        print("3. Verify duplicate detection works properly")
        
    else:
        print("\n❌ Database schema fix failed!")
        sys.exit(1) 