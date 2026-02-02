const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const s3 = new S3Client({ region: 'ap-northeast-2' });
const BUCKET = 'test-report-frontend-googerfarm';
const BASE_DIR = __dirname;

const EXCLUDE = ['node_modules', '.git', 'aws-backend', 'migration', 'docs', '.claude', 'nul', '_deploy_frontend.js'];
const EXCLUDE_EXT = ['.md'];

function getMimeType(file) {
    const ext = path.extname(file).toLowerCase();
    const types = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
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
        '.pdf': 'application/pdf',
        '.xml': 'application/xml',
        '.txt': 'text/plain',
    };
    return types[ext] || 'application/octet-stream';
}

function getAllFiles(dir, base) {
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(base, fullPath).split(path.sep).join('/');

        if (EXCLUDE.some(e => relPath.startsWith(e) || entry.name === e)) continue;
        if (entry.isDirectory()) {
            files.push(...getAllFiles(fullPath, base));
        } else {
            if (EXCLUDE_EXT.some(ext => entry.name.endsWith(ext))) continue;
            files.push({ fullPath, key: relPath });
        }
    }
    return files;
}

async function main() {
    const files = getAllFiles(BASE_DIR, BASE_DIR);
    console.log('Uploading ' + files.length + ' files to s3://' + BUCKET + ' ...');

    let uploaded = 0;
    for (const file of files) {
        const body = fs.readFileSync(file.fullPath);
        await s3.send(new PutObjectCommand({
            Bucket: BUCKET,
            Key: file.key,
            Body: body,
            ContentType: getMimeType(file.fullPath),
            CacheControl: 'no-cache, must-revalidate',
        }));
        uploaded++;
        if (uploaded % 10 === 0) console.log('  ' + uploaded + '/' + files.length);
    }
    console.log('Done. Uploaded ' + uploaded + ' files.');
}

main().catch(e => { console.error(e); process.exit(1); });
