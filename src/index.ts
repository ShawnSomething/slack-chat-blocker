import { App, LogLevel } from '@slack/bolt'
import { OpenAI } from 'openai'
import * as dotenv from 'dotenv'

dotenv.config()

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY as string
})

const app = new App({
    token: process.env.SLACK_BOT_TOKEN as string,
    signingSecret: process.env.SLACK_SIGNING_SECRET as string,
    socketMode: true,
    appToken: process.env.SLACK_APP_LEVEL_TOKEN,
    logLevel: LogLevel.DEBUG
})

// Handle the `/kf` command
app.command('/kf', async ({ command, ack, client }) => {
    await ack()

    await client.views.open({
        trigger_id: command.trigger_id,
        view: {
            type: 'modal',
            callback_id: 'message_submission',
            title: { type: 'plain_text', text: 'Send a Safe Message' },
            blocks: [
                {
                    type: 'input',
                    block_id: 'message_input',
                    label: { type: 'plain_text', text: 'Your Message' },
                    element: {
                        type: 'plain_text_input',
                        action_id: 'user_message',
                        multiline: true,
                    }
                },
                {
                    type: 'input',
                    block_id: 'channel_select',
                    label: { type: 'plain_text', text: 'Choose Channel or DM' },
                    element: {
                        type: 'conversations_select',
                        action_id: 'selected_channel',
                        default_to_current_conversation: true,
                    }
                }
            ],
            submit: { type: 'plain_text', text: 'Send' }
        }
    })
})

// Handle message action (user selects a message and clicks "More Actions" → your app)
app.action("kf", async ({ body, ack, client }) => {
    console.log("✅ app.action triggered for message action!") // Confirm handler is running
    console.log("📩 Full payload:", JSON.stringify(body, null, 2)) // Print the full payload

    await ack();
    console.log("✅ ack() successful") // Confirm the event is acknowledged

    const selectedMessage = (body as any).message?.text || "No message text found";
    console.log("📌 Selected message:", selectedMessage);

    const triggerId = (body as any).trigger_id;
    console.log("📌 Trigger ID:", triggerId);

    try {
        await client.views.open({
            trigger_id: triggerId,
            view: {
                type: 'modal',
                callback_id: 'message_submission',
                title: { type: 'plain_text', text: 'Send a Safe Message' },
                blocks: [
                    {
                        type: 'input',
                        block_id: 'message_input',
                        label: { type: 'plain_text', text: 'Your Message' },
                        element: {
                            type: 'plain_text_input',
                            action_id: 'user_message',
                            multiline: true,
                            initial_value: selectedMessage,
                        }
                    },
                    {
                        type: 'input',
                        block_id: 'channel_select',
                        label: { type: 'plain_text', text: 'Choose Channel or DM' },
                        element: {
                            type: 'conversations_select',
                            action_id: 'selected_channel',
                            default_to_current_conversation: true,
                        }
                    }
                ],
                submit: { type: 'plain_text', text: 'Send' }
            }
        });

        console.log("✅ Modal opened successfully");
    } catch (error) {
        console.error("❌ Slack API error:", error);
    }
});



// Handle modal submission
app.view('message_submission', async ({ view, ack, client, body }) => {
    await ack()

    const userId = body.user.id
    const userMessage = view.state.values.message_input.user_message.value as string;
    const selectedChannel = view.state.values.channel_select.selected_channel.selected_conversation as string;


    console.log("📌 Selected Channel:", selectedChannel)

    const evaluation = await evaluateMessage(userMessage)

    if (!evaluation.isValid) {
        await client.chat.postMessage({
            channel: userId,
            text: `🚫 Your message was not sent because: "${evaluation.reason}".\n💡 Suggestion: "${evaluation.suggestion}"`
        })
        return
    } 
    
    try {
        let finalChannel = selectedChannel
        if (selectedChannel.startsWith("U")) {
            console.log("Opening DM with user", selectedChannel)
            const im = await client.conversations.open({users: selectedChannel})
            if (!im.channel?.id) {
                throw new Error("Failed to open DM: No valid channel ID returned.");
            }

            finalChannel = im.channel.id;
        }
        
        await client.chat.postMessage({
            channel: userId,
            text: `✅ Your message is all good! -- ${evaluation.text}`, 
        })

        console.log("✅ Message sent successfully!")
    } catch (error) {
        console.error("❌ Error sending message:", error);
        await client.chat.postMessage({
            channel: userId,
            text: `❌ Failed to send your message. Please try again. This was your message -- ${userMessage}`
        });
    }
})


// AI Evaluation Function
async function evaluateMessage(text: string): Promise<{ isValid: boolean; text: string; reason?: string; suggestion?: string }> {
    try {
        const prompt = `Imagine you are a sensitive Karen-type middle manager.
        I am going to send a couple of messages and tell me if you are offended.

        Message: "${text}"

        Reply in JSON format:
        {
          "offended": true or false,
          "reason": "Explain why you are offended (if applicable)",
          "suggestion": "Suggest a way to make the message more appropriate (if applicable)"
        }`

        const response = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [{ role: "system", content: prompt }],
            temperature: 0.5,
        })

        const aiResponse = response.choices[0].message.content?.trim()

        let parsedResponse;
        try {
            parsedResponse = JSON.parse(aiResponse || "{}");
        } catch (error) {
            console.error("❌ JSON parsing failed", error);
            return { isValid: false, text, reason: "AI response error.", suggestion: "Try rewording your message." };
        }

        if (parsedResponse.offended) {
            return { isValid: false, text, reason: parsedResponse.reason, suggestion: parsedResponse.suggestion }
        }
        return { isValid: true, text }
    } catch (error) {
        console.error("AI evaluation failed", error)
        return { isValid: false, text, reason: "Error processing message evaluation.", suggestion: "AI evaluation failed, please check." }
    }
}

// Start the Slack App
(async () => {
    try {
        await app.start(3000);
        console.log('✅ Slack app is running');
    } catch (error) {
        console.error('❌ Failed to start Slack app:', error);
        process.exit(1);
    }
})();
