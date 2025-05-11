import { App, LogLevel } from '@slack/bolt'
import { OpenAI } from 'openai'
import { createClient, PostgrestError } from "@supabase/supabase-js"
import * as dotenv from 'dotenv'
import { handleOAuthModal, handleOAuthSubmission } from './slackOauth'

// authentication
dotenv.config()

const supabase = createClient(
    process.env.SUPABASE_URL! as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY! as string
)

type TokenSet = {
    openAIKey: string
    slackBotToken: string
    slackSigningSecret: string
    slackAppLevelToken: string
}

let openai: OpenAI
let slackApp: App

// fetch tokens from supabase
const getTokens = async (user: string): Promise<TokenSet | null> => {
    const { data, error } = await supabase
        .from("keys")
        .select("OPENAI_API_KEY, SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_APP_LEVEL_TOKEN")
        .eq("user", user)
        .single()

    if (error) {
        console.error("Supabase error:", error.message)
        return null
    }

    const missingToken: string[] = []
    if (!data?.OPENAI_API_KEY) missingToken.push("OPENAI_API_KEY")
    if (!data?.SLACK_BOT_TOKEN) missingToken.push("SLACK_BOT_TOKEN")
    if (!data?.SLACK_SIGNING_SECRET) missingToken.push("SLACK_SIGNING_SECRET")
    if (!data?.SLACK_APP_LEVEL_TOKEN) missingToken.push("SLACK_APP_LEVEL_TOKEN")

    if (missingToken.length > 0) {
        console.error(`Missing token: ${missingToken.join(",")}`)
        return null
    }

    return {
        openAIKey: data.OPENAI_API_KEY,
        slackBotToken: data.SLACK_BOT_TOKEN,
        slackSigningSecret: data.SLACK_SIGNING_SECRET,
        slackAppLevelToken: data.SLACK_APP_LEVEL_TOKEN,
    };
}

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
            console.error("❌ AI JSON parsing failed", error);
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

// slack app startup
; (async () => {
    const tokens = await getTokens("U069V3BGK8T")
    if (!tokens) {
        console.error("❌ Tokens not loaded. Aborting startup.")
        process.exit(1)
    }

    // Init OpenAI and Slack App
    openai = new OpenAI({ apiKey: tokens.openAIKey })

    slackApp = new App({
        token: tokens.slackBotToken,
        signingSecret: tokens.slackSigningSecret,
        socketMode: true,
        appToken: tokens.slackAppLevelToken,
        logLevel: LogLevel.DEBUG
    })

    const allowedUsers = JSON.parse(process.env.USERS || "[]")

    // Register /kf handler below
    slackApp.command('/kf', async ({ command, ack, client }) => {
        await ack()

        if (!allowedUsers.includes(command.user_id)) {
            await client.chat.postMessage({
                channel: command.user_id,
                text: "Sorry, this is under maintenance."
            })
            return
        }

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

    slackApp.action("kf", async ({ body, ack, client }) => {
        await ack()
        const selectedMessage = (body as any).message?.text || "No message"
        const triggerId = (body as any).trigger_id

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
            })
        } catch (err) {
            console.error("❌ Slack modal error:", err)
        }
    })

    slackApp.view('message_submission', async ({ view, ack, client, body }) => {
        await ack()

        const userId = body.user.id
        const userMessage = view.state.values.message_input.user_message.value as string
        const selectedChannel = view.state.values.channel_select.selected_channel.selected_conversation as string

        const evaluation = await evaluateMessage(userMessage)

        if (!evaluation.isValid) {
            await client.chat.postMessage({
                channel: userId,
                text: `🚫 Not sent: "${evaluation.reason}". Suggestion: "${evaluation.suggestion}"`
            })
            return
        }

        try {
            let finalChannel = selectedChannel

            if (selectedChannel.startsWith("U")) {
                const im = await client.conversations.open({ users: selectedChannel })
                finalChannel = im.channel?.id ?? selectedChannel
            }

            await client.chat.postMessage({
                channel: finalChannel,
                text: evaluation.text
            })

            await client.chat.postMessage({
                channel: userId,
                text: "✅ Message sent successfully!"
            })
        } catch (err) {
            console.error("❌ Message send error:", err)
            await client.chat.postMessage({
                channel: userId,
                text: `❌ Failed to send. Message was: ${userMessage}`
            })
        }
    })

    //modal
    slackApp.event('app_home_opened', async ({ event, client }) => {
        try {
          await handleOAuthModal(event, client)
        } catch (err) {
          console.error("❌ Failed to show OAuth modal on app_home_opened:", err)
        }
      })      

    // Start app
    await slackApp.start(3000)
    console.log("✅ Slack app running on port 3000")
})()