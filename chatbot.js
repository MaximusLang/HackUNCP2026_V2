const { GoogleGenerativeAI } = require('@google/generative-ai');
const mongoose = require('mongoose');
const Assignment = require('./models/Assignment');
const Course = require('./models/Course');
const path = require('path');
require('dotenv').config();

/**
 * chatbot.js - Academic Strategy Advisor
 */

const API_KEY = process.env.GEMINI_API_KEY;

const getGenAI = () => {
    if (!API_KEY) {
        throw new Error("API Key missing. Please add GEMINI_API_KEY to your .env file.");
    }
    return new GoogleGenerativeAI(API_KEY);
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
        model: 'gemini-2.0-flash',
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
    3. Use the 'update_assignment_priority' tool if you identify an assignment that needs more focus.

    IMPORTANT STYLE GUIDELINES:
    - Keep your answers short, clear, and human—avoid long-winded or overly formal explanations.
    - Use plain, conversational language.
    - If listing assignments, keep lists brief and only mention the most urgent or relevant ones.
    - Use line breaks between assignments and sections for readability (not markdown, just plain newlines).
    - If you don't have enough info, ask for it in a friendly, concise way.
    - Never repeat the same information in multiple ways.
    - Avoid generic disclaimers or excessive context.
    - If you recommend action, be direct and specific.
    - Never use markdown formatting (like **bold** or lists), just plain text.`;

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
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const prompt = `
      Read the syllabus text and extract structured information. Return JSON only, no explanations.
      Max response length 2000 chars. Use ISO dates for dates if present.

      Target structure:
      {
        "courseName": "Course Title or null",
        "latePolicy": "Short description or null",
        "weights": { "Homework": 20, "Exams": 50, "Quizzes": 10, "Projects": 20 },
        "assignments": [
           { "summary": "HW1", "due": "2026-02-28T00:00:00.000Z", "category": "Homework", "estimatedWeight": 2 },
           ...
        ]
      }

      SYLLABUS:
      ${text.substring(0, 8000)}
    `;

    const result = await model.generateContent(prompt);
    const response = result.response.text();
    const clean = response.replace(/```json|```/g, '').trim();
    try {
      const parsed = JSON.parse(clean);
      return { ...parsed, rawResponse: clean };
    } catch (e) {
      // attempt to extract a JSON object within the text
      const m = clean.match(/\{[\s\S]*\}/);
      if (m) {
        try { return { ...JSON.parse(m[0]), rawResponse: clean }; } catch (e2) {}
      }
      // Return a fallback with the raw AI output for debugging
      return { courseName: null, latePolicy: null, weights: { "Uncategorized": 100 }, assignments: [], rawResponse: clean };
    }
  } catch (error) {
    console.error("Syllabus Parse Error:", error);
    return { courseName: null, latePolicy: null, weights: { "Uncategorized": 100 }, assignments: [], rawResponse: null };
  }
}

module.exports = { generateChatResponse, parseSyllabus };
