const { Telegraf } = require('telegraf');
const Anthropic = require('@anthropic-ai/sdk');

// Initialize the bot with your Telegram bot token
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Store conversation history per user (in production, use a database)
const conversations = new Map();

// Store usage tracking per user
const userUsage = new Map();

// Maximum conversation history to maintain (to manage costs)
const MAX_HISTORY = 10;

// Usage limits configuration
const USAGE_LIMITS = {
  // Your Telegram user ID (get it by messaging @userinfobot)
  AUTHORIZED_USER_ID: process.env.AUTHORIZED_USER_ID ? parseInt(process.env.AUTHORIZED_USER_ID) : null,
  
  // Daily limits
  DAILY_MESSAGE_LIMIT: parseInt(process.env.DAILY_MESSAGE_LIMIT) || 100,
  DAILY_TOKEN_LIMIT: parseInt(process.env.DAILY_TOKEN_LIMIT) || 50000,
  
  // Hourly limits (prevents spam)
  HOURLY_MESSAGE_LIMIT: parseInt(process.env.HOURLY_MESSAGE_LIMIT) || 20,
  
  // Rate limiting (messages per minute)
  RATE_LIMIT_PER_MINUTE: parseInt(process.env.RATE_LIMIT_PER_MINUTE) || 5,
  
  // Maximum message length
  MAX_MESSAGE_LENGTH: parseInt(process.env.MAX_MESSAGE_LENGTH) || 4000
};

// System prompt for Claude
const SYSTEM_PROMPT = `You are a helpful AI assistant running on Telegram. Keep responses concise but informative. Use emojis sparingly and only when they add value. If asked about your capabilities, mention that you're Claude Sonnet 4 running in a Telegram bot.`;

// Usage tracking functions
function getUserUsage(userId) {
  if (!userUsage.has(userId)) {
    userUsage.set(userId, {
      daily: { messages: 0, tokens: 0, date: new Date().toDateString() },
      hourly: { messages: 0, hour: new Date().getHours() },
      rateLimiting: { messages: 0, minute: new Date().getMinutes() }
    });
  }
  return userUsage.get(userId);
}

function resetDailyUsage(usage) {
  const today = new Date().toDateString();
  if (usage.daily.date !== today) {
    usage.daily = { messages: 0, tokens: 0, date: today };
  }
}

function resetHourlyUsage(usage) {
  const currentHour = new Date().getHours();
  if (usage.hourly.hour !== currentHour) {
    usage.hourly = { messages: 0, hour: currentHour };
  }
}

function resetRateLimiting(usage) {
  const currentMinute = new Date().getMinutes();
  if (usage.rateLimiting.minute !== currentMinute) {
    usage.rateLimiting = { messages: 0, minute: currentMinute };
  }
}

function checkUsageLimits(userId) {
  // Check if user is authorized
  if (USAGE_LIMITS.AUTHORIZED_USER_ID && userId !== USAGE_LIMITS.AUTHORIZED_USER_ID) {
    return { allowed: false, reason: 'unauthorized' };
  }
  
  const usage = getUserUsage(userId);
  
  // Reset counters if needed
  resetDailyUsage(usage);
  resetHourlyUsage(usage);
  resetRateLimiting(usage);
  
  // Check rate limiting
  if (usage.rateLimiting.messages >= USAGE_LIMITS.RATE_LIMIT_PER_MINUTE) {
    return { allowed: false, reason: 'rate_limit' };
  }
  
  // Check hourly limit
  if (usage.hourly.messages >= USAGE_LIMITS.HOURLY_MESSAGE_LIMIT) {
    return { allowed: false, reason: 'hourly_limit' };
  }
  
  // Check daily limits
  if (usage.daily.messages >= USAGE_LIMITS.DAILY_MESSAGE_LIMIT) {
    return { allowed: false, reason: 'daily_message_limit' };
  }
  
  if (usage.daily.tokens >= USAGE_LIMITS.DAILY_TOKEN_LIMIT) {
    return { allowed: false, reason: 'daily_token_limit' };
  }
  
  return { allowed: true };
}

function updateUsage(userId, tokens = 0) {
  const usage = getUserUsage(userId);
  
  // Increment counters
  usage.daily.messages++;
  usage.daily.tokens += tokens;
  usage.hourly.messages++;
  usage.rateLimiting.messages++;
}

// Helper function to get conversation history
function getConversation(userId) {
  if (!conversations.has(userId)) {
    conversations.set(userId, []);
  }
  return conversations.get(userId);
}

// Helper function to add message to conversation
function addToConversation(userId, role, content) {
  const conversation = getConversation(userId);
  conversation.push({ role, content });
  
  // Keep only recent messages to manage costs
  if (conversation.length > MAX_HISTORY * 2) {
    conversation.splice(0, 2); // Remove oldest user-assistant pair
  }
}

// Helper function to split long messages
function splitMessage(text, maxLength = 4000) {
  if (text.length <= maxLength) {
    return [text];
  }
  
  const chunks = [];
  let currentChunk = '';
  const sentences = text.split('. ');
  
  for (const sentence of sentences) {
    if ((currentChunk + sentence + '. ').length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence + '. ';
      } else {
        // Handle very long sentences
        const words = sentence.split(' ');
        let wordChunk = '';
        for (const word of words) {
          if ((wordChunk + word + ' ').length > maxLength) {
            if (wordChunk) {
              chunks.push(wordChunk.trim());
              wordChunk = word + ' ';
            } else {
              chunks.push(word); // Single very long word
            }
          } else {
            wordChunk += word + ' ';
          }
        }
        if (wordChunk) {
          currentChunk = wordChunk;
        }
      }
    } else {
      currentChunk += sentence + '. ';
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

// Start command
bot.start((ctx) => {
  const userId = ctx.from.id;
  
  // Check if user is authorized
  if (USAGE_LIMITS.AUTHORIZED_USER_ID && userId !== USAGE_LIMITS.AUTHORIZED_USER_ID) {
    return ctx.reply('❌ This bot is private and only available to authorized users.');
  }
  
  const welcomeMessage = `🤖 *Claude Sonnet 4 Bot*

Hello ${ctx.from.first_name}! I'm powered by Claude Sonnet 4, Anthropic's smart and efficient AI model.

I can help you with:
• Answering questions
• Writing and editing
• Analysis and research
• Creative tasks
• Coding assistance
• And much more!

Just send me a message and I'll respond using Claude Sonnet 4.

*Commands:*
/start - Show this welcome message
/clear - Clear our conversation history
/usage - Check your current usage limits
/help - Show help information
/stats - Show bot statistics

*Your Usage Limits:*
• Daily: ${USAGE_LIMITS.DAILY_MESSAGE_LIMIT} messages, ${USAGE_LIMITS.DAILY_TOKEN_LIMIT} tokens
• Hourly: ${USAGE_LIMITS.HOURLY_MESSAGE_LIMIT} messages
• Rate limit: ${USAGE_LIMITS.RATE_LIMIT_PER_MINUTE} messages per minute`;
  
  ctx.replyWithMarkdown(welcomeMessage);
});

// Help command
bot.help((ctx) => {
  const userId = ctx.from.id;
  
  // Check if user is authorized
  if (USAGE_LIMITS.AUTHORIZED_USER_ID && userId !== USAGE_LIMITS.AUTHORIZED_USER_ID) {
    return ctx.reply('❌ This bot is private and only available to authorized users.');
  }
  
  const helpMessage = `*How to use Claude Sonnet 4 Bot:*

*Basic Usage:*
Just type your question or request, and I'll respond using Claude Sonnet 4.

*What I can do:*
• Answer questions on any topic
• Help with writing and editing
• Provide coding assistance
• Creative writing and brainstorming
• Analysis and explanations
• Math and problem solving

*Commands:*
/start - Welcome message
/clear - Clear conversation history
/usage - Check your current usage limits
/help - This help message
/stats - Show conversation statistics

*Tips:*
• Be specific in your requests for better results
• I remember our conversation context
• Use /clear if you want to start fresh
• Long messages will be split automatically

*Powered by Claude Sonnet 4 via Anthropic API*`;
  
  ctx.replyWithMarkdown(helpMessage);
});

// Clear conversation command
bot.command('clear', (ctx) => {
  const userId = ctx.from.id;
  
  // Check if user is authorized
  if (USAGE_LIMITS.AUTHORIZED_USER_ID && userId !== USAGE_LIMITS.AUTHORIZED_USER_ID) {
    return ctx.reply('❌ This bot is private and only available to authorized users.');
  }
  
  conversations.delete(userId);
  ctx.reply('✅ Conversation history cleared! Starting fresh.');
});

// Usage command
bot.command('usage', (ctx) => {
  const userId = ctx.from.id;
  
  // Check if user is authorized
  if (USAGE_LIMITS.AUTHORIZED_USER_ID && userId !== USAGE_LIMITS.AUTHORIZED_USER_ID) {
    return ctx.reply('❌ This bot is private and only available to authorized users.');
  }
  
  const usage = getUserUsage(userId);
  resetDailyUsage(usage);
  resetHourlyUsage(usage);
  
  const dailyPercentage = Math.round((usage.daily.messages / USAGE_LIMITS.DAILY_MESSAGE_LIMIT) * 100);
  const tokenPercentage = Math.round((usage.daily.tokens / USAGE_LIMITS.DAILY_TOKEN_LIMIT) * 100);
  
  let statusEmoji = '✅';
  if (dailyPercentage > 80 || tokenPercentage > 80) statusEmoji = '⚠️';
  if (dailyPercentage >= 100 || tokenPercentage >= 100) statusEmoji = '❌';
  
  const usageMessage = `${statusEmoji} *Your Current Usage:*

*Today (${usage.daily.date}):*
• Messages: ${usage.daily.messages}/${USAGE_LIMITS.DAILY_MESSAGE_LIMIT} (${dailyPercentage}%)
• Tokens: ${usage.daily.tokens}/${USAGE_LIMITS.DAILY_TOKEN_LIMIT} (${tokenPercentage}%)

*This Hour:*
• Messages: ${usage.hourly.messages}/${USAGE_LIMITS.HOURLY_MESSAGE_LIMIT}

*Limits:*
• Rate limit: ${USAGE_LIMITS.RATE_LIMIT_PER_MINUTE} messages per minute
• Daily reset: Midnight
• Hourly reset: Every hour

${usage.daily.messages >= USAGE_LIMITS.DAILY_MESSAGE_LIMIT ? '⚠️ Daily message limit reached!' : ''}
${usage.daily.tokens >= USAGE_LIMITS.DAILY_TOKEN_LIMIT ? '⚠️ Daily token limit reached!' : ''}
${usage.hourly.messages >= USAGE_LIMITS.HOURLY_MESSAGE_LIMIT ? '⚠️ Hourly limit reached!' : ''}`.trim();
  
  ctx.replyWithMarkdown(usageMessage);
});

// Stats command
bot.command('stats', (ctx) => {
  const userId = ctx.from.id;
  
  // Check if user is authorized
  if (USAGE_LIMITS.AUTHORIZED_USER_ID && userId !== USAGE_LIMITS.AUTHORIZED_USER_ID) {
    return ctx.reply('❌ This bot is private and only available to authorized users.');
  }
  
  const conversationLength = getConversation(userId).length;
  const usage = getUserUsage(userId);
  
  const statsMessage = `📊 *Your Conversation Stats:*

*Current Session:*
• Messages in history: ${conversationLength / 2} exchanges
• Memory limit: ${MAX_HISTORY} exchanges

*Usage Summary:*
• Today's messages: ${usage.daily.messages}
• Today's tokens: ${usage.daily.tokens}
• Current hour: ${usage.hourly.messages} messages

*Tips:*
• Use /clear to reset conversation history
• Longer conversations use more tokens
• History helps maintain context`;
  
  ctx.replyWithMarkdown(statsMessage);
});

// Handle all text messages
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const userMessage = ctx.message.text;
  
  // Skip if it's a command
  if (userMessage.startsWith('/')) {
    return;
  }
  
  // Check message length
  if (userMessage.length > USAGE_LIMITS.MAX_MESSAGE_LENGTH) {
    return ctx.reply(`❌ Message too long! Please keep messages under ${USAGE_LIMITS.MAX_MESSAGE_LENGTH} characters. Your message: ${userMessage.length} characters.`);
  }
  
  // Check usage limits
  const usageCheck = checkUsageLimits(userId);
  if (!usageCheck.allowed) {
    let errorMessage = '';
    switch (usageCheck.reason) {
      case 'unauthorized':
        errorMessage = '❌ This bot is private and only available to authorized users.';
        break;
      case 'rate_limit':
        errorMessage = '⏱️ You\'re sending messages too quickly! Please wait a minute before sending another message.';
        break;
      case 'hourly_limit':
        errorMessage = `⏰ You've reached your hourly limit of ${USAGE_LIMITS.HOURLY_MESSAGE_LIMIT} messages. Please try again next hour.`;
        break;
      case 'daily_message_limit':
        errorMessage = `📅 You've reached your daily limit of ${USAGE_LIMITS.DAILY_MESSAGE_LIMIT} messages. Limit resets at midnight.`;
        break;
      case 'daily_token_limit':
        errorMessage = `🎯 You've reached your daily token limit of ${USAGE_LIMITS.DAILY_TOKEN_LIMIT}. Limit resets at midnight.`;
        break;
      default:
        errorMessage = '❌ Usage limit reached. Please try again later.';
    }
    return ctx.reply(errorMessage);
  }
  
  try {
    // Show typing indicator
    await ctx.sendChatAction('typing');
    
    // Get conversation history
    const conversation = getConversation(userId);
    
    // Prepare messages for Claude
    const messages = [
      ...conversation,
      { role: 'user', content: userMessage }
    ];
    
    // Call Claude Sonnet 4 API
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: messages,
      system: SYSTEM_PROMPT,
      temperature: 0.7
    });
    
    const assistantReply = response.content[0].text;
    const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
    
    // Update usage tracking
    updateUsage(userId, tokensUsed);
    
    // Add messages to conversation history
    addToConversation(userId, 'user', userMessage);
    addToConversation(userId, 'assistant', assistantReply);
    
    // Split and send long messages
    const chunks = splitMessage(assistantReply);
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) {
        // Add small delay between chunks
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      await ctx.reply(chunks[i]);
    }
    
    // Show usage warning if approaching limits
    const usage = getUserUsage(userId);
    const messageWarning = usage.daily.messages >= USAGE_LIMITS.DAILY_MESSAGE_LIMIT * 0.9;
    const tokenWarning = usage.daily.tokens >= USAGE_LIMITS.DAILY_TOKEN_LIMIT * 0.9;
    
    if (messageWarning || tokenWarning) {
      const warningMessage = `⚠️ *Usage Warning:*\n${usage.daily.messages}/${USAGE_LIMITS.DAILY_MESSAGE_LIMIT} messages, ${usage.daily.tokens}/${USAGE_LIMITS.DAILY_TOKEN_LIMIT} tokens used today.`;
      await ctx.replyWithMarkdown(warningMessage);
    }
    
  } catch (error) {
    console.error('Error calling Claude API:', error);
    
    let errorMessage = '❌ Sorry, I encountered an error processing your request.';
    
    if (error.status === 401) {
      errorMessage += '\n\n🔑 API key issue - please check the bot configuration.';
    } else if (error.status === 429) {
      errorMessage += '\n\n⏱️ Rate limit reached - please try again in a moment.';
    } else if (error.status === 500) {
      errorMessage += '\n\n🔧 Anthropic API is experiencing issues - please try again later.';
    } else if (error.message?.includes('timeout')) {
      errorMessage += '\n\n⏱️ Request timed out - please try a shorter message.';
    }
    
    ctx.reply(errorMessage);
  }
});

// Handle other message types with more helpful responses
bot.on('photo', (ctx) => {
  const userId = ctx.from.id;
  if (USAGE_LIMITS.AUTHORIZED_USER_ID && userId !== USAGE_LIMITS.AUTHORIZED_USER_ID) {
    return ctx.reply('❌ This bot is private and only available to authorized users.');
  }
  ctx.reply('📸 I can see you sent a photo, but I can only process text messages right now. Please describe what you\'d like help with or what\'s in the image!');
});

bot.on('document', (ctx) => {
  const userId = ctx.from.id;
  if (USAGE_LIMITS.AUTHORIZED_USER_ID && userId !== USAGE_LIMITS.AUTHORIZED_USER_ID) {
    return ctx.reply('❌ This bot is private and only available to authorized users.');
  }
  ctx.reply('📄 I can see you sent a document, but I can only process text messages right now. You can copy and paste text content for me to analyze!');
});

bot.on('voice', (ctx) => {
  const userId = ctx.from.id;
  if (USAGE_LIMITS.AUTHORIZED_USER_ID && userId !== USAGE_LIMITS.AUTHORIZED_USER_ID) {
    return ctx.reply('❌ This bot is private and only available to authorized users.');
  }
  ctx.reply('🎤 I can see you sent a voice message, but I can only process text messages right now. Please type your message!');
});

bot.on('sticker', (ctx) => {
  const userId = ctx.from.id;
  if (USAGE_LIMITS.AUTHORIZED_USER_ID && userId !== USAGE_LIMITS.AUTHORIZED_USER_ID) {
    return ctx.reply('❌ This bot is private and only available to authorized users.');
  }
  ctx.reply('😄 Nice sticker! But I can only process text messages. What would you like to chat about?');
});

// Error handling with more detailed logging
bot.catch((err, ctx) => {
  console.error(`Bot error for user ${ctx.from?.id}:`, err);
  const errorId = Date.now();
  console.error(`Error ID: ${errorId}`, err.stack);
  
  ctx.reply(`❌ An unexpected error occurred. Please try again.\n\nError ID: ${errorId}\n\nIf this persists, please contact the bot administrator.`);
});

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  bot.stop('SIGTERM');
});

// Health check endpoint (if running on a server)
if (process.env.NODE_ENV === 'production') {
  const http = require('http');
  const port = process.env.PORT || 3000;
  
  http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        activeUsers: conversations.size
      }));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  }).listen(port, () => {
    console.log(`Health check server running on port ${port}`);
  });
}

// Start the bot
bot.launch().then(() => {
  console.log('🤖 Claude Sonnet 4 Telegram Bot is running!');
  console.log(`📊 Configuration:
  - Max history: ${MAX_HISTORY} exchanges
  - Daily message limit: ${USAGE_LIMITS.DAILY_MESSAGE_LIMIT}
  - Daily token limit: ${USAGE_LIMITS.DAILY_TOKEN_LIMIT}
  - Hourly message limit: ${USAGE_LIMITS.HOURLY_MESSAGE_LIMIT}
  - Rate limit: ${USAGE_LIMITS.RATE_LIMIT_PER_MINUTE} per minute
  - Max message length: ${USAGE_LIMITS.MAX_MESSAGE_LENGTH}
  - Authorized user: ${USAGE_LIMITS.AUTHORIZED_USER_ID || 'Public access'}`);
}).catch(err => {
  console.error('Failed to start bot:', err);
  process.exit(1);
});

module.exports = bot;
