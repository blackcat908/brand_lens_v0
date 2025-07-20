import sqlite3
import json

conn = sqlite3.connect('backend/migrations/reviews.db')
c = conn.cursor()

# Use a category filter that matches your frontend/backend
category_filter = "Sizing & Fit Mentions"

# Check a range of reviews for JAKI London that should match
for row in c.execute("SELECT id, categories FROM reviews WHERE brand_name = 'JAKI London' AND categories LIKE '%Sizing & Fit Mentions%' LIMIT 20"):
    print(f"ID: {row[0]}")
    try:
        cats = json.loads(row[1])
        print("  Categories list:")
        for cat in cats:
            print(f"    {repr(cat)}")
        print(f"  Filter: {repr(category_filter)}")
        print(f"  Match: {category_filter in cats}")
    except Exception as e:
        print(f"  JSON loads: ERROR ({e})")

conn.close() 