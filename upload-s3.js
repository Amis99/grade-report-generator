const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const s3Client = new S3Client({ region: 'ap-northeast-2' });
const BUCKET = 'test-report-frontend-googerfarm';
const ROOT_DIR = process.cwd();

const EXCLUDE_DIRS = ['aws-backend', '.git', 'node_modules', '.claude'];
const EXCLUDE_EXTENSIONS = ['.md'];

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

function getAllFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        const relativePath = path.relative(ROOT_DIR, filePath);
        if (EXCLUDE_DIRS.some(ex => relativePath.startsWith(ex))) continue;
        if (stat.isDirectory()) {
            getAllFiles(filePath, fileList);
        } else {
            if (EXCLUDE_EXTENSIONS.includes(path.extname(file))) continue;
            if (file === 'upload-s3.js') continue;
            fileList.push(filePath);
        }
    }
    return fileList;
}

async function uploadFile(filePath) {
    const key = path.relative(ROOT_DIR, filePath).split(path.sep).join('/');
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const fileContent = fs.readFileSync(filePath);
    await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: fileContent,
        ContentType: contentType
    }));
    return key;
}

async function main() {
    console.log('Scanning files...');
    const files = getAllFiles(ROOT_DIR);
    console.log('Found ' + files.length + ' files');
    let uploaded = 0;
    for (const file of files) {
        try {
            await uploadFile(file);
            uploaded++;
            if (uploaded % 20 === 0) console.log('Uploaded ' + uploaded + '/' + files.length);
        } catch (err) {
            console.error('Failed: ' + path.basename(file) + ' - ' + err.message);
        }
    }
    console.log('Done! ' + uploaded + ' files uploaded.');
}

main();
