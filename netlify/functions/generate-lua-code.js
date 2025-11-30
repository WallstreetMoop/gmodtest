/*
  This Netlify Function acts as a secure proxy:
  1. It receives the API payload (user prompt + system instruction) from the client (index.html).
  2. It securely adds the GEMINI_API_KEY from Netlify environment variables.
  3. It makes the API call to Google.
  4. It returns the generated Lua code to the client, resolving CORS issues.
*/
const fetch = require('node-fetch');

// The base URL for the Gemini API
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

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
        return buildErrorResponse(500, 'Server configuration error: GEMINI_API_KEY not set.');
    }
    
    // 2. Parse the request body from the frontend
    let incomingPayload;
    try {
        incomingPayload = JSON.parse(event.body);
    } catch (e) {
        return buildErrorResponse(400, 'Invalid JSON body in request.');
    }

    const modelName = incomingPayload.model || 'gemini-2.5-flash-preview-09-2025';
    const apiUrl = `${GEMINI_BASE_URL}${modelName}:generateContent?key=${apiKey}`;

    // 3. IMPORTANT: Construct the FINAL payload sent to the Google API
    // This ensures ONLY the required keys are present to prevent 400 errors.
    const finalApiPayload = {
        contents: incomingPayload.contents,
        systemInstruction: incomingPayload.systemInstruction,
        // Add generationConfig if the client sends it, otherwise ignore
        ...(incomingPayload.generationConfig && { generationConfig: incomingPayload.generationConfig })
    };


    // 4. Call the Gemini API securely
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Use the cleaned finalApiPayload
            body: JSON.stringify(finalApiPayload) 
        });

        // Get the full response body
        const result = await response.json();
        
        if (!response.ok) {
            // Log the error from Google API for debugging in Netlify logs
            console.error("Google API Error:", result);
            const errorMessage = result.error?.message || 'Gemini API returned an error.';
            return buildErrorResponse(response.status, errorMessage);
        }

        const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!generatedText) {
            // Log if content is unexpectedly empty
            console.error("API response missing text content:", result);
            return buildErrorResponse(500, 'Failed to extract generated Lua code from API response.');
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
