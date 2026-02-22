const { GoogleGenAI } = require('@google/genai');
const mongoose = require('mongoose');
const Assignment = require('./models/Assignment');
const Course = require('./models/Course');
require('dotenv').config();

/**
 * chatbot.js - Academic Strategy Advisor
 */

const API_KEY = process.env.GEMINI_API_KEY;

const getGenAI = () => {
    if (!API_KEY) {
        throw new Error("API Key missing. Please add GEMINI_API_KEY to your .env file.");
    }
    return new GoogleGenAI(API_KEY);
};

// Tool for AI to suggest priority updates
const updatePriorityFunctionDeclaration = {
  name: 'update_assignment_priority',
  description: 'Updates the priority score of an assignment based on risk analysis.',
  parameters: {
    type: 'OBJECT',
    properties: {
      assignmentId: { type: 'STRING', description: 'The MongoDB ObjectId of the assignment' },
      suggestedPriority: { type: 'NUMBER', description: 'New priority score (1-100)' },
      reasoning: { type: 'STRING', description: 'Why this priority was suggested' }
    },
    required: ['assignmentId', 'suggestedPriority', 'reasoning'],
  },
};

/**
 * Generates an AI response based on user input and current academic context
 */
async function generateChatResponse(userPrompt, context = {}) {
  try {
    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        tools: [{
          functionDeclarations: [updatePriorityFunctionDeclaration]
        }],
    });

    const systemPrompt = `You are an AI Academic Strategy Advisor. 
    Analyze the student's workload and provide risk analysis.
    
    ACADEMIC CONTEXT:
    Assignments: ${JSON.stringify(context.assignments || [])}
    Courses/Grading Weights: ${JSON.stringify(context.courses || [])}
    History: ${JSON.stringify(context.history || [])}
    
    TASK:
    1. Answer questions about assignments.
    2. Identify "Risk" assignments (High difficulty + Low confidence + Close deadline).
    3. Use the 'update_assignment_priority' tool if you identify an assignment that needs more focus.`;

    const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: systemPrompt + "\n\nUser Message: " + userPrompt }] }]
    });

    const response = result.response;
    const calls = response.functionCalls();
    
    if (calls && calls.length > 0) {
      const call = calls[0];
      if (call.name === 'update_assignment_priority') {
          const { assignmentId, suggestedPriority, reasoning } = call.args;
          await Assignment.findByIdAndUpdate(assignmentId, { priorityScore: suggestedPriority });
          return `[STRATEGY] ${reasoning}. I've increased the priority to ${suggestedPriority}.`;
      }
    }

    return response.text();
  } catch (error) {
    console.error("Chatbot Error:", error.message);
    return `Error: ${error.message}`;
  }
}

/**
 * Uses AI to parse syllabus text and extract structured grading data
 */
async function parseSyllabus(text) {
  try {
    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
      Extract the grading weights from the following syllabus text.
      Return valid JSON only. No markdown.
      
      Target Structure:
      {
        "weights": {
          "Homework": 20,
          "Exams": 50,
          "Quizzes": 10,
          "Projects": 20
        }
      }
      
      TEXT:
      ${text.substring(0, 8000)}
    `;

    const result = await model.generateContent(prompt);
    const response = result.response.text();
    const cleanJson = response.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error("Syllabus Parse Error:", error);
    return { weights: { "Uncategorized": 100 } };
  }
}

module.exports = { generateChatResponse, parseSyllabus };
