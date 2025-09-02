import sqlite3
import os

def check_database():
    # Check if reviews.db exists
    if os.path.exists('reviews.db'):
        print("Database file exists: reviews.db")
        
        # Connect to SQLite database
        conn = sqlite3.connect('reviews.db')
        cursor = conn.cursor()
        
        # Get all table names
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        print(f"Tables found: {[table[0] for table in tables]}")
        
        # Check each table structure
        for table in tables:
            table_name = table[0]
            print(f"\nTable: {table_name}")
            cursor.execute(f"PRAGMA table_info({table_name})")
            columns = cursor.fetchall()
            for col in columns:
                print(f"  {col[1]} ({col[2]})")
        
        # Check if there's a brands table or similar
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%brand%';")
        brand_tables = cursor.fetchall()
        if brand_tables:
            print(f"\nBrand-related tables: {[table[0] for table in brand_tables]}")
            
            # Check the first brand table
            brand_table = brand_tables[0][0]
            cursor.execute(f"SELECT * FROM {brand_table} LIMIT 5")
            rows = cursor.fetchall()
            print(f"\nSample data from {brand_table}:")
            for row in rows:
                print(f"  {row}")
        
        conn.close()
    else:
        print("Database file not found: reviews.db")

if __name__ == "__main__":
    check_database()
