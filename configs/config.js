export default {
    app: {
        port: process.env.PORT || 3000,
        env: process.env.NODE_ENV || 'development'
    },
    db: {
        syncOptions: {
            alter: process.env.NODE_ENV === 'development',
            force: false
        }
    },
    cors: {
        allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || '*'
    }
};