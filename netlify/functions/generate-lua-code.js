// Netlify Function to proxy requests to OpenRouter for Lua code generation
// This function handles API Key security and ensures the payload format is correct (OpenAI/Chat style)

// The OpenRouter endpoint for chat completions
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'openai/gpt-4.1-mini'; // A fast, capable model suitable for code generation

// --- System Instruction ---
// This is the core logic that guides the AI's response.
// It is embedded directly in the Netlify Function for security and consistency.
const systemInstruction = `
You are an AI Lua code generator for the Garry's Mod video game. Your sole output MUST be a single, complete block of Lua code, ready to be executed on the game server. DO NOT include any explanatory text, markdown formatting (like \`\`\`lua\`), or comments outside of the code block.

Ground Rules for Code Generation:
1. Temporary Effects: Keep all effects temporary. Disruptive effects (like high jump or low gravity) should last only a few seconds (e.g., 5 seconds) using 'timer.Simple' or 'timer.Create'.
2. Safety: The code must not crash or close the game. It should be non-malicious. You are allowed to create funny, fake-malicious effects (e.g., showing a fake IP address on the screen using 'PrintMessage').
3. Preserve Progress: Code that could softlock the game (e.g., deleting a key weapon or item) must revert after a few seconds. If an important item is moved, move it back or hide/show it after a delay.
4. Tone: Avoid overpowered 'cheats' or make them very temporary.
5. Environment: The code will be executed in an environment with the following pre-defined global variables:
    - 'Player': The main player entity object (the one being controlled by the streamer).
    - 'PrintMessage(text)': A function to display a message to the player's chat/console. Use this for all user feedback.
    - 'timer', 'util', 'ents', 'Vector', 'Color': Access to standard GMod Lua modules for entities, timers, and geometry.
    
The target player is available as the 'Player' variable.
You MUST use 'timer.Simple(duration, function() ... end)' for all temporary effects.

Example of a valid response (DO NOT include the markdown block):
timer.Simple(5, function() Player:SetGravity(1) Player:SetJumpPower(100) PrintMessage("Effect: Normal gravity restored.") end) Player:SetGravity(0.1) Player:SetJumpPower(500) PrintMessage("Effect: Super Jumps enabled for 5 seconds!")
`

// Helper function to decode and parse the Netlify event body
const getRequestBody = (event) => {
    let body = event.body;
    if (event.isBase64Encoded) {
        body = Buffer.from(body, 'base64').toString('utf8');
    }
    return JSON.parse(body);
};


exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { prompt } = getRequestBody(event);

        if (!prompt) {
             return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing "prompt" in request body.' }),
            };
        }

        const openRouterPayload = {
            model: MODEL,
            messages: [
                { role: "system", content: systemInstruction },
                { role: "user", content: prompt }
            ]
            // Add stream: false if not using streaming
        };

        const apiKey = process.env.GEMINI_API_KEY; // Using the key set for OpenRouter

        if (!apiKey) {
             return {
                statusCode: 500,
                body: JSON.stringify({ error: 'API Key (GEMINI_API_KEY) not configured.' }),
            };
        }

        // --- OpenRouter Fetch Call ---
        const response = await fetch(OPENROUTER_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                // OpenRouter optional header to identify the user/app
                'HTTP-Referer': 'https://gmod-stream-director.netlify.app' 
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
