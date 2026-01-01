/**
 * S3 Client for PDF file operations
 */
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-northeast-2' });
const PDF_BUCKET = process.env.PDF_BUCKET;

/**
 * Upload PDF file
 * @param {string} examId - Exam ID
 * @param {string} fileName - Original file name
 * @param {Buffer} fileBuffer - File content as Buffer
 * @returns {string} S3 key
 */
async function uploadPdf(examId, fileName, fileBuffer) {
    const key = `exams/${examId}/${fileName}`;

    const params = {
        Bucket: PDF_BUCKET,
        Key: key,
        Body: fileBuffer,
        ContentType: 'application/pdf'
    };

    await s3Client.send(new PutObjectCommand(params));
    return key;
}

/**
 * Get presigned URL for downloading PDF
 * @param {string} key - S3 key
 * @param {number} expiresIn - URL expiration in seconds (default 1 hour)
 * @returns {string} Presigned URL
 */
async function getDownloadUrl(key, expiresIn = 3600) {
    const params = {
        Bucket: PDF_BUCKET,
        Key: key
    };

    const command = new GetObjectCommand(params);
    return await getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Get presigned URL for uploading PDF
 * @param {string} examId - Exam ID
 * @param {string} fileName - Original file name
 * @param {number} expiresIn - URL expiration in seconds (default 1 hour)
 * @returns {Object} { uploadUrl, key }
 */
async function getUploadUrl(examId, fileName, expiresIn = 3600) {
    const key = `exams/${examId}/${fileName}`;

    const params = {
        Bucket: PDF_BUCKET,
        Key: key,
        ContentType: 'application/pdf'
    };

    const command = new PutObjectCommand(params);
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });

    return { uploadUrl, key };
}

/**
 * Delete PDF file
 * @param {string} key - S3 key
 */
async function deletePdf(key) {
    if (!key) return;

    const params = {
        Bucket: PDF_BUCKET,
        Key: key
    };

    try {
        await s3Client.send(new DeleteObjectCommand(params));
    } catch (error) {
        console.error('Error deleting PDF:', error);
    }
}

/**
 * Get PDF file content
 * @param {string} key - S3 key
 * @returns {Buffer} File content
 */
async function getPdfContent(key) {
    const params = {
        Bucket: PDF_BUCKET,
        Key: key
    };

    const response = await s3Client.send(new GetObjectCommand(params));
    return await streamToBuffer(response.Body);
}

/**
 * Convert stream to buffer
 */
async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

module.exports = {
    s3Client,
    uploadPdf,
    getDownloadUrl,
    getUploadUrl,
    deletePdf,
    getPdfContent
};
