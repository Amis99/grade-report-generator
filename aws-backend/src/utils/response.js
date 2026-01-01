/**
 * API Response Helpers
 */

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Content-Type': 'application/json'
};

/**
 * Success response
 */
function success(data, statusCode = 200) {
    return {
        statusCode,
        headers: CORS_HEADERS,
        body: JSON.stringify({
            success: true,
            data
        })
    };
}

/**
 * Error response
 */
function error(message, statusCode = 400, details = null) {
    const body = {
        success: false,
        error: {
            message,
            ...(details && { details })
        }
    };

    return {
        statusCode,
        headers: CORS_HEADERS,
        body: JSON.stringify(body)
    };
}

/**
 * Not found response
 */
function notFound(message = 'Resource not found') {
    return error(message, 404);
}

/**
 * Unauthorized response
 */
function unauthorized(message = 'Unauthorized') {
    return error(message, 401);
}

/**
 * Forbidden response
 */
function forbidden(message = 'Forbidden') {
    return error(message, 403);
}

/**
 * Validation error response
 */
function validationError(message, details = null) {
    return error(message, 422, details);
}

/**
 * Internal server error response
 */
function serverError(message = 'Internal server error') {
    return error(message, 500);
}

/**
 * Parse request body
 */
function parseBody(event) {
    try {
        return event.body ? JSON.parse(event.body) : {};
    } catch (e) {
        return {};
    }
}

/**
 * Get path parameter
 */
function getPathParam(event, name) {
    return event.pathParameters?.[name] || null;
}

/**
 * Get query parameter
 */
function getQueryParam(event, name, defaultValue = null) {
    return event.queryStringParameters?.[name] || defaultValue;
}

/**
 * Get user info from Cognito authorizer
 */
function getUserFromEvent(event) {
    const claims = event.requestContext?.authorizer?.claims;
    if (!claims) return null;

    return {
        sub: claims.sub,
        email: claims.email,
        name: claims.name || claims['custom:name'],
        organization: claims['custom:organization'],
        role: claims['custom:role']
    };
}

module.exports = {
    success,
    error,
    notFound,
    unauthorized,
    forbidden,
    validationError,
    serverError,
    parseBody,
    getPathParam,
    getQueryParam,
    getUserFromEvent,
    CORS_HEADERS
};
