import os
from sqlalchemy import create_engine, Column, Integer, String, Float, Text, UniqueConstraint, JSON, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, scoped_session
from sqlalchemy.exc import IntegrityError
from contextlib import contextmanager
from typing import Optional, List, Dict, Any
import json
from config import DATABASE_CONFIG
import logging
logger = logging.getLogger(__name__)

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
    categories = Column(Text)  # JSON array as string
    __table_args__ = (
        UniqueConstraint('brand_name', 'review_link', name='uq_brand_review_link'),
    )

class BrandSourceUrl(Base):
    __tablename__ = 'brand_source_urls'
    brand_name = Column(String(255), primary_key=True)  # Use raw brand name as PK
    source_url = Column(String(500), nullable=False)
    # No need for brand_display_name, use brand_name everywhere

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
    Base.metadata.create_all(bind=engine)

def get_brand_source_url(db, brand_name: str) -> Optional[Dict[str, Any]]:
    obj = db.query(BrandSourceUrl).filter(BrandSourceUrl.brand_name == brand_name.strip()).first()
    if obj:
        return {
            'brand_name': obj.brand_name,
            'source_url': obj.source_url
        }
    return None

def set_brand_source_url(db, brand_name: str, source_url: str) -> Dict[str, Any]:
    obj = db.query(BrandSourceUrl).filter(BrandSourceUrl.brand_name == brand_name).first()
    if obj:
        obj.source_url = source_url
    else:
        obj = BrandSourceUrl(brand_name=brand_name, source_url=source_url)
        db.add(obj)
    db.commit()
    return obj.__dict__

def add_review(db, brand_name: str, customer_name: str, review: str, 
               date: str = None, rating: int = None, review_link: str = None,
               sentiment_score: float = None, sentiment_category: str = None,
               categories: str = None) -> bool:
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

def get_reviews_by_brand(db, brand_name: str) -> List[Dict[str, Any]]:
    objs = db.query(Review).filter(Review.brand_name == brand_name).order_by(Review.id.desc()).all()
    return [o.__dict__ for o in objs]

def get_all_reviews(db) -> List[Dict[str, Any]]:
    objs = db.query(Review).order_by(Review.id.desc()).all()
    return [o.__dict__ for o in objs]

def get_brands(db) -> List[str]:
    objs = db.query(BrandSourceUrl.brand_name).distinct().order_by(BrandSourceUrl.brand_name).all()
    return [o[0] for o in objs]

def delete_brand_and_reviews(brand_name):
    with get_db_session() as db:
        review_count = db.query(Review).filter(Review.brand_name == brand_name).count()
        logger.info(f"[DELETE] Found {review_count} reviews for brand: '{brand_name}'")
        result = db.execute(text("DELETE FROM reviews WHERE brand_name = :brand_name"), {"brand_name": brand_name})
        logger.info(f"[DELETE] Removed {result.rowcount} reviews for brand: '{brand_name}'")
        logger.info(f"[DELETE] Deleting brand source url for brand: '{brand_name}'")
        db.query(BrandSourceUrl).filter(BrandSourceUrl.brand_name == brand_name).delete(synchronize_session=False)
        logger.info(f"[DELETE] Deleting brand keywords for brand: '{brand_name}'")
        deleted_keywords = db.query(BrandKeyword).filter(BrandKeyword.brand_id == brand_name).delete(synchronize_session=False)
        logger.info(f"[DELETE] Deleted {deleted_keywords} brand keywords for brand: '{brand_name}'")
        try:
            logger.info(f"[DELETE] Deleting analytics for brand: '{brand_name}'")
            analytics_result = db.execute(text("DELETE FROM analytics WHERE brand_name = :brand_name"), {"brand_name": brand_name})
            logger.info(f"[DELETE] Deleted analytics rows: {analytics_result.rowcount}")
        except Exception as e:
            logger.info(f"[DELETE] Analytics table not found or error deleting analytics: {e}")
        db.commit()
        logger.info(f"[DELETE] All data for brand '{brand_name}' deleted.")

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