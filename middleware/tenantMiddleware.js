import { sanitizePhoneNumber } from "../helpers/helpers.js";
import { generateId } from "../src/services/contextManager.js";
// import { getOrganizationsByNumber } from "../src/services/resourceTag.service.js";
// import { isValidPhilippinePhoneNumber } from "../src/utils/helpers.js";

/**
 * Middleware to validate tenant_id in headers.
 * Ensures tenant_id is a positive integer.
 */
export const validateTenantId = async  (req, res, next) => {
    try {
    const tenantId = req.headers['tenant_id'];
    const sessionId = req.headers['session_id'];


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
        console.log(sessionId, 'Initial sessionId', req.headers)

    let parsedId = null;
    if (tenantId && tenantId != 'undefined') {
        parsedId = Number(tenantId);
    }
    
    let parsedSessionId = null;
    if (sessionId && sessionId != 'undefined') {
        parsedSessionId = String(sessionId).length > 12 ? sessionId : `sess_${sanitizePhoneNumber(sessionId)}`;
    } else {
        parsedSessionId = generateId();    
    }
    




    // Attach validated tenant_id to the request
    req.tenantId = parsedId;
    req.sessionId = parsedSessionId;
    console.log(req.sessionId, 'MIDDLE SESSION ID')
    next();
    } catch(err) {
        console.log(err, 'ERR TENANT');
                return res.status(400).json({
            error: 'Something went wrong!', err
         });
    }
     
};  