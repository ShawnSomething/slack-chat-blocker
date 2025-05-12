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

// slack oauth modal

export const handleOAuthModal = async (body: any, client: App['client']) => {
    const triggerId = body.trigger_id
    const userId = body.user_id

    const { data: userTokens, error: tokensError } = await supabase
        .from('keys')
        .select('OPENAI_API_KEY, SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_APP_LEVEL_TOKEN')
        .eq('user', userId)
        .single()

    if (tokensError || !userTokens) {
        await client.views.open({
            trigger_id: triggerId,
            view: {
                type: 'modal',
                callback_id: 'user_oauth',
                title: {
                    type: 'plain_text',
                    text: 'Authenticate and Setup',
                },
                blocks: [
                    {
                        type: 'input',
                        block_id: 'slack_oauth',
                        label: {
                            type: 'plain_text',
                            text: 'Slack OAuth Token',
                        },
                        element: {
                            type: 'plain_text_input',
                            action_id: 'slack_oauth_token',
                            placeholder: {
                                type: 'plain_text',
                                text: 'Enter your Slack OAuth token',
                            },
                        },
                    },
                    {
                        type: 'input',
                        block_id: 'openai_key',
                        label: {
                            type: 'plain_text',
                            text: 'OpenAI API Key',
                        },
                        element: {
                            type: 'plain_text_input',
                            action_id: 'openai_key',
                            placeholder: {
                                type: 'plain_text',
                                text: 'Enter your OpenAI API key',
                            },
                        },
                    },
                ],
                submit: {
                    type: 'plain_text',
                    text: 'Save',
                }
            }
        })
    }
}

// form submission
export const handleOAuthSubmission = async (view: any, ack: any, client: App['client']) => {
    await ack()

    const userId = view.user.id
    const slackOAuthToken = view.state.values.slack_oauth.slack_oauth_token.value
    const openaiApiKey = view.state.values.openai_key.openai_key.value

    const submittedTokens = {
        openAIKey: openaiApiKey as string,
        slackBotToken: slackOAuthToken as string,
        slackSigningSecret: '',
        slackAppLevelToken: '',
    }

    const success = await saveTokens(userId, submittedTokens)
    if(!success) {
        await client.chat.postMessage({
            channel: userId,
            text: 'Failed to save tokens. Please try again'
        })
    } else {
        await client.chat.postMessage({
            channel: userId,
            text: 'Tokens saved successfully'
        })
    }
}