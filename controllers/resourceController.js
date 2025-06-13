import { ResourceTag } from "../models/resourceTag.model.js";
import mongoose from "mongoose";

export const getResources = async (req, res) => {
    const { type = "", name = "" } = req.query;
    const options = {};

    // Add resourceParent filter if exists in request
    if (req.resourceParent) {
        options.resourceParent = req.resourceParent._id;
    }

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
                resourceParent: config.resourceParent,
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
        const query = { _id: req.params.id };

        // Add resourceParent filter if exists in request
        if (req.resourceParent) {
            query.resourceParent = req.resourceParent._id;
        }

        const data = await ResourceTag.findOne(query);
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
        const query = {};

        // Add resourceParent filter if exists in request
        if (req.resourceParent) {
            query.resourceParent = req.resourceParent._id;
        }

        const types = await ResourceTag.distinct("resourceType", query);
        console.log("[GET] /resources/types → Types:", types);
        res.json(types);
    } catch (err) {
        console.error("[GET] /resources/types → Error:", err.stack);
        res.status(500).json({ error: err.message });
    }
};

export const getResourcesByType = async (req, res) => {
    const { type } = req.params;
    const query = { resourceType: type };

    // Add resourceParent filter if exists in request
    if (req.resourceParent) {
        query.resourceParent = req.resourceParent._id;
    }

    console.log("[GET] /resources/type/:type → Type:", type);
    try {
        const data = await ResourceTag.find(query);
        console.log("[GET] /resources/type/:type → Found:", data.length);
        res.json(data);
    } catch (err) {
        console.error("[GET] /resources/type/:type → Error:", err.stack);
        res.status(500).json({ error: err.message });
    }
};

export const getOptionsByType = async (req, res) => {
    const { resourceType } = req.params;
    const query = {
        type: { $ne: "config" },
        name: resourceType,
    };

    // Add resourceParent filter if exists in request
    if (req.resourceParent) {
        query.resourceParent = req.resourceParent._id;
    }

    console.log("[GET] /resources/options/:resourceType → Type:", resourceType);

    try {
        const resources = await ResourceTag.find(query);

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
                resourceParent: r.resourceParent,
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
    const { resourceType, resourceName, name, fields = [], values = {} } = req.body;
    console.log("[POST] /resources → Body:", req.body);

    if (!resourceType) {
        console.warn("[POST] /resources → Missing required fields");
        return res.status(400).json({ error: "resourceType is required" });
    }

    try {
        const valuesArray = Object.entries(values).map(([key, value]) => ({
            fieldName: key,
            value,
        }));

        const resourceData = {
            resourceType,
            name: resourceName ? resourceName : name,
            fields,
            values: valuesArray,
        };

        // Set resourceParent if exists in request
        if (req.resourceParent) {
            resourceData.resourceParent = req.resourceParent._id;
        }

        const created = await ResourceTag.create(resourceData);

        console.log("[POST] /resources → Created:", created._id);
        res.status(201).json({
            success: true,
            resource: created,
            parent: req.resourceParent ? req.resourceParent._id : null
        });
    } catch (err) {
        console.error("[POST] /resources → Error:", err.stack);
        res.status(500).json({ error: "Failed to save resource config" });
    }
};

export const updateResourceById = async (req, res) => {
    const { id } = req.params;
    const { values } = req.body;
    let newValues = values;

    console.log("[PUT] /resources/:id → ID:", id);
    console.log("[PUT] /resources/:id → Body:", newValues);

    try {
        // Build query with resourceParent check if exists
        const query = { _id: id };
        if (req.resourceParent) {
            query.resourceParent = req.resourceParent._id;
        }

        // 1. Find existing resource
        const existing = await ResourceTag.findOne(query);
        if (!existing) {
            console.warn("[PUT] /resources/:id → Not found");
            return res.status(404).json({ error: "Resource not found" });
        }

        // 2. Convert existing values to a Map for easy merging
        const valueMap = new Map();
        for (const val of existing.values || []) {
            valueMap.set(val.fieldName, val.value);
        }

        // 3. Overwrite values with new input
        for (const [key, value] of Object.entries(newValues)) {
            valueMap.set(key, value);
        }

        // 4. Convert back to array
        const mergedValuesArray = Array.from(valueMap.entries()).map(([fieldName, value]) => ({
            fieldName,
            value,
        }));

        // 5. Update resource with merged values
        existing.values = mergedValuesArray;
        const updated = await existing.save();

        console.log("[PUT] /resources/:id → Updated:", updated._id);
        res.json({
            success: true,
            resource: updated,
            parent: req.resourceParent ? req.resourceParent._id : null
        });
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

    // Add resourceParent filter if exists in request
    if (req.resourceParent) {
        options.resourceParent = req.resourceParent._id;
    }

    console.log("[DELETE] /resources → Query:", options);

    try {
        // First check if resource exists with the parent constraint
        const resource = await ResourceTag.findOne(options);
        if (!resource) {
            return res.status(404).json({ error: "Resource not found" });
        }

        // Then delete it
        const deleted = await ResourceTag.deleteOne({ _id: resource._id });
        console.log("[DELETE] /resources → Deleted count:", deleted.deletedCount);

        res.json({
            success: deleted.deletedCount === 1,
            parent: req.resourceParent ? req.resourceParent._id : null
        });
    } catch (err) {
        console.error("[DELETE] /resources → Error:", err.stack);
        res.status(500).json({ error: "Failed to delete resource config" });
    }
};