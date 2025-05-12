import { App, LogLevel } from '@slack/bolt'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config()

// Auth supabase
const supabase = createClient(
    process.env.SUPABASE_URL! as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY! as string
)

// push to supabase
export const saveTokens = async (
    user: string,
    tokens: { openAIKey: string; slackBotToken: string; slackSigningSecret: string; slackAppLevelToken: string }
) => {
    const { data, error } = await supabase
        .from('keys')
        .upsert([{ user, ...tokens }])

    if (error) {
        console.error('Error saving tokens:', error.message)
        return false
    }

    return true
}

// slack modal for gpt

export const handleOAuthModal = async (body: any, client: App['client']) => {
    const triggerId = body.trigger_id
    const userId = body.user_id

    const { data, error } = await supabase
        .from('keys')
        .select('OPENAI_API_KEY')
        .eq('user', userId)
        .single()

    if (error || !data?.OPENAI_API_KEY) {
        await client.views.open({
            trigger_id: triggerId,
            view: {
                type: 'modal',
                callback_id: 'user_oauth',
                title: { type: 'plain_text', text: 'Add OpenAI Key' },
                blocks: [
                    {
                        type: 'input',
                        block_id: 'openai_key',
                        label: { type: 'plain_text', text: 'OpenAI API Key' },
                        element: {
                            type: 'plain_text_input',
                            action_id: 'openai_key',
                            placeholder: {
                                type: 'plain_text',
                                text: 'Enter your OpenAI API key',
                            },
                        },
                    }
                ],
                submit: { type: 'plain_text', text: 'Save' }
            }
        })
    }
}

export const handleOAuthSubmission = async (view: any, ack: any, client: App['client']) => {
    await ack()
    const userId = view.user.id
    const openaiApiKey = view.state.values.openai_key.openai_key.value

    const { error } = await supabase
        .from('keys')
        .update({ OPENAI_API_KEY: openaiApiKey })
        .eq('user', userId)

    if (error) {
        await client.chat.postMessage({
            channel: userId,
            text: 'Failed to save your OpenAI key. Please try again.'
        })
    } else {
        await client.chat.postMessage({
            channel: userId,
            text: '✅ OpenAI key saved successfully!'
        })
    }
}
