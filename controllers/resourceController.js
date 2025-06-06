import { ResourceTag } from "../models/resourceTag.model.js";
import mongoose from "mongoose";

export const getResources = async (req, res) => {
    const { type = "", name = "" } = req.query;
    const options = {};

    if (type) options.resourceType = new RegExp(`^${type}$`, "i");
    if (name && type !== "Navs") {
        options.name = name;
    } else {
        options.$and = [
            { name: { $ne: "config" } },
            { name: { $ne: "default" } },
        ];
    }

    console.log("[GET] /resources → Query:", req.query);
    console.log("[GET] /resources → Mongo Filter:", options);

    try {
        const rawConfigs = await ResourceTag.find(options).lean();
        console.log("[GET] /resources → Found:", rawConfigs.length);

        const resources = rawConfigs.map(config => {
            const structured = {};
            if (Array.isArray(config.values)) {
                config.values.forEach(pair => {
                    if (pair?.field) structured[pair.field] = pair.value;
                });
            }
            return {
                id: config._id,
                resourceType: config.resourceType,
                name: config.name,
                ...structured,
            };
        });

        res.json(resources);
    } catch (err) {
        console.error("[GET] /resources → Fetch error:", err.stack);
        res.status(500).json({ error: "Failed to fetch resource configs" });
    }
};

export const getResourceById = async (req, res) => {
    console.log("[GET] /resources/:id → ID:", req.params.id);
    try {
        const data = await ResourceTag.findById(req.params.id);
        if (!data) {
            console.warn("[GET] /resources/:id → Not found");
            return res.status(404).json({ error: "Resource not found" });
        }
        console.log("[GET] /resources/:id → Found:", data);
        res.json(data);
    } catch (err) {
        console.error("[GET] /resources/:id → Error:", err.stack);
        res.status(500).json({ error: err.message });
    }
};

export const getTypes = async (req, res) => {
    try {
        const types = await ResourceTag.distinct("resourceType");
        console.log("[GET] /resources/types → Types:", types);
        res.json(types);
    } catch (err) {
        console.error("[GET] /resources/types → Error:", err.stack);
        res.status(500).json({ error: err.message });
    }
};

export const getResourcesByType = async (req, res) => {
    const { type } = req.params;
    console.log("[GET] /resources/type/:type → Type:", type);
    try {
        const data = await ResourceTag.find({ resourceType: type });
        console.log("[GET] /resources/type/:type → Found:", data.length);
        res.json(data);
    } catch (err) {
        console.error("[GET] /resources/type/:type → Error:", err.stack);
        res.status(500).json({ error: err.message });
    }
};

export const getOptionsByType = async (req, res) => {
    const { resourceType } = req.params;
    console.log("[GET] /resources/options/:resourceType → Type:", resourceType);

    try {
        const resources = await ResourceTag.find({
            resourceType,
            name: { $ne: "config" },
        });

        const options = resources.map(r => {
            const valueObject = {};
            if (Array.isArray(r.values)) {
                for (const pair of r.values) {
                    if (pair?.fieldName) {
                        valueObject[pair.fieldName] = pair.value;
                    }
                }
            }

            console.log(`[Resource] ${r.name} →`, valueObject);

            return {
                label: r.name,
                ...valueObject,
            };
        });

        console.log("[GET] /resources/options/:resourceType → Total Options:", options.length);
        res.json(options);
    } catch (err) {
        console.error("[GET] /resources/options/:resourceType → Error:", err.stack);
        res.status(500).json({ error: "Failed to get options by type" });
    }
};


export const createResource = async (req, res) => {
    const { resourceType, resourceName, fields = [], values = {} } = req.body;
    console.log("[POST] /resources → Body:", req.body);

    if (!resourceType || !resourceName) {
        console.warn("[POST] /resources → Missing required fields");
        return res.status(400).json({ error: "resourceType and resourceName are required" });
    }

    try {


        const valuesArray = Object.entries(values).map(([key, value]) => ({
            fieldName: key,
            value,
        }));

        const created = await ResourceTag.create({
            resourceType,
            name: resourceName,
            fields,
            values: valuesArray,
        });

        console.log("[POST] /resources → Created:", created._id);
        res.json({ success: true, config: created });
    } catch (err) {
        console.error("[POST] /resources → Error:", err.stack);
        res.status(500).json({ error: "Failed to save resource config" });
    }
};

export const updateResourceById = async (req, res) => {
    const { id } = req.params;
    const values = req.body;
    console.log("[PUT] /resources/:id → ID:", id);
    console.log("[PUT] /resources/:id → Body:", req.body);

    try {
        const valuesArray = Object.entries(values).map(([key, value]) => ({
            fieldName: key,
            value,
        }));
        console.log(valuesArray, 'values')
        const updated = await ResourceTag.findByIdAndUpdate(
            id,
            {
                // resourceType,
                // name: resourceName,
                // fields,
                values: valuesArray,
            },
            { new: true }
        );

        if (!updated) {
            console.warn("[PUT] /resources/:id → Not found");
            return res.status(404).json({ error: "Resource not found" });
        }

        console.log("[PUT] /resources/:id → Updated:", updated._id);
        res.json({ success: true, config: updated });
    } catch (err) {
        console.error("[PUT] /resources/:id → Error:", err.stack);
        res.status(500).json({ error: "Failed to update resource" });
    }
};

export const deleteResource = async (req, res) => {
    const { _id, title, type } = req.body;
    const options = {};

    if (!_id) {
        console.warn("[DELETE] /resources → Missing _id or title");
        return res.status(400).json({ error: "_id or title is required" });
    }

    if (_id) options._id = new mongoose.Types.ObjectId(_id);
    if (title) options.name = title;
    if (type) options.resourceType = type;

    console.log("[DELETE] /resources → Query:", options);

    try {
        const deleted = await ResourceTag.deleteOne(options);
        console.log("[DELETE] /resources → Deleted count:", deleted.deletedCount);
        res.json({ success: deleted.deletedCount === 1 });
    } catch (err) {
        console.error("[DELETE] /resources → Error:", err.stack);
        res.status(500).json({ error: "Failed to delete resource config" });
    }
};
