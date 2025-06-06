import express from "express";
import {
    getResourceConfig,
    upsertResourceConfigFields,
    updateResourceConfigById
} from "../controllers/resourceConfigController.js";

const router = express.Router();

router.get("/", getResourceConfig);
router.post("/", upsertResourceConfigFields);
router.put("/:id", updateResourceConfigById); // PUT /resource-config/:id

export default router;
