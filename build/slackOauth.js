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
exports.handleOAuthSubmission = exports.handleOAuthModal = exports.saveTokens = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const saveTokens = (user, tokens) => __awaiter(void 0, void 0, void 0, function* () {
    const { data, error } = yield supabase
        .from('keys')
        .upsert([Object.assign({ user }, tokens)]);
    if (error) {
        console.error('Error saving tokens:', error.message);
        return false;
    }
    return true;
});
exports.saveTokens = saveTokens;
const handleOAuthModal = (body, client) => __awaiter(void 0, void 0, void 0, function* () {
    const triggerId = body.trigger_id;
    const userId = body.user_id;
    const { data: userTokens, error: tokensError } = yield supabase
        .from('keys')
        .select('OPENAI_API_KEY, SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_APP_LEVEL_TOKEN')
        .eq('user', userId)
        .single();
    if (tokensError || !userTokens) {
        yield client.views.open({
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
        });
    }
});
exports.handleOAuthModal = handleOAuthModal;
const handleOAuthSubmission = (view, ack, client) => __awaiter(void 0, void 0, void 0, function* () {
    yield ack();
    const userId = view.user.id;
    const slackOAuthToken = view.state.values.slack_oauth.slack_oauth_token.value;
    const openaiApiKey = view.state.values.openai_key.openai_key.value;
    const submittedTokens = {
        openAIKey: openaiApiKey,
        slackBotToken: slackOAuthToken,
        slackSigningSecret: '',
        slackAppLevelToken: '',
    };
    const success = yield (0, exports.saveTokens)(userId, submittedTokens);
    if (!success) {
        yield client.chat.postMessage({
            channel: userId,
            text: 'Failed to save tokens. Please try again'
        });
    }
    else {
        yield client.chat.postMessage({
            channel: userId,
            text: 'Tokens saved successfully'
        });
    }
});
exports.handleOAuthSubmission = handleOAuthSubmission;
