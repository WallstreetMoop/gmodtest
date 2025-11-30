// Netlify Function to proxy requests to the Gemini API for Lua code generation.
// This function uses structured JSON output to guarantee clean, raw Lua code.

const GEMINI_ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
const MODEL = 'gemini-2.5-flash-preview-09-2025';
const FETCH_URL = `${GEMINI_ENDPOINT_BASE}${MODEL}:generateContent`;

// Ensure we are using node-fetch for compatibility
const fetch = require('node-fetch');

// --- System Instruction ---
// This instruction tells the AI how to act and what structure to use.
const systemInstruction = `
You are an AI Lua code generator for the Garry's Mod video game. Your sole purpose is to respond with a JSON object containing the requested Lua code.

Ground Rules for Code Generation:
1. Output format MUST be a single JSON object matching the provided schema, with the generated Lua code inside the 'lua_code' field. DO NOT include any explanatory text outside the JSON object.
2. Temporary Effects: Keep all effects temporary. Disruptive effects (like high jump or low gravity) should last only a few seconds (e.g., 5-10 seconds) using 'timer.Simple' or 'timer.Create'.
3. Safety: The code must not crash or close the game. It should be non-malicious. You are allowed to create funny, fake-malicious effects (e.g., showing a fake IP address on the screen using 'PrintMessage').
4. Preserve Progress: Code that could softlock the game (e.g., deleting a key weapon or item) must revert after a few seconds. If an important item is moved, move it back or hide/show it after a delay.
5. Use the provided execution environment globals: 'Player', 'ply', 'PrintMessage', 'timer', 'util', 'ents', 'Vector', and 'Color'. Use 'ply:SetJumpPower(500)' instead of 'game.ConsoleCommand("sv_gravity 100")' for player-specific effects.
`;

// Helper function to decode and parse the Netlify event body
const getRequestBody = (event) => {
    let body = event.body;
    if (event.isBase64Encoded) {
        body = Buffer.from(body, 'base64').toString('utf8');
    }
    return JSON.parse(body);
};


exports.handler = async (event) => {
    try {
        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, body: 'Method Not Allowed' };
        }

        // The key for the Gemini API
        const apiKey = process.env.GEMINI_API_KEY; 
        
        // IMPORTANT: Use the apiKey query parameter for the Canvas API endpoint
        const apiQueryUrl = `${FETCH_URL}?key=${apiKey}`;

        if (!apiKey) {
             return {
                statusCode: 500,
                body: JSON.stringify({ error: 'API Key (GEMINI_API_KEY) not configured.' }),
            };
        }

        const { prompt } = getRequestBody(event);

        if (!prompt) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing "prompt" in request body.' }) };
        }
        
        // --- Gemini API Payload for Structured JSON Output ---
        const geminiPayload = {
            contents: [{ 
                role: 'user', 
                parts: [{ text: `Generate the Lua code for the following command: ${prompt}` }] 
            }],
            config: {
                // Set the model's persona and rules
                systemInstruction: systemInstruction,
                // Force the model to output a specific JSON structure
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        "lua_code": { 
                            "type": "STRING", 
                            "description": "The complete, raw Lua code block without any surrounding markdown or comments." 
                        }
                    },
                    "propertyOrdering": ["lua_code"]
                }
            },
        };

        const response = await fetch(apiQueryUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(geminiPayload)
        });

        if (!response.ok) {
            const errorBody = await response.json();
            console.error('Gemini API Error:', errorBody);

            return {
                statusCode: response.status,
                body: JSON.stringify({ 
                    error: 'Gemini API Request Failed', 
                    details: errorBody.error?.message || errorBody
                }),
            };
        }

        const data = await response.json();
        
        // The structured response is in part[0].text as a stringified JSON object
        const jsonString = data.candidates[0]?.content?.parts[0]?.text;
        
        if (!jsonString) {
            const fallbackCode = `// Error: AI returned no parsable JSON. Response: ${JSON.stringify(data)}`;
            return {
                statusCode: 500,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: fallbackCode }),
            };
        }

        // Parse the structured JSON output
        const parsedData = JSON.parse(jsonString);
        
        // Extract the raw Lua code
        const luaCode = parsedData.lua_code?.trim() || '// Error: AI returned empty code.';

        // The frontend expects an object with a 'code' property
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: luaCode }),
        };

    } catch (error) {
        console.error('Function execution error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error', details: error.message }),
        };
    }
};
