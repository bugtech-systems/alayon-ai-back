import { ActionService } from '../services/ActionTriggerService.js';
import { db } from '../models/index.js';

export const createTemplate = async (req, res) => {
    try {
        const template = await db.ActionTemplate.create(req.body);
        res.status(201).json(template);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const getTemplates = async (req, res) => {
    try {
        const templates = await db.ActionTemplate.findAll();
        res.json(templates);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const createTrigger = async (req, res, next) => {
    try {

        const trigger = await ActionService.createTrigger(
            req.params.templateId,
            req.body
        );
        res.status(201).json(trigger);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const executeNow = async (req, res) => {
    try {



        console.log('eee', req.body)

        const result = await ActionService.executeAction(
            req.params.templateId,
            req.body.parameters,
            req.body.initiator
        );
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const getAuditLogs = async (req, res) => {
    try {
        const { page = 1, limit = 50, ...query } = req.query;
        const logs = await db.AuditLog.findAll({
            where: query,
            include: [db.ActionTemplate],
            order: [['executed_at', 'DESC']],
            limit: parseInt(limit),
            offset: (page - 1) * limit
        });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const cancelTrigger = async (req, res) => {
    try {
        const trigger = await db.ActionTrigger.findByPk(req.params.triggerId);
        if (!trigger) {
            return res.status(404).json({ error: 'Trigger not found' });
        }

        await ActionService.cancelTrigger(trigger.id);
        await trigger.update({ is_active: false });

        res.json({ message: 'Trigger cancelled successfully' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};