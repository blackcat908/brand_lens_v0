#!/usr/bin/env python3
"""
Simple AI test to verify OpenAI API key works
"""

import os
from openai import OpenAI

def test_openai_connection():
    """Test OpenAI API connection"""
    
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        print("❌ No API key found. Set OPENAI_API_KEY environment variable.")
        return False
    
    print(f"✅ API key found: {api_key[:20]}...")
    
    try:
        client = OpenAI(api_key=api_key)
        
        # Simple test request
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "user", "content": "Say 'Hello, AI integration is working!'"}
            ],
            max_tokens=50
        )
        
        result = response.choices[0].message.content
        print(f"✅ OpenAI API Test Successful!")
        print(f"Response: {result}")
        return True
        
    except Exception as e:
        print(f"❌ OpenAI API Test Failed: {e}")
        return False

if __name__ == "__main__":
    test_openai_connection()
