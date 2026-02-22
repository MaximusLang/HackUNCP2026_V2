const { GoogleGenAI } = require('@google/genai');
const mongoose = require('mongoose');
const Event = require('./models/Event');
require('dotenv').config();

/**
 * chatbot.js
 * Integrates Gemini AI with function calling and Mongoose for assignment suggestions.
 */

// Configure the client
// User will provide API key via .env or manual insertion
const API_KEY = process.env.GEMINI_API_KEY || 'YAIzaSyCrlJCsYVDwBqTFZA9l_t3zBvHsXxaRbcE';
const genAI = new GoogleGenAI(API_KEY);

// Define the function declaration for the model
const scheduleMeetingFunctionDeclaration = {
  name: 'schedule_meeting',
  description: 'Schedules a meeting with specified attendees at a given time and date.',
  parameters: {
    type: 'OBJECT',
    properties: {
      attendees: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description: 'List of people attending the meeting.',
      },
      date: {
        type: 'STRING',
        description: 'Date of the meeting (e.g., "2024-07-29")',
      },
      time: {
        type: 'STRING',
        description: 'Time of the meeting (e.g., "15:00")',
      },
      topic: {
        type: 'STRING',
        description: 'The subject or topic of the meeting.',
      },
    },
    required: ['attendees', 'date', 'time', 'topic'],
  },
};

/**
 * Main function to generate content and handle function calls
 * @param {string} userPrompt The user's message to the chatbot.
 */
async function generateChatResponse(userPrompt) {
  try {
    const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        tools: [{
          functionDeclarations: [scheduleMeetingFunctionDeclaration]
        }],
    });

    const result = await model.generateContent(userPrompt);
    const response = result.response;
    
    // Check for function calls in the response
    const calls = response.functionCalls();
    
    if (calls && calls.length > 0) {
      const functionCall = calls[0];
      console.log(`Function to call: ${functionCall.name}`);
      console.log(`Arguments: ${JSON.stringify(functionCall.args)}`);
      
      // Integration with Mongoose: If a meeting is scheduled, we could save it as an event
      if (functionCall.name === 'schedule_meeting') {
          const { attendees, date, time, topic } = functionCall.args;
          
          // Create a new event in the database
          const newEvent = new Event({
              uid: `chat-${Date.now()}`,
              summary: `Meeting: ${topic}`,
              start: new Date(`${date}T${time}:00`),
              description: `Attendees: ${attendees.join(', ')}`,
              status: 'current'
          });
          
          await newEvent.save();
          return `I've scheduled your meeting about "${topic}" for ${date} at ${time} and saved it to your planner.`;
      }
    } else {
      return response.text();
    }
  } catch (error) {
    console.error("Chatbot Error:", error);
    return "Sorry, I encountered an error while processing your request.";
  }
}

// Example usage if run directly
if (require.main === module) {
  const prompt = 'Schedule a meeting with Bob and Alice for 03/27/2025 at 10:00 AM about the Q3 planning.';
  generateChatResponse(prompt).then(console.log).catch(console.error);
}

module.exports = { generateChatResponse };
