import "dotenv/config"; // Must be first to load env vars before other imports
import express from "express";
import cors from "cors";
import helmet from "helmet";
import apiRoutes from "./routes/api.routes.js";
const app = express();
const port = process.env.PORT || 3001;
// Trust first proxy (e.g. Nginx, Cloud Run)
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use("/api/v1", apiRoutes);
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
//# sourceMappingURL=index.js.map