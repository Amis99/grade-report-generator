/**
 * Firebase to AWS DynamoDB Migration Script
 *
 * Usage:
 * 1. Export Firebase data to JSON file
 * 2. Run: node migration/firebase-to-dynamodb.js <firebase-export.json>
 *
 * Prerequisites:
 * - AWS credentials configured
 * - DynamoDB tables already created (via serverless deploy)
 * - S3 bucket created for PDFs
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

// Configuration
const REGION = process.env.AWS_REGION || 'ap-northeast-2';
const STAGE = process.env.STAGE || 'dev';

const TABLE_NAMES = {
    EXAMS: `TestReportExams-${STAGE}`,
    QUESTIONS: `TestReportQuestions-${STAGE}`,
    STUDENTS: `TestReportStudents-${STAGE}`,
    ANSWERS: `TestReportAnswers-${STAGE}`,
    USERS: `TestReportUsers-${STAGE}`,
    REGISTRATIONS: `TestReportRegistrations-${STAGE}`
};

const PDF_BUCKET = process.env.PDF_BUCKET || `test-report-pdfs-${STAGE}`;

// Initialize clients
const dynamoClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({ region: REGION });

// Utility functions
function normalizeStudentName(name) {
    return name.trim().replace(/\s+/g, '');
}

function normalizeSchoolName(school) {
    return school.trim().replace(/\s+/g, '').replace(/고등학교|고교/g, '고');
}

function normalizeGrade(grade) {
    return grade.trim().replace(/\s+|학년|반/g, '');
}

function getNormalizedKey(name, school, grade) {
    return `${normalizeStudentName(name)}_${normalizeSchoolName(school || '')}_${normalizeGrade(grade || '')}`;
}

async function batchWriteItems(tableName, items) {
    const BATCH_SIZE = 25;

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        const requestItems = batch.map(item => ({
            PutRequest: { Item: item }
        }));

        try {
            await docClient.send(new BatchWriteCommand({
                RequestItems: {
                    [tableName]: requestItems
                }
            }));
            console.log(`  Wrote batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(items.length / BATCH_SIZE)}`);
        } catch (error) {
            console.error(`Error writing batch to ${tableName}:`, error);
            throw error;
        }
    }
}

async function uploadPdfToS3(examId, fileName, base64Data) {
    if (!base64Data) return null;

    try {
        const buffer = Buffer.from(base64Data.replace(/^data:application\/pdf;base64,/, ''), 'base64');
        const key = `exams/${examId}/${fileName || 'exam.pdf'}`;

        await s3Client.send(new PutObjectCommand({
            Bucket: PDF_BUCKET,
            Key: key,
            Body: buffer,
            ContentType: 'application/pdf'
        }));

        console.log(`  Uploaded PDF: ${key}`);
        return key;
    } catch (error) {
        console.error(`Error uploading PDF for exam ${examId}:`, error);
        return null;
    }
}

async function migrateExams(exams) {
    console.log('\n=== Migrating Exams ===');
    const items = [];

    for (const [id, exam] of Object.entries(exams)) {
        // Upload PDF to S3 if exists
        let pdfS3Key = null;
        if (exam.pdfData) {
            pdfS3Key = await uploadPdfToS3(id, exam.pdfFileName, exam.pdfData);
        }

        items.push({
            PK: `EXAM#${id}`,
            SK: 'METADATA',
            examId: id,
            name: exam.name || '',
            organization: exam.organization || '국어농장',
            school: exam.school || '',
            grade: exam.grade || '',
            date: exam.date || new Date().toISOString().split('T')[0],
            series: exam.series || '',
            pdfFileName: exam.pdfFileName || '',
            pdfS3Key: pdfS3Key || '',
            createdAt: exam.createdAt || new Date().toISOString(),
            updatedAt: exam.updatedAt || new Date().toISOString()
        });
    }

    await batchWriteItems(TABLE_NAMES.EXAMS, items);
    console.log(`Migrated ${items.length} exams`);
    return items.length;
}

async function migrateQuestions(questions) {
    console.log('\n=== Migrating Questions ===');
    const items = [];

    for (const [id, question] of Object.entries(questions)) {
        items.push({
            PK: `EXAM#${question.examId}`,
            SK: `QUESTION#${String(question.number).padStart(3, '0')}`,
            questionId: id,
            examId: question.examId,
            number: question.number,
            type: question.type || '객관식',
            domain: question.domain || '',
            subDomain: question.subDomain || '',
            passage: question.passage || '',
            points: question.points || 0,
            correctAnswer: question.correctAnswer || '',
            choiceExplanations: question.choiceExplanations || {},
            intent: question.intent || '',
            createdAt: question.createdAt || new Date().toISOString()
        });
    }

    await batchWriteItems(TABLE_NAMES.QUESTIONS, items);
    console.log(`Migrated ${items.length} questions`);
    return items.length;
}

async function migrateStudents(students) {
    console.log('\n=== Migrating Students ===');
    const items = [];

    for (const [id, student] of Object.entries(students)) {
        const normalizedKey = getNormalizedKey(
            student.name || '',
            student.school || '',
            student.grade || ''
        );

        items.push({
            PK: `STUDENT#${id}`,
            SK: 'METADATA',
            studentId: id,
            name: student.name || '',
            school: student.school || '',
            grade: student.grade || '',
            organization: student.organization || '국어농장',
            normalizedKey,
            createdAt: student.createdAt || new Date().toISOString()
        });
    }

    await batchWriteItems(TABLE_NAMES.STUDENTS, items);
    console.log(`Migrated ${items.length} students`);
    return items.length;
}

async function migrateAnswers(answers) {
    console.log('\n=== Migrating Answers ===');
    const items = [];

    for (const [id, answer] of Object.entries(answers)) {
        items.push({
            PK: `EXAM#${answer.examId}#STUDENT#${answer.studentId}`,
            SK: `QUESTION#${answer.questionId}`,
            answerId: id,
            examId: answer.examId,
            studentId: answer.studentId,
            questionId: answer.questionId,
            answerText: answer.answerText || '',
            scoreReceived: answer.scoreReceived !== undefined ? answer.scoreReceived : null,
            createdAt: answer.createdAt || new Date().toISOString(),
            updatedAt: answer.updatedAt || new Date().toISOString()
        });
    }

    await batchWriteItems(TABLE_NAMES.ANSWERS, items);
    console.log(`Migrated ${items.length} answers`);
    return items.length;
}

async function migrateUsers(users) {
    console.log('\n=== Migrating Users ===');
    console.log('NOTE: Users need to be created in Cognito separately.');
    console.log('      This only creates DynamoDB records.');
    console.log('      Users will need to reset their passwords.\n');

    const items = [];

    for (const [id, user] of Object.entries(users)) {
        items.push({
            PK: `USER#${id}`,
            SK: 'METADATA',
            userId: id,
            username: user.username,
            email: user.email || user.username,
            cognitoSub: '', // Will be set when user logs in via Cognito
            name: user.name || '',
            organization: user.organization || '',
            role: user.role || 'org_admin',
            isActive: user.isActive !== false,
            createdAt: user.createdAt || new Date().toISOString(),
            lastLoginAt: user.lastLoginAt || null
        });
    }

    await batchWriteItems(TABLE_NAMES.USERS, items);
    console.log(`Migrated ${items.length} users`);
    return items.length;
}

async function migrateRegistrations(registrations) {
    console.log('\n=== Migrating Registrations ===');
    const items = [];

    for (const [id, reg] of Object.entries(registrations)) {
        items.push({
            PK: `REG#${id}`,
            SK: 'METADATA',
            registrationId: id,
            username: reg.username,
            email: reg.email || reg.username,
            name: reg.name || '',
            organization: reg.organization || '',
            status: reg.status || 'pending',
            createdAt: reg.createdAt || new Date().toISOString(),
            processedAt: reg.processedAt || null,
            processedBy: reg.processedBy || null
        });
    }

    await batchWriteItems(TABLE_NAMES.REGISTRATIONS, items);
    console.log(`Migrated ${items.length} registrations`);
    return items.length;
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node firebase-to-dynamodb.js <firebase-export.json>');
        console.log('\nTo export Firebase data:');
        console.log('1. Go to Firebase Console > Realtime Database');
        console.log('2. Click the three dots menu > Export JSON');
        console.log('3. Save the file and run this script');
        process.exit(1);
    }

    const inputFile = args[0];

    if (!fs.existsSync(inputFile)) {
        console.error(`Error: File not found: ${inputFile}`);
        process.exit(1);
    }

    console.log('='.repeat(50));
    console.log('Firebase to DynamoDB Migration');
    console.log('='.repeat(50));
    console.log(`Input file: ${inputFile}`);
    console.log(`Region: ${REGION}`);
    console.log(`Stage: ${STAGE}`);
    console.log(`PDF Bucket: ${PDF_BUCKET}`);
    console.log('='.repeat(50));

    // Read Firebase export
    const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

    const stats = {
        exams: 0,
        questions: 0,
        students: 0,
        answers: 0,
        users: 0,
        registrations: 0
    };

    // Migrate each collection
    if (data.exams) {
        stats.exams = await migrateExams(data.exams);
    }

    if (data.questions) {
        stats.questions = await migrateQuestions(data.questions);
    }

    if (data.students) {
        stats.students = await migrateStudents(data.students);
    }

    if (data.answers) {
        stats.answers = await migrateAnswers(data.answers);
    }

    if (data.users) {
        stats.users = await migrateUsers(data.users);
    }

    if (data.registrations) {
        stats.registrations = await migrateRegistrations(data.registrations);
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('Migration Complete!');
    console.log('='.repeat(50));
    console.log(`Exams: ${stats.exams}`);
    console.log(`Questions: ${stats.questions}`);
    console.log(`Students: ${stats.students}`);
    console.log(`Answers: ${stats.answers}`);
    console.log(`Users: ${stats.users}`);
    console.log(`Registrations: ${stats.registrations}`);
    console.log('='.repeat(50));

    console.log('\n⚠️  Important Next Steps:');
    console.log('1. Create admin user in Cognito manually');
    console.log('2. Notify existing users to reset their passwords');
    console.log('3. Test the application with the new backend');
    console.log('4. Keep Firebase running until verification is complete');
}

main().catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
});
