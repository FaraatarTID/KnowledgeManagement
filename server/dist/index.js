import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import apiRoutes from "./routes/api.routes.js";
import cookieParser from "cookie-parser";
import { globalLimiter } from "./middleware/rateLimit.middleware.js";
import morgan from 'morgan';
console.log('--- BACKEND STARTUP SEQUENCE ---');
console.log('Time:', new Date().toISOString());
console.log('CWD:', process.cwd());
const app = express();
const port = process.env.PORT || 3001;
// Global Traffic Logger (replaced by Morgan)
app.use(morgan('combined'));
app.use(helmet());
app.use(cookieParser());
app.use(globalLimiter); // Security: Rate Limiting
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
}));
app.use(express.json());
import { errorHandler } from "./middleware/error.middleware.js";
// ...
// Main API Mount
app.use("/api/v1", apiRoutes);
// Root Debug Route
app.get("/", (req, res) => {
    res.json({
        status: "online",
        message: "AIKB Backend DEBUG VERSION 1.0.2",
        paths: ["/health", "/api/v1/ping", "/api/v1/history"]
    });
});
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
// Centralized Error Handling
app.use(errorHandler);
if (process.env.NODE_ENV !== 'test') {
    app.listen(port, () => {
        console.log(`✅ SERVER ACTIVE ON PORT ${port}`);
    });
}
export default app;
//# sourceMappingURL=index.js.map