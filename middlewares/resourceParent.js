import { ResourceTag } from "../models/resourceTag.model.js";

export async function resourceParent(req, res, next) {
    const parentId = req.headers['parent-id'] || req?.body?.resourceParent;
    console.log(parentId, 'PARR', req.headers['parent-id'], req.headers)
    if (!parentId) {
        return next();
    }

    try {
        const parent = await ResourceTag.findById(parentId);
        if (!parent) {
            return res.status(404).json({ message: 'Parent resource not found' });
        }

        req.parentId = parentId;
        req.resourceParent = parent;
        next();
    } catch (error) {
        res.status(500).json({
            message: 'Error fetching parent resource',
            error: error.message
        });
    }
}