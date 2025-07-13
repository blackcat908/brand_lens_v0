import re
from textblob import TextBlob
import nltk
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
import string

# Download required NLTK data
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')

try:
    nltk.data.find('corpora/stopwords')
except LookupError:
    nltk.download('stopwords')

class SentimentAnalyzer:
    def __init__(self):
        self.stop_words = set(stopwords.words('english'))
        
    def clean_text(self, text):
        """Clean and preprocess text for analysis"""
        if not text:
            return ""
        
        # Convert to lowercase
        text = text.lower()
        
        # Remove punctuation
        text = text.translate(str.maketrans('', '', string.punctuation))
        
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        
        return text
    
    def extract_keywords(self, text, top_n=10):
        """Extract keywords from text"""
        if not text:
            return []
        
        # Clean text
        clean_text = self.clean_text(text)
        
        # Tokenize
        tokens = word_tokenize(clean_text)
        
        # Remove stopwords and short words
        keywords = [word for word in tokens if word not in self.stop_words and len(word) > 2]
        
        # Count frequency
        from collections import Counter
        keyword_counts = Counter(keywords)
        
        # Return top keywords
        return [word for word, count in keyword_counts.most_common(top_n)]
    
    def analyze_sentiment(self, text):
        """Analyze sentiment of text using TextBlob"""
        if not text:
            return 0.0
        
        blob = TextBlob(text)
        return blob.sentiment.polarity
    
    def get_sentiment_category(self, sentiment_score):
        """Convert sentiment score to category"""
        if sentiment_score > 0.3:
            return "positive"
        elif sentiment_score <= -0.1:
            return "negative"
        else:
            return "neutral"
    
    def process_review(self, review_text):
        """Process a review and return sentiment analysis results"""
        sentiment_score = self.analyze_sentiment(review_text)
        sentiment_category = self.get_sentiment_category(sentiment_score)
        keywords = self.extract_keywords(review_text)
        
        return {
            'sentiment_score': sentiment_score,
            'sentiment_category': sentiment_category,
            'keywords': keywords
        } 