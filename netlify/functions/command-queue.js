/*
  Netlify Function to manage the GMod command queue.
  - POST: Called by the web client to save a new command.
  - GET: Called by the GMod server (http.Fetch) to retrieve the latest command.
*/
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const COMMAND_KEY = ["gmod_ai", "latest_command"];
const EMPTY_COMMAND_TEXT = "-- No command currently queued. --";

// Helper for error responses
const buildErrorResponse = (statusCode, message) => new Response(
    JSON.stringify({ message }),
    {
        status: statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
    }
);

// Helper for success response (used by the GMod server)
const buildSuccessResponse = (body, contentType = 'text/plain') => new Response(
    body,
    {
        status: 200,
        headers: {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
        },
    }
);


// Netlify/Deno handler function
export default async (req) => {
    try {
        // Open the key-value store (Deno.Kv is automatically initialized by Netlify)
        const kv = await Deno.openKv();
        const method = req.method;
        
        switch (method) {
            case 'POST': {
                // 1. Client wants to save a new command
                const newCommand = await req.text();

                if (!newCommand || newCommand.trim().length < 5) {
                    return buildErrorResponse(400, "Command body is empty or too short.");
                }

                // Save the new command string
                await kv.set(COMMAND_KEY, newCommand);

                // Optional: Save the timestamp for debugging
                await kv.set(["gmod_ai", "last_updated"], new Date().toISOString());

                return buildSuccessResponse(`Command successfully queued: ${newCommand.substring(0, 50)}...`);
            }

            case 'GET': {
                // 2. GMod server is polling for the latest command
                const result = await kv.get(COMMAND_KEY);

                const commandToReturn = result.value || EMPTY_COMMAND_TEXT;

                // Return the raw Lua code string directly (text/plain)
                return buildSuccessResponse(commandToReturn, 'text/plain');
            }

            default:
                return buildErrorResponse(405, 'Method Not Allowed');
        }

    } catch (e) {
        console.error("Queue Handler Error:", e);
        return buildErrorResponse(500, `Internal Server Error: ${e.message}`);
    }
};
