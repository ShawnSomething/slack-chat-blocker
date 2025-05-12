import { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'
import * as dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const setupOAuthCallback = (app: any) => {
    app.get('/slack/oauth/callback', async (req: Request, res: Response) => {
        const code = req.query.code as string
        if (!code) return res.status(400).send("Missing code")

        try {
            const response = await axios.post('https://slack.com/api/oauth.v2.access', null, {
                params: {
                    client_id: process.env.SLACK_CLIENT_ID,
                    client_secret: process.env.SLACK_CLIENT_SECRET,
                    code,
                    redirect_uri: process.env.SLACK_REDIRECT_URI
                }
            })

            const data = response.data
            if (!data.ok) throw new Error(data.error)

            const user = data.authed_user.id
            const team = data.team.id
            const botToken = data.access_token
            const appToken = data.app_token ?? ''
            const signingSecret = process.env.SLACK_SIGNING_SECRET ?? ''

            // Store tokens in Supabase
            const { error } = await supabase.from('keys').upsert([{
                user,
                team,
                slackBotToken: botToken,
                slackAppLevelToken: appToken,
                slackSigningSecret: signingSecret
            }])

            if (error) {
                console.error('Supabase error:', error)
                return res.status(500).send("Token storage failed")
            }

            return res.send("✅ Slack installation successful! You can now use the app.")
        } catch (err) {
            console.error("OAuth error", err)
            return res.status(500).send("Slack OAuth failed")
        }
    })
}

export default setupOAuthCallback
