"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("./config/env");
const app_1 = require("./app");
const app = (0, app_1.createApp)();
if (!process.env.VERCEL) {
    app.listen(env_1.env.port, () => {
        console.log(`Backend listening on http://localhost:${env_1.env.port}`);
    });
}
exports.default = app;
