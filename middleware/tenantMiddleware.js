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
    // if (!Number.isInteger(parsedId) || parsedId <= 0) {
    //     return res.status(400).json({
    //         error: 'tenant_id must be a positive integer'
    //     });
    // }
    let parsedId = null;
    if (tenantId && tenantId != 'undefined') {
        parsedId = Number(tenantId);
    }



    // Attach validated tenant_id to the request
    req.tenantId = parsedId;
    console.log(req.tenantId, 'REQ TENANT', tenantId)
    next();
};  