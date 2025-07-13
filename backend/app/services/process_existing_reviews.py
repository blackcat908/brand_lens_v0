import json
from database import SessionLocal, Review, BrandSourceUrl, BrandKeyword, GlobalKeyword, init_db
from sqlalchemy.exc import IntegrityError

# Initialize tables if not already created
init_db()

# Load exported data
with open('backend/sqlite_export.json', 'r') as f:
    data = json.load(f)

session = SessionLocal()

# Import reviews
for row in data.get('reviews', []):
    try:
        review = Review(**{k: row[k] for k in row if k in Review.__table__.columns.keys()})
        session.add(review)
    except IntegrityError:
        session.rollback()
    except Exception as e:
        print(f"Review error: {e}")
session.commit()

# Import brand_source_urls
for row in data.get('brand_source_urls', []):
    try:
        obj = BrandSourceUrl(**{k: row[k] for k in row if k in BrandSourceUrl.__table__.columns.keys()})
        session.merge(obj)
    except Exception as e:
        print(f"BrandSourceUrl error: {e}")
session.commit()

# Import brand_keywords
for row in data.get('brand_keywords', []):
    try:
        obj = BrandKeyword(**{k: row[k] for k in row if k in BrandKeyword.__table__.columns.keys()})
        session.merge(obj)
    except Exception as e:
        print(f"BrandKeyword error: {e}")
session.commit()

# Import global_keywords
for row in data.get('global_keywords', []):
    try:
        obj = GlobalKeyword(**{k: row[k] for k in row if k in GlobalKeyword.__table__.columns.keys()})
        session.merge(obj)
    except Exception as e:
        print(f"GlobalKeyword error: {e}")
session.commit()

session.close()
print("Migration complete.") 