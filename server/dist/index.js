import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import apiRoutes from "./routes/api.routes.js";
console.log('--- BACKEND STARTUP SEQUENCE ---');
console.log('Time:', new Date().toISOString());
console.log('CWD:', process.cwd());
const app = express();
const port = process.env.PORT || 3001;
// Global Traffic Logger
app.use((req, res, next) => {
    console.log(`[TRAFFIC] ${req.method} ${req.url}`);
    next();
});
app.use(helmet());
app.use(cors());
app.use(express.json());
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
app.listen(port, () => {
    console.log(`✅ SERVER ACTIVE ON PORT ${port}`);
});
//# sourceMappingURL=index.js.map