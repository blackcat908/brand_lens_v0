import sqlite3
import json

conn = sqlite3.connect('backend/migrations/reviews.db')
c = conn.cursor()

category_filter = 'Sizing & Fit Mentions'
count = 0
for row in c.execute("SELECT categories FROM reviews WHERE brand_name = 'JAKI London'"):
    try:
        cats = json.loads(row[0])
        if category_filter in cats:
            count += 1
    except Exception as e:
        pass
print(f"Reviews for 'JAKI London' with category '{category_filter}':", count)
conn.close() 