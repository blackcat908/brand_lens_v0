import sqlite3
import json
import os

# Path to the SQLite database
SQLITE_DB_PATH = os.path.join(os.path.dirname(__file__), '../migrations/reviews.db')
# Output JSON file path
OUTPUT_JSON_PATH = os.path.join(os.path.dirname(__file__), 'sqlite_export.json')

def fetch_all(cursor, table):
    cursor.execute(f'SELECT * FROM {table}')
    columns = [desc[0] for desc in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]

def main():
    conn = sqlite3.connect(SQLITE_DB_PATH)
    cursor = conn.cursor()

    data = {}
    for table in ['reviews', 'brand_source_urls', 'brand_keywords', 'global_keywords']:
        try:
            data[table] = fetch_all(cursor, table)
        except Exception as e:
            print(f"Error fetching {table}: {e}")
            data[table] = []

    with open(OUTPUT_JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"Exported data to {OUTPUT_JSON_PATH}")

    conn.close()

if __name__ == '__main__':
    main() 