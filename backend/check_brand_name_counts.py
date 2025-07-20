import sqlite3

conn = sqlite3.connect('backend/migrations/reviews.db')
c = conn.cursor()

exact = c.execute("SELECT COUNT(*) FROM reviews WHERE brand_name = 'JAKI London'").fetchone()[0]
ci_trim = c.execute("SELECT COUNT(*) FROM reviews WHERE LOWER(TRIM(brand_name)) = 'jaki london'").fetchone()[0]

print('Exact match:', exact)
print('Case-insensitive, trimmed match:', ci_trim)

conn.close() 