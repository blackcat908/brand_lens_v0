import os
from sqlalchemy import create_engine, Column, Integer, String, Float, Text, UniqueConstraint, JSON, func, desc, asc
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, scoped_session
from sqlalchemy.exc import IntegrityError, OperationalError
from contextlib import contextmanager
from typing import Optional, List, Dict, Any
import json
from config import DATABASE_CONFIG
import time
print(f"Connecting to database: {DATABASE_CONFIG['url']}")

Base = declarative_base()
engine = create_engine(DATABASE_CONFIG['url'], echo=DATABASE_CONFIG.get('echo', False))
SessionLocal = scoped_session(sessionmaker(bind=engine))

class Review(Base):
    __tablename__ = 'reviews'
    id = Column(Integer, primary_key=True, autoincrement=True)
    brand_name = Column(String(100), nullable=False)
    customer_name = Column(String(255))
    review = Column(Text, nullable=False)
    date = Column(String(100))
    rating = Column(Integer)
    review_link = Column(String(500))
    sentiment_score = Column(Float)
    sentiment_category = Column(String(20))
    categories = Column(Text)  # JSON array as string (category names)
    matched_keywords = Column(Text)  # JSON array as string (matched keywords)
    __table_args__ = (
        UniqueConstraint('brand_name', 'review_link', name='uq_brand_review_link'),
    )

class BrandSourceUrl(Base):
    __tablename__ = 'brand_source_urls'
    brand_name = Column(String(255), primary_key=True)  # Use raw brand name as PK
    source_url = Column(String(500), nullable=False)
    logo_data = Column(Text)  # Store logo as base64 string (easier than BLOB for SQLite)
    logo_filename = Column(String(255))  # Store original filename
    logo_mime_type = Column(String(100))  # Store MIME type (image/jpeg, image/png, etc.)
    # No brand_display_name

class BrandKeyword(Base):
    __tablename__ = 'brand_keywords'
    id = Column(Integer, primary_key=True, autoincrement=True)
    brand_id = Column(String(100), nullable=False)
    category = Column(String(100), nullable=False)
    keywords = Column(Text, nullable=False)  # JSON array as string
    __table_args__ = (
        UniqueConstraint('brand_id', 'category', name='uq_brand_category'),
    )

class GlobalKeyword(Base):
    __tablename__ = 'global_keywords'
    category = Column(String(100), primary_key=True)
    keywords = Column(Text, nullable=False)  # JSON array as string

# Session/context management
@contextmanager
def get_db_session():
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

def init_db():
    """Initialize database"""
    print(f"Connecting to database: {DATABASE_CONFIG['url']}")
    Base.metadata.create_all(bind=engine)
    print("Database connection successful!")

def get_brand_source_url(db, brand_name: str) -> Optional[Dict[str, Any]]:
    obj = db.query(BrandSourceUrl).filter(BrandSourceUrl.brand_name == brand_name.strip()).first()
    if obj:
        return {
            'brand_name': obj.brand_name,
            'source_url': obj.source_url,
            'logo_data': obj.logo_data,
            'logo_filename': obj.logo_filename,
            'logo_mime_type': obj.logo_mime_type
        }
    return None

def set_brand_source_url(db, brand_name: str, source_url: str, logo_data: str = None, 
                        logo_filename: str = None, logo_mime_type: str = None) -> Dict[str, Any]:
    obj = db.query(BrandSourceUrl).filter(BrandSourceUrl.brand_name == brand_name).first()
    if obj:
        obj.source_url = source_url
        if logo_data is not None:
            obj.logo_data = logo_data
        if logo_filename is not None:
            obj.logo_filename = logo_filename
        if logo_mime_type is not None:
            obj.logo_mime_type = logo_mime_type
    else:
        obj = BrandSourceUrl(
            brand_name=brand_name, 
            source_url=source_url,
            logo_data=logo_data,
            logo_filename=logo_filename,
            logo_mime_type=logo_mime_type
        )
        db.add(obj)
    db.commit()
    return {
        'brand_name': obj.brand_name,
        'source_url': obj.source_url,
        'logo_data': obj.logo_data,
        'logo_filename': obj.logo_filename,
        'logo_mime_type': obj.logo_mime_type
    }

def add_review(db, brand_name: str, customer_name: str, review: str, 
               date: Optional[str] = None, rating: Optional[int] = None, review_link: Optional[str] = None,
               sentiment_score: Optional[float] = None, sentiment_category: Optional[str] = None,
               categories: Optional[str] = None) -> bool:
    obj = Review(
        brand_name=brand_name,
        customer_name=customer_name,
        review=review,
        date=date,
        rating=rating,
        review_link=review_link,
        sentiment_score=sentiment_score,
        sentiment_category=sentiment_category,
        categories=categories
    )
    try:
        db.add(obj)
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        return False

# OPTIMIZED: Use database-level filtering and pagination
def get_reviews_by_brand_optimized(db, brand_name: str, page: int = 1, per_page: int = 20, 
                                  rating_filter: Optional[int] = None, sentiment_filter: Optional[str] = None,
                                  date_from: Optional[str] = None, date_to: Optional[str] = None,
                                  category_filter: Optional[str] = None) -> Dict[str, Any]:
    """Optimized query that uses database indexes and filtering, now with robust category filtering"""
    query = db.query(Review).filter(Review.brand_name == brand_name)
    
    # Apply filters at database level
    if rating_filter is not None:
        query = query.filter(Review.rating == rating_filter)
    if sentiment_filter:
        query = query.filter(Review.sentiment_category == sentiment_filter)
    if date_from:
        query = query.filter(Review.date >= date_from)
    if date_to:
        query = query.filter(Review.date <= date_to)
    # Do not filter by category at the DB level if using SQLite (JSON string)
    # We'll filter in Python after fetching
    
    # Get total count for pagination (before category filter)
    total_count = query.count()
    
    # Apply pagination and ordering
    query = query.order_by(desc(Review.date), desc(Review.id))
    query = query.offset((page - 1) * per_page).limit(per_page)
    
    reviews = query.all()
    reviews_dicts = [r.__dict__ for r in reviews]
    
    # Robust category filtering in Python (for SQLite/JSON string)
    if category_filter and category_filter.lower() != 'all':
        def normalize(s):
            return s.strip().lower() if isinstance(s, str) else s
        filtered_reviews = []
        for r in reviews_dicts:
            try:
                cats = r.get('categories')
                if cats:
                    import json
                    cat_list = json.loads(cats) if isinstance(cats, str) else cats
                    if isinstance(cat_list, list) and any(normalize(category_filter) == normalize(cat) for cat in cat_list):
                        filtered_reviews.append(r)
            except Exception:
                continue
        reviews_dicts = filtered_reviews
        # Update total_count to reflect filtered count
        total_count = len(reviews_dicts)
    return {
        'reviews': reviews_dicts,
        'total': total_count,
        'page': page,
        'per_page': per_page
    }

# OPTIMIZED: Get brand analytics using database aggregation
def get_brand_analytics_optimized(db, brand_name: str) -> Dict[str, Any]:
    """Optimized analytics query using database aggregation"""
    
    # Get total reviews count
    total_reviews = db.query(func.count(Review.id)).filter(Review.brand_name == brand_name).scalar()
    
    if total_reviews == 0:
        return {
            'brand': brand_name,
            'total_reviews': 0,
            'average_rating': 0,
            'sentiment_breakdown': {'positive': 0, 'negative': 0, 'neutral': 0, 'total_analyzed': 0},
            'average_sentiment_score': 0,
            'monthly_trends': [],
            'top_keywords': [],
            'last_updated': None,
            'sizing_fit_mentions': 0
        }
    
    # Get average rating using database aggregation
    avg_rating_result = db.query(func.avg(Review.rating)).filter(
        Review.brand_name == brand_name,
        Review.rating.isnot(None)
    ).scalar()
    avg_rating = round(float(avg_rating_result), 1) if avg_rating_result else 0
    
    # Get sentiment breakdown using database aggregation
    sentiment_counts = db.query(
        Review.sentiment_category,
        func.count(Review.id)
    ).filter(
        Review.brand_name == brand_name,
        Review.sentiment_category.isnot(None)
    ).group_by(Review.sentiment_category).all()
    
    sentiment_breakdown = {'positive': 0, 'negative': 0, 'neutral': 0}
    total_analyzed = 0
    for category, count in sentiment_counts:
        sentiment_breakdown[category] = count
        total_analyzed += count
    
    # Get average sentiment score
    avg_sentiment_result = db.query(func.avg(Review.sentiment_score)).filter(
        Review.brand_name == brand_name,
        Review.sentiment_score.isnot(None)
    ).scalar()
    avg_sentiment = round(float(avg_sentiment_result), 3) if avg_sentiment_result else 0
    
    # Get last updated date
    last_updated_result = db.query(func.max(Review.date)).filter(
        Review.brand_name == brand_name
    ).scalar()
    last_updated = last_updated_result if last_updated_result else None
    
    return {
        'brand': brand_name,
        'total_reviews': total_reviews,
        'average_rating': avg_rating,
        'sentiment_breakdown': sentiment_breakdown,
        'average_sentiment_score': avg_sentiment,
        'last_updated': last_updated,
        'total_analyzed': total_analyzed
    }

# OPTIMIZED: Get brands with review counts using database aggregation
def get_brands_with_counts_optimized(db) -> List[Dict[str, Any]]:
    """Optimized query to get brands with their review counts"""
    # Use database aggregation to get brand counts
    brand_counts = db.query(
        Review.brand_name,
        func.count(Review.id).label('review_count')
    ).group_by(Review.brand_name).all()
    
    result = []
    for brand_name, review_count in brand_counts:
        result.append({
            "brand": brand_name,
            "review_count": review_count
        })
    
    return result

# Legacy functions for backward compatibility
def get_reviews_by_brand(db, brand_name: str) -> List[Dict[str, Any]]:
    objs = db.query(Review).filter(Review.brand_name == brand_name).order_by(Review.id.desc()).all()
    return [o.__dict__ for o in objs]

def get_all_reviews(db) -> List[Dict[str, Any]]:
    objs = db.query(Review).order_by(Review.id.desc()).all()
    return [o.__dict__ for o in objs]

def get_brands(db) -> List[str]:
    objs = db.query(BrandSourceUrl.brand_name).distinct().order_by(BrandSourceUrl.brand_name).all()
    return [o[0] for o in objs]

def delete_brand_and_reviews(brand_id):
    with get_db_session() as db:
        db.query(Review).filter(Review.brand_name.ilike(f'%{brand_id}%')).delete(synchronize_session=False)
        db.query(BrandSourceUrl).filter(BrandSourceUrl.brand_name.ilike(f'%{brand_id}%')).delete(synchronize_session=False)
        db.commit()

def get_brand_keywords(db, brand_id: str) -> dict:
    objs = db.query(BrandKeyword).filter(BrandKeyword.brand_id == brand_id).all()
    result = {}
    for obj in objs:
        try:
            result[obj.category] = json.loads(obj.keywords)
        except Exception:
            result[obj.category] = []
    return result

def set_brand_keywords(db, brand_id: str, category: str, keywords: list[str]) -> None:
    obj = db.query(BrandKeyword).filter(BrandKeyword.brand_id == brand_id, BrandKeyword.category == category).first()
    if obj:
        obj.keywords = json.dumps(keywords)
    else:
        obj = BrandKeyword(brand_id=brand_id, category=category, keywords=json.dumps(keywords))
        db.add(obj)
    db.commit()

def get_global_keywords(db) -> dict:
    objs = db.query(GlobalKeyword).all()
    result = {}
    for obj in objs:
        try:
            result[obj.category] = json.loads(obj.keywords)
        except Exception:
            result[obj.category] = []
    return result

def set_global_keywords(db, category: str, keywords: list[str]) -> None:
    obj = db.query(GlobalKeyword).filter(GlobalKeyword.category == category).first()
    if obj:
        obj.keywords = json.dumps(keywords)
    else:
        obj = GlobalKeyword(category=category, keywords=json.dumps(keywords))
        db.add(obj)
    db.commit() 

def update_brand_logo(db, brand_name: str, logo_data: str, logo_filename: str, logo_mime_type: str) -> bool:
    """Update or add logo for a brand."""
    obj = db.query(BrandSourceUrl).filter(BrandSourceUrl.brand_name == brand_name).first()
    if obj:
        obj.logo_data = logo_data
        obj.logo_filename = logo_filename
        obj.logo_mime_type = logo_mime_type
        db.commit()
        return True
    return False

def delete_brand_logo(db, brand_name: str) -> bool:
    """Delete logo for a brand."""
    obj = db.query(BrandSourceUrl).filter(BrandSourceUrl.brand_name == brand_name).first()
    if obj:
        obj.logo_data = None
        obj.logo_filename = None
        obj.logo_mime_type = None
        db.commit()
        return True
    return False

def get_brand_logo(db, brand_name: str) -> Optional[Dict[str, Any]]:
    """Get logo data for a brand."""
    obj = db.query(BrandSourceUrl).filter(BrandSourceUrl.brand_name == brand_name).first()
    if obj and obj.logo_data:
        return {
            'logo_data': obj.logo_data,
            'logo_filename': obj.logo_filename,
            'logo_mime_type': obj.logo_mime_type
        }
    return None 