# Claude Telegram Bot

A powerful Telegram bot powered by Claude Sonnet 4 from Anthropic.

## Features

- 🤖 Powered by Claude Sonnet 4
- 💬 Conversation memory and context
- 📊 Usage tracking and limits
- ⚡ Rate limiting protection
- 🔒 Authorization system
- 📱 Smart message splitting
- 🎯 Comprehensive error handling

## Setup

### 1. Prerequisites

- Node.js 18+ 
- Telegram bot token from [@BotFather](https://t.me/botfather)
- Anthropic API key from [Anthropic Console](https://console.anthropic.com)

### 2. Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/claude-telegram-bot.git
cd claude-telegram-bot

# Install dependencies
npm install

# Set up environment variables (see below)
# Start the bot
npm start
```

### 3. Environment Variables

Create a `.env` file or set these environment variables:

```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
ANTHROPIC_API_KEY=your_anthropic_api_key
AUTHORIZED_USER_ID=your_telegram_user_id
DAILY_MESSAGE_LIMIT=100
DAILY_TOKEN_LIMIT=50000
HOURLY_MESSAGE_LIMIT=20
RATE_LIMIT_PER_MINUTE=5
MAX_MESSAGE_LENGTH=4000
NODE_ENV=production
PORT=3000
```

### 4. Getting Your Tokens

#### Telegram Bot Token:
1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Send `/newbot`
3. Follow the instructions to create your bot
4. Copy the token provided

#### Your Telegram User ID:
1. Message [@userinfobot](https://t.me/userinfobot) on Telegram
2. Copy your user ID number

#### Anthropic API Key:
1. Go to [Anthropic Console](https://console.anthropic.com)
2. Sign up/sign in
3. Go to API Keys section
4. Create a new API key

## Usage

### Commands

- `/start` - Welcome message and bot info
- `/help` - Show help information
- `/clear` - Clear conversation history
- `/usage` - Check current usage limits
- `/stats` - Show conversation statistics

### Features

- **Conversation Memory**: The bot remembers your conversation context
- **Usage Limits**: Built-in protection against API abuse
- **Smart Responses**: Handles long messages by splitting them intelligently
- **Error Handling**: Comprehensive error messages and recovery

## Configuration

You can customize various limits in the environment variables:

- `DAILY_MESSAGE_LIMIT`: Maximum messages per day
- `DAILY_TOKEN_LIMIT`: Maximum tokens per day
- `HOURLY_MESSAGE_LIMIT`: Maximum messages per hour
- `RATE_LIMIT_PER_MINUTE`: Maximum messages per minute
- `MAX_MESSAGE_LENGTH`: Maximum characters per message

## Deployment

### Replit (Recommended for beginners)
1. Import this repository to Replit
2. Set up environment variables in Secrets tab
3. Run the project

### Other Platforms
- Heroku
- Railway
- DigitalOcean App Platform
- AWS Lambda
- Google Cloud Functions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

If you encounter issues:
1. Check the logs for error messages
2. Verify your environment variables
3. Ensure your API keys are valid
4. Check your usage limits

## Changelog

### v1.0.0
- Initial release with Claude Sonnet 4 integration
- Usage tracking and limits
- Conversation memory
- Comprehensive error handling
