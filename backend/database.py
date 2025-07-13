import os
from sqlalchemy import create_engine, Column, Integer, String, Float, Text, UniqueConstraint, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, scoped_session
from sqlalchemy.exc import IntegrityError
from contextlib import contextmanager
from typing import Optional, List, Dict, Any
import json
from config import DATABASE_CONFIG

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
    brand_id = Column(String(100), primary_key=True)
    source_url = Column(String(500), nullable=False)
    brand_display_name = Column(String(255))

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

def get_brand_source_url(db, brand_id: str) -> Optional[Dict[str, Any]]:
    obj = db.query(BrandSourceUrl).filter(BrandSourceUrl.brand_id == brand_id.strip()).first()
    return obj.__dict__ if obj else None

def set_brand_source_url(db, brand_id: str, source_url: str, brand_display_name: str = None) -> Dict[str, Any]:
    obj = db.query(BrandSourceUrl).filter(BrandSourceUrl.brand_id == brand_id).first()
    if obj:
        obj.source_url = source_url
        obj.brand_display_name = brand_display_name
    else:
        obj = BrandSourceUrl(brand_id=brand_id, source_url=source_url, brand_display_name=brand_display_name)
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
    objs = db.query(BrandSourceUrl.brand_id).distinct().order_by(BrandSourceUrl.brand_id).all()
    return [o[0] for o in objs]

def delete_brand_and_reviews(brand_id):
    with get_db_session() as db:
        db.query(Review).filter(Review.brand_name.ilike(f'%{brand_id}%')).delete(synchronize_session=False)
        db.query(BrandSourceUrl).filter(BrandSourceUrl.brand_id.ilike(f'%{brand_id}%')).delete(synchronize_session=False)
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