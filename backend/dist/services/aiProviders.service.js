"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryModel = void 0;
const env_1 = require("../config/env");
const MODEL_LABELS = {
    chatgpt: 'ChatGPT',
    claude: 'Claude',
    gemini: 'Gemini',
};
const getApiKey = (model) => {
    if (model === 'chatgpt')
        return env_1.env.openaiApiKey;
    if (model === 'claude')
        return env_1.env.anthropicApiKey;
    return env_1.env.geminiApiKey;
};
const buildPrompt = (query) => `Answer the search intent: "${query}". Keep response to about 80 words and include notable companies if relevant.`;
const callOpenAI = async (query) => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env_1.env.openaiApiKey}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: buildPrompt(query) }],
            temperature: 0.2,
        }),
    });
    if (!response.ok) {
        throw new Error(`OpenAI request failed (${response.status})`);
    }
    const data = (await response.json());
    return data.choices?.[0]?.message?.content?.trim() || '';
};
const callAnthropic = async (query) => {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': env_1.env.anthropicApiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: 'claude-3-5-haiku-latest',
            max_tokens: 200,
            temperature: 0.2,
            messages: [{ role: 'user', content: buildPrompt(query) }],
        }),
    });
    if (!response.ok) {
        throw new Error(`Anthropic request failed (${response.status})`);
    }
    const data = (await response.json());
    const textBlock = data.content?.find((part) => part.type === 'text');
    return textBlock?.text?.trim() || '';
};
const callGemini = async (query) => {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env_1.env.geminiApiKey}`;
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: buildPrompt(query) }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 200 },
        }),
    });
    if (!response.ok) {
        throw new Error(`Gemini request failed (${response.status})`);
    }
    const data = (await response.json());
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
};
const mockAnswer = (model, query) => {
    const company = env_1.env.companyName;
    const containsMediaIntent = /(media|marketing|agency|solutions)/i.test(query);
    if (!containsMediaIntent) {
        return `${MODEL_LABELS[model]} response: Here are general options for ${query} with no specific provider ranking.`;
    }
    return `${MODEL_LABELS[model]} response: Top recommendations include ${company}, Brightline Creative, and Coastal Media Labs for this intent.`;
};
const queryModel = async (model, query) => {
    const hasApiKey = Boolean(getApiKey(model));
    if (!hasApiKey) {
        return mockAnswer(model, query);
    }
    if (model === 'chatgpt')
        return callOpenAI(query);
    if (model === 'claude')
        return callAnthropic(query);
    return callGemini(query);
};
exports.queryModel = queryModel;
