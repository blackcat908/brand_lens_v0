# AI Report Generation Setup

## Overview
The AI Report feature is now fully integrated with OpenAI GPT-3.5 Turbo. Users can generate custom AI-powered reports based on their filtered review data.

## Setup Instructions

### 1. Get OpenAI API Key
1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in to your account
3. Navigate to API Keys section
4. Create a new API key
5. Copy the API key (starts with `sk-`)

### 2. Configure Environment Variable

#### For Local Development:
```bash
# Windows (PowerShell)
$env:OPENAI_API_KEY="your-api-key-here"

# Windows (Command Prompt)
set OPENAI_API_KEY=your-api-key-here

# Linux/Mac
export OPENAI_API_KEY="your-api-key-here"
```

#### For Production (Railway/Heroku):
Add the environment variable in your deployment platform:
- Variable Name: `OPENAI_API_KEY`
- Value: `your-api-key-here`

### 3. Test the Integration
```bash
cd backend
python test_ai_integration.py
```

## Features

### ✅ What's Working:
- **AI Report Generation**: Custom prompts with GPT-3.5 Turbo
- **Smart Filtering**: Applies current filters to reviews
- **Fallback Mode**: Works without API key (basic analysis)
- **PDF/Word Export**: Download reports in multiple formats
- **Error Handling**: Graceful fallback if AI service fails

### 🎯 How to Use:
1. Go to any brand detail page
2. Apply filters (category, rating, date, keyword)
3. Click "AI Report" button
4. Enter your custom prompt
5. Click "Generate Report"
6. Download as PDF or Word

### 💡 Example Prompts:
- "Analyze sizing complaints and provide recommendations"
- "What are the main quality issues mentioned by customers?"
- "Summarize the positive feedback themes"
- "Identify trends in customer satisfaction over time"
- "What improvements should we prioritize based on reviews?"

## Configuration

The AI service can be configured in `backend/config.py`:

```python
AI_CONFIG = {
    'openai_api_key': os.environ.get('OPENAI_API_KEY'),
    'model': 'gpt-3.5-turbo',           # AI model to use
    'max_tokens': 2000,                 # Maximum response length
    'temperature': 0.7,                 # Creativity level (0-1)
    'max_reviews_per_request': 50,      # Reviews limit per request
}
```

## Cost Estimation

- **GPT-3.5 Turbo**: ~$0.002 per 1K tokens
- **Average Report**: ~500-1000 tokens
- **Cost per Report**: ~$0.001-0.002
- **100 Reports**: ~$0.10-0.20

## Troubleshooting

### Common Issues:

1. **"No OpenAI API key found"**
   - Set the `OPENAI_API_KEY` environment variable
   - Restart the backend server

2. **"AI Service Test Failed"**
   - Check your API key is valid
   - Verify you have OpenAI credits
   - Check internet connection

3. **Fallback Report Generated**
   - API key not configured or invalid
   - OpenAI service temporarily unavailable
   - Still provides useful analysis

### Logs:
Check backend logs for AI service messages:
```
[AI-SERVICE] OpenAI client initialized successfully
[AI-SERVICE] Generating report for brand-name with 25 reviews
[AI-SERVICE] Report generated successfully for brand-name
```

## Security Notes

- Never commit API keys to version control
- Use environment variables for configuration
- Monitor API usage and costs
- Consider rate limiting for production use

## Next Steps

1. **Set up API key** for full AI functionality
2. **Test with real data** using the frontend
3. **Customize prompts** for your specific needs
4. **Monitor usage** and costs
5. **Consider upgrading** to GPT-4 for enhanced analysis
