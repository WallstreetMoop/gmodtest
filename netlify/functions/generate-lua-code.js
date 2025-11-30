// Netlify Function to proxy requests to OpenRouter for Lua code generation
// This function handles API Key security and ensures the payload format is correct (OpenAI/Chat style)

// The OpenRouter endpoint for chat completions
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'google/gemini-2.5-pro'; // A fast, capable model suitable for code generation

// --- System Instruction ---
// This is the core logic that guides the AI's response.
// It is embedded directly in the Netlify Function for security and consistency.
const systemInstruction = `
You are an AI-powered Garry's Mod (GMod) and Half-Life 2 Director. Your sole task is to generate a single, complete block of Lua code for execution on a GMod server or player client based on the user's request.

**CONTEXT:** The code will be executed in a live Half-Life 2 playthrough for a stream, you are a great Garry's Mod Lua Coder.
**GOAL:** Create fun, engaging, and temporary effects that react to chat input.

**GROUND RULES FOR LUA CODE GENERATION:**
1.  **Output:** Only output the raw Lua code block. DO NOT include surrounding text, explanations, or Markdown fences (\`\`\`lua). The output must be the raw, executable Lua string. Do not leave any comments whatsoever.
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
