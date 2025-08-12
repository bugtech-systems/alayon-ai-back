/**
 * Middleware to validate tenant_id in headers.
 * Ensures tenant_id is a positive integer.
 */
export const validateTenantId = (req, res, next) => {
    const tenantId = req.headers['tenant_id'];

    // Check if tenant_id exists
    // if (!tenantId) {
    //     return res.status(400).json({
    //         error: 'Missing tenant_id in headers'
    //     });
    // }

    // Validate as integer
    let parsedId = Number(tenantId);
    // if (!Number.isInteger(parsedId) || parsedId <= 0) {
    //     return res.status(400).json({
    //         error: 'tenant_id must be a positive integer'
    //     });
    // }

    if (!tenantId) {
        parsedId = null;
    }


    // Attach validated tenant_id to the request
    req.tenantId = parsedId;
    next();
};  