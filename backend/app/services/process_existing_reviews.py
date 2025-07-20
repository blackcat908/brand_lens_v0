import json
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../models')))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../')))
from database import SessionLocal, Review, get_brand_keywords, get_global_keywords, init_db
from sqlalchemy.exc import IntegrityError
from sentiment_analyzer import SentimentAnalyzer
from nltk.stem import WordNetLemmatizer
from nltk.tokenize import word_tokenize
import nltk

# Initialize tables if not already created
init_db()

# Ensure NLTK resources are available
try:
    nltk.data.find('corpora/wordnet')
except LookupError:
    nltk.download('wordnet')
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')
lemmatizer = WordNetLemmatizer()
session = SessionLocal()
sentiment_analyzer = SentimentAnalyzer()

def keyword_in_text(keyword, review_text, review_lemmas_set, lemmatizer):
    """
    Check if a keyword is present in the review text.
    Handles both single words and phrases with proper lemmatization.
    """
    keyword_clean = keyword.lower().strip()
    
    # For single words: check if lemmatized form exists in review lemmas
    if ' ' not in keyword_clean:
        keyword_lemma = lemmatizer.lemmatize(keyword_clean)
        match = keyword_lemma in review_lemmas_set
        print(f"[DEBUG] Single word '{keyword}' (lemma: '{keyword_lemma}') in review -> {match}")
        return match
    
    # For phrases: check if all words in phrase exist in review (lemmatized)
    phrase_tokens = word_tokenize(keyword_clean)
    phrase_lemmas = [lemmatizer.lemmatize(token) for token in phrase_tokens]
    
    # Check if all lemmatized words in the phrase exist in the review
    all_words_present = all(lemma in review_lemmas_set for lemma in phrase_lemmas)
    
    # Additional check: ensure the phrase appears in the original text (case-insensitive)
    phrase_in_text = keyword_clean in review_text.lower()
    
    match = all_words_present and phrase_in_text
    return match

all_reviews = session.query(Review).all()
updated = 0
for review in all_reviews:
    review_text = review.review or ''
    brand_name = str(review.brand_name)
    # Fetch keywords
    brand_keywords = get_brand_keywords(session, brand_name)
    global_keywords = get_global_keywords(session)
    
    # Clean and lemmatize review text
    review_text_clean = review_text.lower().strip()
    review_tokens = word_tokenize(review_text_clean)
    review_lemmas = [lemmatizer.lemmatize(token) for token in review_tokens]
    review_lemmas_set = set(review_lemmas)
    
    matched_categories = set()
    matched_keywords = set()
    
    # Brand-specific categories
    for category, keywords in brand_keywords.items():
        for kw in keywords:
            if keyword_in_text(kw, review_text_clean, review_lemmas_set, lemmatizer):
                matched_categories.add(category)
                matched_keywords.add(kw)
                print(f"[MATCH] Found keyword '{kw}' for category '{category}' in review: {review_text[:100]}...")
    
    # Global categories
    for category, keywords in global_keywords.items():
        for kw in keywords:
            if keyword_in_text(kw, review_text_clean, review_lemmas_set, lemmatizer):
                matched_categories.add(category)
                matched_keywords.add(kw)
                print(f"[MATCH] Found keyword '{kw}' for category '{category}' in review: {review_text[:100]}...")
    
    # Update both categories and matched_keywords
    setattr(review, 'categories', json.dumps(sorted(matched_categories)))
    setattr(review, 'matched_keywords', json.dumps(sorted(matched_keywords)))
    updated += 1

session.commit()
session.close()
print(f"Retagged {updated} reviews with new categories and keywords.") 