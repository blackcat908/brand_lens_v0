import sqlite3
import json

conn = sqlite3.connect('backend/migrations/reviews.db')
c = conn.cursor()

# IDs: 7400 and 7402 are returned by the API. Add a few more IDs that are not returned by the API but have Sizing & Fit Mentions.
ids_to_check = [7400, 7402, 8392, 8390, 8389]  # Add more IDs as needed

for row in c.execute(f"SELECT id, categories FROM reviews WHERE id IN ({','.join(map(str, ids_to_check))})"):
    print(f"ID: {row[0]}, repr: {repr(row[1])}")
    try:
        cats = json.loads(row[1])
        print("  JSON loads: OK")
    except Exception as e:
        print(f"  JSON loads: ERROR ({e})")

conn.close() 