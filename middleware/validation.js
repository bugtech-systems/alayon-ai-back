export function validateRequest(rules) {
    return (req, res, next) => {
        const errors = {};

        // Validate body
        if (rules.body) {
            for (const [field, rule] of Object.entries(rules.body)) {
                if (rule.required && !req.body[field]) {
                    errors[field] = `${field} is required`;
                } else if (req.body[field] && rule.type && typeof req.body[field] !== rule.type) {
                    errors[field] = `${field} must be a ${rule.type}`;
                }
            }
        }

        if (Object.keys(errors).length > 0) {
            return res.status(400).json({ errors });
        }

        next();
    };
}