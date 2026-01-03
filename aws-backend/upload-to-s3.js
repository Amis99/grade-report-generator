const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const BUCKET = 'test-report-frontend-googerfarm';
const REGION = 'ap-northeast-2';
const SOURCE_DIR = path.join(__dirname, '..');

const s3Client = new S3Client({ region: REGION });

const CONTENT_TYPES = {
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
    '.eot': 'application/vnd.ms-fontobject'
};

const EXCLUDE_DIRS = ['aws-backend', '.git', 'node_modules', '.claude'];
const EXCLUDE_EXTENSIONS = ['.md'];

function getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return CONTENT_TYPES[ext] || 'application/octet-stream';
}

function getAllFiles(dirPath, arrayOfFiles = [], basePath = SOURCE_DIR) {
    const files = fs.readdirSync(dirPath);

    for (const file of files) {
        const fullPath = path.join(dirPath, file);
        const relativePath = path.relative(basePath, fullPath);

        // Skip excluded directories
        if (EXCLUDE_DIRS.some(dir => relativePath.startsWith(dir))) {
            continue;
        }

        if (fs.statSync(fullPath).isDirectory()) {
            getAllFiles(fullPath, arrayOfFiles, basePath);
        } else {
            // Skip excluded extensions
            if (EXCLUDE_EXTENSIONS.some(ext => file.endsWith(ext))) {
                continue;
            }
            arrayOfFiles.push({
                fullPath,
                relativePath: relativePath.replace(/\\/g, '/')
            });
        }
    }

    return arrayOfFiles;
}

async function uploadFile(file) {
    const content = fs.readFileSync(file.fullPath);
    const contentType = getContentType(file.fullPath);

    await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: file.relativePath,
        Body: content,
        ContentType: contentType
    }));

    console.log(`  Uploaded: ${file.relativePath}`);
}

async function main() {
    console.log('='.repeat(50));
    console.log('Uploading frontend files to S3');
    console.log('='.repeat(50));
    console.log(`Bucket: ${BUCKET}`);
    console.log(`Source: ${SOURCE_DIR}`);
    console.log('='.repeat(50));

    const files = getAllFiles(SOURCE_DIR);
    console.log(`Found ${files.length} files to upload\n`);

    for (const file of files) {
        try {
            await uploadFile(file);
        } catch (error) {
            console.error(`  Error uploading ${file.relativePath}: ${error.message}`);
        }
    }

    console.log('\n' + '='.repeat(50));
    console.log('Upload complete!');
    console.log('='.repeat(50));
}

main().catch(console.error);
