import { App, LogLevel, BlockAction, ViewSubmitAction } from '@slack/bolt'
import OpenAI from 'openai'
const dotenv = require('dotenv')

dotenv.config()

const openai = new OpenAI ({
    apiKey: process.env.OPENAI_API_KEY as string
})

const app = new App ({
    token: process.env.SLACK_BOT_TOKEN as string,
    signingSecret: process.env.SLACK_SIGNING_SECRET as string,
    logLevel: LogLevel.DEBUG
})

app.command('/kf', async({ command, ack, client }) => {
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
                    label: { type: 'plain_text', text: 'Your Message'},
                    element: {
                        type: 'plain_text_input',
                        action_id: 'user_message',
                        multiline: true,
                    }
                },
                {
                    type: 'input',
                    block_id: 'channel_select',
                    label: { type: 'plain_text', text: 'Choose Channel or DM'},
                    element: {
                        type: 'conversations_select',
                        action_id: 'selected_channel',
                        default_to_current_conversation: true,
                    }
                }
            ],
            submit: { type: 'plain_text', text: 'Send'}
        }
    })
})

app.view('message_submission', async({ view, ack, client, body }) => {
    await ack()

    const userId = body.user.id
    const userMessage = view.state.values.message_input.user_message.value as string
    const selectedChannel = view.state.values.channel_select.selected_channel.selected_conversation as string

    const evaluation = await evaluateMessage(userMessage)

    if (!evaluation.isValid) {
        await client.chat.postMessage({
            channel: userId,
            text: `🚫 Your message was not sent because: "${evaluation.reason}". Please modify and try again.`
        })
    } else {
        await client.chat.postMessage ({
            channel: selectedChannel,
            text: evaluation.text,
        })

        await client.chat.postMessage ({
            channel: userId,
            text: `✅ Your message has been successfully sent to <#${selectedChannel}>!`
        })
    }
})

async function evaluateMessage(text: string): Promise<{isValid: boolean; text: string; reason?: string; suggestion?: string}> {
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
    const parsedResponse = JSON.parse(aiResponse || "{}")

    if (parsedResponse.offended) {
        return { isValid: false, text, reason: parsedResponse.reason, suggestion: parsedResponse.suggestion}
    }
    return { isValid: true, text }
    } catch (error) {
        console.error ("AI evaluation failed", error)
        return { isValid: false, text, reason: "Error processing message evaluation.", suggestion: "Try rewording your message politely." }
    }
}

(async () => {
    await app.start(3000)
    console.log('Slack app is running')
})()