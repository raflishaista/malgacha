// Ensure the production server binds to 0.0.0.0 and uses port 8080 on Fly.io when PORT is not explicitly set.
process.env.HOST ??= '0.0.0.0';
process.env.PORT ??= process.env.FLY_APP_NAME || process.env.FLY_MACHINE_ID ? '8080' : '3000';
process.env.BODY_SIZE_LIMIT ??= '15M';

await import('./build/index.js');
