"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const bolt_1 = require("@slack/bolt");
const openai_1 = require("openai");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const openai = new openai_1.OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});
const app = new bolt_1.App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: process.env.SLACK_APP_LEVEL_TOKEN,
    logLevel: bolt_1.LogLevel.DEBUG
});
const allowedUsers = ["U069V3BGK8T", "U05QXA5A2BU", "U013HF0FDAM", "U07MGPHQT8W", "U0183SDFQMT", "U03FPB5JF6U", "U01L04SKBBM", "U0376U51SKH"];
app.command('/kf', (_a) => __awaiter(void 0, [_a], void 0, function* ({ command, ack, client }) {
    yield ack();
    if (!allowedUsers.includes(command.user_id)) {
        yield client.chat.postMessage({
            channel: command.user_id,
            text: "sorry, this is under maintenace"
        });
        return;
    }
    yield client.views.open({
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
    });
}));
app.action("kf", (_a) => __awaiter(void 0, [_a], void 0, function* ({ body, ack, client }) {
    var _b;
    console.log("✅ app.action triggered for message action!");
    console.log("📩 Full payload:", JSON.stringify(body, null, 2));
    yield ack();
    console.log("✅ ack() successful");
    const selectedMessage = ((_b = body.message) === null || _b === void 0 ? void 0 : _b.text) || "No message text found";
    console.log("📌 Selected message:", selectedMessage);
    const triggerId = body.trigger_id;
    console.log("📌 Trigger ID:", triggerId);
    try {
        yield client.views.open({
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
    }
    catch (error) {
        console.error("❌ Slack API error:", error);
    }
}));
app.view('message_submission', (_a) => __awaiter(void 0, [_a], void 0, function* ({ view, ack, client, body }) {
    var _b;
    yield ack();
    const userId = body.user.id;
    const userMessage = view.state.values.message_input.user_message.value;
    const selectedChannel = view.state.values.channel_select.selected_channel.selected_conversation;
    console.log("📌 Selected Channel:", selectedChannel);
    const evaluation = yield evaluateMessage(userMessage);
    if (!evaluation.isValid) {
        yield client.chat.postMessage({
            channel: userId,
            text: `🚫 Your message was not sent because: "${evaluation.reason}".\n💡 Suggestion: "${evaluation.suggestion}"`
        });
        return;
    }
    try {
        let finalChannel = selectedChannel;
        if (selectedChannel.startsWith("U")) {
            console.log("Opening DM with user", selectedChannel);
            const im = yield client.conversations.open({ users: selectedChannel });
            if (!((_b = im.channel) === null || _b === void 0 ? void 0 : _b.id)) {
                throw new Error("Failed to open DM: No valid channel ID returned.");
            }
            finalChannel = im.channel.id;
        }
        yield client.chat.postMessage({
            channel: userId,
            text: `✅ Your message is all good! -- ${evaluation.text}`,
        });
        console.log("✅ Message sent successfully!");
    }
    catch (error) {
        console.error("❌ Error sending message:", error);
        yield client.chat.postMessage({
            channel: userId,
            text: `❌ Failed to send your message. Please try again. This was your message -- ${userMessage}`
        });
    }
}));
function evaluateMessage(text) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const prompt = `Imagine you are a sensitive Karen-type middle manager.
        I am going to send a couple of messages and tell me if you are offended.

        Message: "${text}"

        Reply in JSON format:
        {
          "offended": true or false,
          "reason": "Explain why you are offended (if applicable)",
          "suggestion": "Suggest a way to make the message more appropriate (if applicable)"
        }`;
            const response = yield openai.chat.completions.create({
                model: "gpt-4-turbo",
                messages: [{ role: "system", content: prompt }],
                temperature: 0.5,
            });
            const aiResponse = (_a = response.choices[0].message.content) === null || _a === void 0 ? void 0 : _a.trim();
            let parsedResponse;
            try {
                parsedResponse = JSON.parse(aiResponse || "{}");
            }
            catch (error) {
                console.error("❌ JSON parsing failed", error);
                return { isValid: false, text, reason: "AI response error.", suggestion: "Try rewording your message." };
            }
            if (parsedResponse.offended) {
                return { isValid: false, text, reason: parsedResponse.reason, suggestion: parsedResponse.suggestion };
            }
            return { isValid: true, text };
        }
        catch (error) {
            console.error("AI evaluation failed", error);
            return { isValid: false, text, reason: "Error processing message evaluation.", suggestion: "AI evaluation failed, please check." };
        }
    });
}
(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield app.start(3000);
        console.log('✅ Slack app is running');
    }
    catch (error) {
        console.error('❌ Failed to start Slack app:', error);
        process.exit(1);
    }
}))();
