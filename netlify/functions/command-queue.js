// Netlify Function to handle POST (Queue) and GET (Dequeue) operations for GMod commands.
// This version uses an in-memory variable, eliminating external API dependencies (like Firestore).
// WARNING: Data is NOT persistent across cold starts/function restarts.

// A simple in-memory store for the latest command.
// This variable persists across requests handled by the same 'hot' function instance.
let commandQueue = {
    luaCode: '',
    timestamp: null
};

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
        if (event.httpMethod === 'POST') {
            // --- POST: Queue/Write the new command ---
            const { code } = getRequestBody(event);

            if (!code) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Missing "code" in request body.' }) };
            }

            // Store the new Lua code in memory
            commandQueue.luaCode = code;
            commandQueue.timestamp = new Date().toISOString();

            console.log('Successfully queued new Lua command in memory.');

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: 'Command queued successfully (in-memory).' }),
            };

        } else if (event.httpMethod === 'GET') {
            // --- GET: Dequeue/Read the latest command (for GMod Poller) ---

            const luaCode = commandQueue.luaCode || '';

            // If there is code, send it, and then clear the queue immediately.
            if (luaCode) {
                // CLEAR THE COMMAND AFTER SENDING IT TO ENSURE SINGLE EXECUTION
                commandQueue.luaCode = '';
                console.log('Successfully served and cleared Lua command from memory.');
            }

            // The GMod poller expects the raw Lua code string, not JSON.
            // We return a plaintext response.
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'text/plain' },
                body: luaCode,
            };

        } else {
            return { statusCode: 405, body: 'Method Not Allowed' };
        }

    } catch (error) {
        console.error('Function execution error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error', details: error.message }),
        };
    }
};
