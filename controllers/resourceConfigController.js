import { ResourceTag } from "../models/resourceTag.model.js";

export const getResourceConfig = async (req, res) => {
    const { type = "", name = "config" } = req.query;
    const query = {};

    if (type) {
        query.resourceType = { $regex: new RegExp(`^${type}$`, "i") };
    }

    if (name && type !== "Navs") {
        query.name = name;
    }

    console.log("[GET] /resource-config → Query:", query);

    try {
        const config = await ResourceTag.find(query).lean();
        console.log("[GET] /resource-config → Found:", config.length);
        res.json(config || []);
    } catch (err) {
        console.error("[GET] /resource-config → Error:", err.stack);
        res.status(500).json({ error: "Failed to fetch resource configs" });
    }
};

export const upsertResourceConfigFields = async (req, res) => {
    const { resourceType, resourceName, fields } = req.body;

    console.log("[POST] /resource-config → Body:", req.body);

    if (!resourceType || !resourceName) {
        return res.status(400).json({
            error: "resourceType and resourceName are required",
        });
    }

    try {
        const updated = await ResourceTag.findOneAndUpdate(
            { resourceType, name: resourceName },
            {
                resourceType,
                name: resourceName,
                fields: Array.isArray(fields) ? fields : [],
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true,
            }
        );

        console.log("[POST] /resource-config → Upserted:", updated._id);
        res.json({ success: true, config: updated });
    } catch (err) {
        console.error("[POST] /resource-config → Error:", err.stack);
        res.status(500).json({ error: "Failed to save resource config" });
    }
};


// controllers/resourceConfigController.js

export const updateResourceConfigById = async (req, res) => {
    const { id } = req.params;
    const { fields } = req.body;

    console.log(`[PUT] /resource-config/${id} → Update Fields`, fields);

    if (!Array.isArray(fields)) {
        return res.status(400).json({ error: "fields must be an array" });
    }

    try {
        const updated = await ResourceTag.findByIdAndUpdate(
            id,
            { fields },
            { new: true }
        );

        if (!updated) {
            return res.status(404).json({ error: "Resource config not found" });
        }

        console.log(`[PUT] /resource-config/${id} → Updated`, updated.fields);
        return res.json({ success: true, config: updated });
    } catch (err) {
        console.error(`[PUT] /resource-config/${id} → Error:`, err.stack);
        res.status(500).json({ error: "Failed to update fields" });
    }
};
