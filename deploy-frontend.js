/**
 * Frontend Deployment Script
 * Deploys to S3 and invalidates CloudFront cache
 */

const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { CloudFrontClient, CreateInvalidationCommand } = require('@aws-sdk/client-cloudfront');
const fs = require('fs');
const path = require('path');

const BUCKET_NAME = 'test-report-frontend-googerfarm';
const DISTRIBUTION_ID = 'EE1JM7DNABPO9';
const REGION = 'ap-northeast-2';

const s3Client = new S3Client({ region: REGION });
const cfClient = new CloudFrontClient({ region: REGION });

const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.pdf': 'application/pdf'
};

function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return mimeTypes[ext] || 'application/octet-stream';
}

function getFilesToDeploy(dir, baseDir = dir) {
    const files = [];
    const items = fs.readdirSync(dir);

    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            // Skip certain directories
            if (['node_modules', '.git', 'aws-backend', 'docs', 'migration', '.serverless'].includes(item)) {
                continue;
            }
            files.push(...getFilesToDeploy(fullPath, baseDir));
        } else {
            // Skip certain files
            if (item.startsWith('.') || item === 'deploy-frontend.js' || item === 'package-lock.json') {
                continue;
            }
            const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
            files.push({ fullPath, relativePath });
        }
    }

    return files;
}

async function uploadFile(file) {
    const content = fs.readFileSync(file.fullPath);
    const contentType = getMimeType(file.fullPath);

    await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: file.relativePath,
        Body: content,
        ContentType: contentType
    }));

    console.log(`  Uploaded: ${file.relativePath}`);
}

async function invalidateCache() {
    console.log('\nInvalidating CloudFront cache...');

    await cfClient.send(new CreateInvalidationCommand({
        DistributionId: DISTRIBUTION_ID,
        InvalidationBatch: {
            CallerReference: `deploy-${Date.now()}`,
            Paths: {
                Quantity: 1,
                Items: ['/*']
            }
        }
    }));

    console.log('CloudFront cache invalidation started.');
}

async function deploy() {
    console.log('Starting frontend deployment...\n');

    const projectDir = path.dirname(__filename);
    const files = getFilesToDeploy(projectDir);

    console.log(`Found ${files.length} files to deploy.\n`);

    console.log('Uploading files to S3...');
    for (const file of files) {
        await uploadFile(file);
    }

    await invalidateCache();

    console.log('\nDeployment complete!');
    console.log(`Frontend URL: https://d2xxbg7ux9llp7.cloudfront.net/`);
}

deploy().catch(err => {
    console.error('Deployment failed:', err);
    process.exit(1);
});
