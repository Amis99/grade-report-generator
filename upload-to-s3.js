const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { CloudFrontClient, CreateInvalidationCommand } = require('@aws-sdk/client-cloudfront');
const fs = require('fs');
const path = require('path');

const s3Client = new S3Client({ region: 'ap-northeast-2' });
const cfClient = new CloudFrontClient({ region: 'ap-northeast-2' });

const BUCKET = 'test-report-frontend-googerfarm';
const DISTRIBUTION_ID = 'EE1JM7DNABPO9';

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const EXCLUDE_DIRS = ['aws-backend', '.git', 'node_modules', 'migration'];
const EXCLUDE_FILES = ['upload-to-s3.js', 'package.json', 'package-lock.json'];

async function uploadFile(filePath, key) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);

    await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: content,
        ContentType: contentType
    }));

    console.log(`Uploaded: ${key}`);
}

async function uploadDirectory(dirPath, prefix = '') {
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const key = prefix ? `${prefix}/${item}` : item;
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            if (!EXCLUDE_DIRS.includes(item)) {
                await uploadDirectory(fullPath, key);
            }
        } else {
            if (!EXCLUDE_FILES.includes(item) && !item.endsWith('.md')) {
                await uploadFile(fullPath, key);
            }
        }
    }
}

async function invalidateCache() {
    const result = await cfClient.send(new CreateInvalidationCommand({
        DistributionId: DISTRIBUTION_ID,
        InvalidationBatch: {
            CallerReference: Date.now().toString(),
            Paths: {
                Quantity: 1,
                Items: ['/*']
            }
        }
    }));

    console.log(`\nCloudFront invalidation created: ${result.Invalidation.Id}`);
}

async function main() {
    console.log('Uploading files to S3...\n');
    const projectDir = __dirname;
    await uploadDirectory(projectDir);

    console.log('\nCreating CloudFront invalidation...');
    await invalidateCache();

    console.log('\nDone!');
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
