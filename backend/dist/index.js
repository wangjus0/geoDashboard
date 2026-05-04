"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_js_1 = require("./config/env.js");
const app_js_1 = require("./app.js");
const app = (0, app_js_1.createApp)();
if (!process.env.VERCEL) {
    app.listen(env_js_1.env.port, () => {
        console.log(`Backend listening on http://localhost:${env_js_1.env.port}`);
    });
}
exports.default = app;
