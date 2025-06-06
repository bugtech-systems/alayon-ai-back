import express from "express";
import {
    getResources,
    getResourceById,
    getTypes,
    getResourcesByType,
    getOptionsByType,
    createResource,
    updateResourceById,
    deleteResource
} from "../controllers/resourceController.js";
// import { authenticateJWT } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/",
    // authenticateJWT,
    getResources);
router.get("/types",
    // authenticateJWT, 
    getTypes);
router.get("/type/:type",
    // authenticateJWT, 
    getResourcesByType);
router.get("/options/:resourceType",
    // authenticateJWT, 
    getOptionsByType);

router.get("/:id",
    // authenticateJWT,
    getResourceById);

router.post("/",
    // authenticateJWT, 
    createResource);

router.put("/:id",
    // authenticateJWT,
    updateResourceById);

router.delete("/",
    // authenticateJWT,
    deleteResource);

export default router;
