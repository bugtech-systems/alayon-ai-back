import express from "express";
import { db } from "../config/db.js"; // Drizzle db instance
import { aiPresets } from "../db/schema.js";
import { ModelDeployer } from "../services/model-deployer.js";
import { eq, and, sql } from "drizzle-orm";

const router = express.Router();

// 🛠 Transaction wrapper
async function withTransaction(operation, res) {
  const tx = await db.transaction(async (trx) => {
    try {
      return await operation(trx);
    } catch (error) {
      console.error("Transaction error:", error);
      throw error;
    }
  });

  return tx;
}

// ➕ Create - POST /presets
router.post("/", async (req, res) => {
  try {
    await withTransaction(async (trx) => {
      const body = {
        ...req.body,
        model_name: `${req.body.model_name}_${req.tenantId}`,
        tenant_id: req.tenantId || null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const [preset] = await trx.insert(aiPresets).values(body).returning();

      await ModelDeployer.deployModel(preset.id, trx);
      res.status(201).json(preset);
    }, res);
  } catch (error) {
    res.status(500).json({ error: "Internal server error", message: error.message });
  }
});

// 📄 Read All - GET /presets
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, filters } = req.query;
    const offset = (page - 1) * limit;

    let conditions = [];
    if (req.tenantId) conditions.push(eq(aiPresets.tenant_id, req.tenantId));
    if (filters) {
      const parsed = JSON.parse(filters);
      for (const [key, value] of Object.entries(parsed)) {
        conditions.push(eq(aiPresets[key], value));
      }
    }

    const [rows, [{ count }]] = await Promise.all([
      db.select().from(aiPresets)
        .where(conditions.length ? and(...conditions) : sql`TRUE`)
        .limit(Number(limit))
        .offset(Number(offset)),
      db.select({ count: sql`COUNT(*)` }).from(aiPresets)
        .where(conditions.length ? and(...conditions) : sql`TRUE`),
    ]);

    res.json({
      data: rows,
      meta: {
        total: Number(count),
        page: Number(page),
        totalPages: Math.ceil(Number(count) / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching presets:", error);
    res.status(500).json({ error: "Internal server error", message: error.message });
  }
});

// 📄 Read Single - GET /presets/:id
router.get("/:id", async (req, res) => {
  try {
    const [preset] = await db
      .select()
      .from(aiPresets)
      .where(eq(aiPresets.id, Number(req.params.id)));

    if (!preset) return res.status(404).json({ error: "Preset not found" });

    res.json(preset);
  } catch (error) {
    res.status(500).json({ error: "Internal server error", message: error.message });
  }
});

// ✏️ Update - PUT /presets/:id
router.put("/:id", async (req, res) => {
  try {
  console.log( 'UPPDAAATEDINGG')
    await withTransaction(async (trx) => {
      const [updated] = await trx
        .update(aiPresets)
        .set({ ...req.body, created_at: new Date(), updated_at: new Date() })
        .where(eq(aiPresets.id, Number(req.params.id)))
        .returning();


console.log(updated, 'UPPDAAATED')
      if (!updated) {
        return res.status(404).json({ error: "Preset not found" });
      }


  console.log('DEEEEPLOOYING', req.tenantId)


      await ModelDeployer.deployModel(updated.id, trx);
      res.json(updated);
    }, res);
  } catch (error) {
    console.log(error, "ERROR")
    res.status(500).json({ error: "Internal server error", message: error.message });
  }
});

// ❌ Delete - DELETE /presets/:id
router.delete("/:id", async (req, res) => {
  try {
    await withTransaction(async (trx) => {
      await ModelDeployer.removeFromModel(req.params.id, trx);

      const deleted = await trx
        .delete(aiPresets)
        .where(
          and(
            eq(aiPresets.id, Number(req.params.id)),
            req.tenantId ? eq(aiPresets.tenant_id, req.tenantId) : sql`TRUE`
          )
        )
        .returning();

      if (!deleted.length) {
        return res.status(404).json({ error: "Preset not found" });
      }

      res.status(200).json({ message: "Preset Deleted!" });
    }, res);
  } catch (error) {
    res.status(500).json({ error: "Internal server error", message: error.message });
  }
});

// 🚀 Deploy - POST /presets/deploy/:id
router.post("/deploy/:id", async (req, res) => {
  try {
    await withTransaction(async (trx) => {
      const [model] = await trx
        .select()
        .from(aiPresets)
        .where(eq(aiPresets.id, Number(req.params.id)));

      if (!model) {
        return res.status(404).json({ error: "Preset not found" });
      }

      console.log(`[DEPLOY] Starting deployment for: ${model.model_name}`);
      await ModelDeployer.deployModel(model.id, trx);
      console.log(`[DEPLOY] ✓ Successfully deployed: ${model.model_name}`);

      res.status(200).json({
        message: `Model ${model.model_name} deployed successfully`,
        model: {
          id: model.id,
          name: model.model_name,
          base_model: model.base_model,
        },
      });
    }, res);
  } catch (error) {
    res.status(500).json({ error: "Internal server error", message: error.message });
  }
});

export default router;
