/*
  This Netlify Function acts as a secure proxy, configured for OpenRouter compatibility.
  It transforms the Gemini-style payload from the client into the OpenAI/OpenRouter format.
*/
const fetch = require('node-fetch');

// Base URL for OpenRouter's standard chat completions endpoint
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Helper for error responses
const buildErrorResponse = (statusCode, message) => ({
    statusCode,
    body: JSON.stringify({ message }),
    headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // Enable CORS for Netlify
    },
});

exports.handler = async (event) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return buildErrorResponse(405, 'Method Not Allowed');
    }

    // 1. Get API Key and Validate
    const apiKey = process.env.GEMINI_API_KEY; 
    if (!apiKey) {
        return buildErrorResponse(500, 'Server configuration error: GEMINI_API_KEY (OpenRouter Key) not set.');
    }
    
    // 2. Parse the request body from the frontend (Gemini format)
    let incomingPayload;
    try {
        incomingPayload = JSON.parse(event.body);
    } catch (e) {
        return buildErrorResponse(400, 'Invalid JSON body in request.');
    }

    // --- FIX START: Force OpenRouter Compatible Model Name ---
    // The client sends the Google-specific model name (e.g., 'gemini-2.5-flash-preview-09-2025').
    // We must map it to the OpenRouter equivalent to avoid the 400 error.
    const modelMap = {
        'gemini-2.5-flash-preview-09-2025': 'google/gemini-2.5-flash',
        'gemini-2.5-flash': 'google/gemini-2.5-flash',
        // Add other models if needed, e.g., 'gemini-2.5-pro': 'google/gemini-2.5-pro'
    };

    const requestedModel = incomingPayload.model;
    const modelName = modelMap[requestedModel] || 'google/gemini-2.5-flash';
    // --- FIX END ---
    
    // 3. Transform the incoming Gemini payload into the OpenRouter/OpenAI format
    const messages = [];

    // Add System Instruction (if present)
    const systemInstruction = incomingPayload.systemInstruction?.parts?.[0]?.text;
    if (systemInstruction) {
        messages.push({
            role: "system",
            content: systemInstruction,
        });
    }

    // Add User Content (assuming one part per conversation for this app)
    const userContent = incomingPayload.contents?.[0]?.parts?.[0]?.text;
    if (userContent) {
        messages.push({
            role: "user",
            content: userContent,
        });
    }

    // Construct the FINAL OpenRouter payload
    const finalApiPayload = {
        model: modelName, // Use the mapped model name
        messages: messages,
        // Optional: Ensure the model knows we want pure text
        // stream: false, // Netlify functions can't easily stream
    };


    // 4. Call OpenRouter API securely
    try {
        const response = await fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`, // Key passed via Authorization header
                'HTTP-Referer': event.headers.host, // Required by OpenRouter for usage tracking
            },
            // Use the transformed payload
            body: JSON.stringify(finalApiPayload) 
        });

        // Get the full response body
        const result = await response.json();
        
        if (!response.ok) {
            // Log the error from OpenRouter for debugging in Netlify logs
            console.error("OpenRouter API Error:", result);
            const errorMessage = result.message || result.error?.message || 'OpenRouter API returned an error.';
            return buildErrorResponse(response.status, errorMessage);
        }

        // OpenRouter uses the OpenAI format: choices[0].message.content
        const generatedText = result.choices?.[0]?.message?.content;

        if (!generatedText) {
            // Log if content is unexpectedly empty
            console.error("API response missing text content:", result);
            return buildErrorResponse(500, 'Failed to extract generated Lua code from OpenRouter response.');
        }

        // 5. Return the raw Lua code text to the frontend
        return {
            statusCode: 200,
            body: generatedText,
            headers: {
                'Content-Type': 'text/plain',
                'Access-Control-Allow-Origin': '*',
            },
        };

    } catch (e) {
        console.error('API Proxy Fetch Failure:', e);
        return buildErrorResponse(500, `Internal server error during API call: ${e.message}`);
    }
};
