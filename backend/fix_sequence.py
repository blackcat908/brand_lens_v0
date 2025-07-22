#!/usr/bin/env python3
"""
Fix PostgreSQL Sequence Script
Sets the sequence to start from the actual highest ID in the database.
"""

import os
import sys
from sqlalchemy import create_engine, text
from config import DATABASE_CONFIG

def fix_sequence():
    """Fix the sequence to start from the actual highest ID in the database."""
    
    print("🔧 Fixing PostgreSQL sequence...")
    
    # Connect to database
    engine = create_engine(DATABASE_CONFIG['url'])
    
    with engine.connect() as conn:
        try:
            # Start transaction
            trans = conn.begin()
            
            print("📊 Finding the highest ID in the database...")
            
            # Get the highest ID from the reviews table
            result = conn.execute(text("SELECT MAX(id) FROM reviews"))
            max_id = result.fetchone()[0]
            
            if max_id is None:
                print("❌ Error: No records found in reviews table")
                return False
            
            print(f"📈 Highest ID found: {max_id}")
            
            # Set the sequence to start from max_id + 1
            next_id = max_id + 1
            print(f"🎯 Setting sequence to start from: {next_id}")
            
            conn.execute(text(f"SELECT setval('reviews_id_seq', {next_id}, false)"))
            
            # Commit the transaction
            trans.commit()
            
            print("🎉 SUCCESS: Sequence fixed!")
            print(f"📋 Next new record will get ID: {next_id}")
            
            return True
                
        except Exception as e:
            print(f"❌ Error fixing sequence: {e}")
            trans.rollback()
            return False

if __name__ == "__main__":
    print("🚀 PostgreSQL Sequence Fix Tool")
    print("=" * 50)
    
    if fix_sequence():
        print("\n✅ Sequence fixed successfully!")
        print("\n📋 Next steps:")
        print("1. Test inserting a new review")
        print("2. Verify it gets the correct ID")
        print("3. Check that duplicate detection still works")
    else:
        print("\n❌ Sequence fix failed!")
        sys.exit(1) 