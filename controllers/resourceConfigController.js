import { ResourceTag } from "../models/resourceTag.model.js";

export const getResourceConfig = async (req, res) => {
    const { type } = req.params;
    const query = {
        type: 'config'
    };

    if (type) {
        query.name = { $regex: new RegExp(`^${type}$`, "i") };
    }



    console.log("[GET] /resource-config → Query:", query);

    try {
        const config = await ResourceTag.find(query).lean();
        console.log("[GET] /resource-config → Found:", config.length);
        res.json({ success: true, data: config });
    } catch (err) {
        console.error("[GET] /resource-config → Error:", err.stack);
        res.status(500).json({ error: "Failed to fetch resource configs" });
    }
};

export const upsertResourceConfigFields = async (req, res) => {
    const { name, fields } = req.body;

    console.log("[POST] /resource-config → Body:", req.body);

    if (!name) {
        return res.status(400).json({
            error: "resourceType and resourceName are required",
        });
    }

    try {
        const updated = await ResourceTag.findOneAndUpdate(
            { type: 'config', name },
            {
                type: 'config',
                name,
                fields: Array.isArray(fields) ? fields : [],
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true,
            }
        );

        console.log("[POST] /resource-config → Upserted:", updated._id);
        res.json({ success: true, data: updated });
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
