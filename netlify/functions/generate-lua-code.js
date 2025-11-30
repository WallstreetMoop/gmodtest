// Netlify Function to proxy requests to OpenRouter for Lua code generation.
// This function uses the standard OpenAI Chat Completions format (required by OpenRouter).

// The OpenRouter endpoint for chat completions
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
// Choose a suitable, fast model for code generation on OpenRouter
const MODEL = 'openai/gpt-3.5-turbo'; 

// Ensure we are using node-fetch for compatibility
const fetch = require('node-fetch');

// --- System Instruction ---
// This instruction tells the AI how to act and what structure to use.
const systemInstruction = `
You are an AI Lua code generator for the Garry's Mod video game. Your sole output MUST be a single, complete block of Lua code, ready to be executed on the game server. DO NOT include any explanatory text, markdown formatting (like \`\`\`lua\`\`), or comments outside of the code block.

Ground Rules for Code Generation:
1. Temporary Effects: Keep all effects temporary. Disruptive effects (like high jump or low gravity) should last only a few seconds (e.g., 5-10 seconds) using 'timer.Simple' or 'timer.Create'.
2. Safety: The code must not crash or close the game. It should be non-malicious. You are allowed to create funny, fake-malicious effects (e.g., showing a fake IP address on the screen using 'PrintMessage').
3. Preserve Progress: Code that could softlock the game (e.g., deleting a key weapon or item) must revert after a few seconds. If an important item is moved, move it back or hide/show it after a delay.
4. Use the provided execution environment globals: 'Player', 'ply', 'PrintMessage', 'timer', 'util', 'ents', 'Vector', and 'Color'. Use 'ply:SetJumpPower(500)' instead of 'game.ConsoleCommand("sv_gravity 100")' for player-specific effects.
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

        // The key for the OpenRouter API (often stored as an OpenAI key)
        const apiKey = process.env.GEMINI_API_KEY; 
        
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
        
        // --- OpenRouter/OpenAI API Payload ---
        const openRouterPayload = {
            model: MODEL,
            messages: [
                { role: "system", content: systemInstruction },
                { role: "user", content: `Generate the Lua code for the following command: ${prompt}` }
            ],
            // Set temperature to 0.7 for creative but structured code
            temperature: 0.7, 
            stream: false
        };

        const response = await fetch(OPENROUTER_ENDPOINT, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                // OpenRouter uses the Authorization header with a Bearer token
                'Authorization': `Bearer ${apiKey}`,
                // OpenRouter optional header to identify the user/app
                'HTTP-Referer': 'https://gmod-stream-director.netlify.app' // Replace with your actual deployed URL
            },
            body: JSON.stringify(openRouterPayload)
        });

        if (!response.ok) {
            // Read the error from OpenRouter's response body
            const errorBody = await response.json();
            console.error('OpenRouter Error:', errorBody);

            return {
                statusCode: response.status,
                body: JSON.stringify({ 
                    error: 'OpenRouter API Request Failed', 
                    details: errorBody.error?.message || errorBody
                }),
            };
        }

        const data = await response.json();
        
        // Extract the generated code (which should be the raw Lua string)
        const luaCode = data.choices[0]?.message?.content?.trim() || 
                       '// Error: AI returned no code. Try a different prompt.';

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
