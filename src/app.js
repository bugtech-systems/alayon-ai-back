import express from "express";
import cors from "cors";
import morgan from "morgan";
import resourceTagRoutes from "./routes/resourceTag.routes.js";
import resourceTypeRoutes from "./routes/resourceType.routes.js";
import aiPresetRoutes from "./routes/aiPreset.routes.js";
import resourceQueryRoutes from "./controllers/resourceTag.controller.js";


import actionTemplateRoutes from "./routes/actionTemplate.routes.js";

import errorHandler from "./middlewares/errorHandler.js";
import { validateTenantId } from "../middleware/tenantMiddleware.js";

const app = express();

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use(validateTenantId); // Global


// Routes

app.use("/apiv2/resources", resourceTagRoutes);
app.use("/apiv2/query", resourceQueryRoutes);

app.use("/apiv2/resource-types", resourceTypeRoutes);
app.use("/apiv2/action-templates", actionTemplateRoutes);
app.use("/apiv2/ai-presets", aiPresetRoutes);



// Health check
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Error handler
app.use(errorHandler);

export default app;
