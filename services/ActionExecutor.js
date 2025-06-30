class ActionExecutor {
    constructor(template, parameters) {
        this.template = template;
        this.parameters = parameters;
        this.entity = template.entity;
    }

    async execute() {
        // Run pre-hooks if any
        if (this.template.pre_hooks) {
            await this.runHooks(this.template.pre_hooks);
        }

        // Execute main action
        let result;
        switch (this.template.action_type) {
            case 'create':
                result = await this.handleCreate();
                break;
            case 'read':
                result = await this.handleRead();
                break;
            case 'update':
                result = await this.handleUpdate();
                break;
            case 'delete':
                result = await this.handleDelete();
                break;
            default:
                throw new Error('Unsupported action type');
        }

        // Run post-hooks if any
        if (this.template.post_hooks) {
            await this.runHooks(this.template.post_hooks, result);
        }

        return result;
    }

    async handleCreate() {
        const data = this.resolveParameters(this.template.fields);
        return await db[this.entity].create({ data });
    }

    async handleRead() {
        const where = this.buildConditions();
        const select = this.template.fields || undefined;

        // Handle aggregations
        if (this.template.aggregations) {
            return this.handleAggregations(where);
        }

        return await db[this.entity].findMany({ where, select });
    }

    async handleUpdate() {
        const where = this.buildConditions();
        const data = this.resolveParameters(this.template.fields);
        return await db[this.entity].updateMany({ where, data });
    }

    async handleDelete() {
        const where = this.buildConditions();
        return await db[this.entity].deleteMany({ where });
    }

    buildConditions() {
        if (!this.template.conditions) return {};

        return this.resolveParameters(this.template.conditions);
    }

    resolveParameters(obj) {
        // Deep clone the object
        const resolved = JSON.parse(JSON.stringify(obj));

        // Process all string values looking for parameter references
        const process = (value) => {
            if (typeof value === 'string' && value.startsWith('$param.')) {
                const paramName = value.replace('$param.', '');
                return this.parameters[paramName] ?? value;
            }
            return value;
        };

        // Recursively process the object
        const traverse = (o) => {
            for (const key in o) {
                if (typeof o[key] === 'object' && o[key] !== null) {
                    traverse(o[key]);
                } else {
                    o[key] = process(o[key]);
                }
            }
        };

        traverse(resolved);
        return resolved;
    }

    async handleAggregations(where) {
        const result = {};

        for (const [aggType, field] of Object.entries(this.template.aggregations)) {
            switch (aggType) {
                case 'count':
                    result.count = await db[this.entity].count({ where });
                    break;
                case 'sum':
                    result.sum = await db[this.entity].aggregate({
                        where,
                        _sum: { [field]: true }
                    });
                    break;
                case 'avg':
                    result.avg = await db[this.entity].aggregate({
                        where,
                        _avg: { [field]: true }
                    });
                    break;
                // Add more aggregation types as needed
            }
        }

        return result;
    }

    async runHooks(hooks, initialResult) {
        for (const hook of hooks) {
            const executor = new ActionExecutor(hook, {
                ...this.parameters,
                previousResult: initialResult
            });
            await executor.execute();
        }
    }
}