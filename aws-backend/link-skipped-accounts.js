/**
 * SKIP된 계정들을 학생 데이터에 연결하는 스크립트
 * Cognito에는 이미 존재하지만 DynamoDB에 연결되지 않은 계정들 처리
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { CognitoIdentityProviderClient, AdminGetUserCommand } = require('@aws-sdk/client-cognito-identity-provider');

const client = new DynamoDBClient({ region: 'ap-northeast-2' });
const docClient = DynamoDBDocumentClient.from(client);
const cognitoClient = new CognitoIdentityProviderClient({ region: 'ap-northeast-2' });

const USER_POOL_ID = 'ap-northeast-2_wFjVERBWq';
const DEFAULT_PASSWORD = 'student1';

function generateId() {
    return 'mi' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

async function checkCognitoUser(username) {
    try {
        await cognitoClient.send(new AdminGetUserCommand({
            UserPoolId: USER_POOL_ID,
            Username: username
        }));
        return true;
    } catch (error) {
        if (error.name === 'UserNotFoundException') {
            return false;
        }
        throw error;
    }
}

async function run() {
    console.log('SKIP된 계정 연결 시작...\n');

    // 1. 모든 시험 가져오기
    const examsResult = await docClient.send(new ScanCommand({
        TableName: 'TestReportExams-dev',
        FilterExpression: 'SK = :sk',
        ExpressionAttributeValues: { ':sk': 'METADATA' }
    }));

    // 언어의 창 시험 ID 목록
    const lwExamIds = new Set();
    examsResult.Items.forEach(e => {
        const org = (e.organization || '').replace(/\s/g, '');
        if (org === '언어의창') {
            lwExamIds.add(e.examId);
        }
    });

    // 2. 모든 답안 가져오기
    const answersResult = await docClient.send(new ScanCommand({
        TableName: 'TestReportAnswers-dev'
    }));

    // 학생별 응시한 시험 목록
    const studentExams = {};
    answersResult.Items.forEach(a => {
        if (a.studentId && a.examId) {
            if (!studentExams[a.studentId]) {
                studentExams[a.studentId] = new Set();
            }
            studentExams[a.studentId].add(a.examId);
        }
    });

    // 3. 모든 학생 가져오기
    const studentsResult = await docClient.send(new ScanCommand({
        TableName: 'TestReportStudents-dev',
        FilterExpression: 'SK = :sk',
        ExpressionAttributeValues: { ':sk': 'METADATA' }
    }));

    // 4. 학생 분류 (이전과 동일한 순서 유지)
    const lwStudents = [];
    const gfStudents = [];

    studentsResult.Items.forEach(s => {
        const exams = studentExams[s.studentId] || new Set();
        let isLW = false;
        exams.forEach(examId => {
            if (lwExamIds.has(examId)) isLW = true;
        });

        if (isLW) {
            lwStudents.push(s);
        } else {
            gfStudents.push(s);
        }
    });

    // 5. 아직 계정이 연결되지 않은 학생들 찾기
    const lwUnlinked = lwStudents.filter(s => !s.hasAccount);
    const gfUnlinked = gfStudents.filter(s => !s.hasAccount);

    console.log('언어의 창 - 연결되지 않은 학생:', lwUnlinked.length);
    console.log('국어농장 - 연결되지 않은 학생:', gfUnlinked.length);
    console.log('');

    const results = {
        lw: { success: 0, fail: 0, accounts: [] },
        gf: { success: 0, fail: 0, accounts: [] }
    };

    // 6. 언어의 창 학생 연결
    console.log('=== 언어의 창 학생 계정 연결 ===');
    let lwCounter = 1;
    for (const student of lwUnlinked) {
        const username = `lw${String(lwCounter).padStart(4, '0')}`;
        lwCounter++;

        // Cognito에 존재하는지 확인
        const exists = await checkCognitoUser(username);
        if (!exists) {
            console.log(`  [SKIP] Cognito에 없음: ${username}`);
            continue;
        }

        try {
            // DynamoDB 학생 레코드 업데이트
            await docClient.send(new UpdateCommand({
                TableName: 'TestReportStudents-dev',
                Key: { PK: `STUDENT#${student.studentId}`, SK: 'METADATA' },
                UpdateExpression: 'SET hasAccount = :has, username = :un, organization = :org, updatedAt = :now',
                ExpressionAttributeValues: {
                    ':has': true,
                    ':un': username,
                    ':org': '언어의 창',
                    ':now': new Date().toISOString()
                }
            }));

            // Users 테이블에 레코드 추가
            const userId = generateId();
            await docClient.send(new PutCommand({
                TableName: 'TestReportUsers-dev',
                Item: {
                    PK: `USER#${userId}`,
                    SK: 'METADATA',
                    userId,
                    username,
                    email: `${username}@student.local`,
                    cognitoSub: 'batch-linked',
                    name: student.name,
                    organization: '언어의 창',
                    role: 'student',
                    studentId: student.studentId,
                    isActive: true,
                    createdAt: new Date().toISOString(),
                    createdBy: 'batch-script'
                }
            }));

            console.log(`  [OK] ${student.name} (${student.school}) → ${username}`);
            results.lw.success++;
            results.lw.accounts.push({ name: student.name, school: student.school, username, password: DEFAULT_PASSWORD });
        } catch (error) {
            console.error(`  [ERROR] ${student.name}: ${error.message}`);
            results.lw.fail++;
        }
    }

    console.log('');

    // 7. 국어농장 학생 연결
    console.log('=== 국어농장 학생 계정 연결 ===');
    let gfCounter = 1;
    for (const student of gfUnlinked) {
        const username = `gf${String(gfCounter).padStart(4, '0')}`;
        gfCounter++;

        // Cognito에 존재하는지 확인
        const exists = await checkCognitoUser(username);
        if (!exists) {
            console.log(`  [SKIP] Cognito에 없음: ${username}`);
            continue;
        }

        try {
            // DynamoDB 학생 레코드 업데이트
            await docClient.send(new UpdateCommand({
                TableName: 'TestReportStudents-dev',
                Key: { PK: `STUDENT#${student.studentId}`, SK: 'METADATA' },
                UpdateExpression: 'SET hasAccount = :has, username = :un, organization = :org, updatedAt = :now',
                ExpressionAttributeValues: {
                    ':has': true,
                    ':un': username,
                    ':org': '국어농장',
                    ':now': new Date().toISOString()
                }
            }));

            // Users 테이블에 레코드 추가
            const userId = generateId();
            await docClient.send(new PutCommand({
                TableName: 'TestReportUsers-dev',
                Item: {
                    PK: `USER#${userId}`,
                    SK: 'METADATA',
                    userId,
                    username,
                    email: `${username}@student.local`,
                    cognitoSub: 'batch-linked',
                    name: student.name,
                    organization: '국어농장',
                    role: 'student',
                    studentId: student.studentId,
                    isActive: true,
                    createdAt: new Date().toISOString(),
                    createdBy: 'batch-script'
                }
            }));

            console.log(`  [OK] ${student.name} (${student.school}) → ${username}`);
            results.gf.success++;
            results.gf.accounts.push({ name: student.name, school: student.school, username, password: DEFAULT_PASSWORD });
        } catch (error) {
            console.error(`  [ERROR] ${student.name}: ${error.message}`);
            results.gf.fail++;
        }
    }

    // 결과 요약
    console.log('\n========================================');
    console.log('               결과 요약');
    console.log('========================================');
    console.log(`언어의 창: 성공 ${results.lw.success}명, 실패 ${results.lw.fail}명`);
    console.log(`국어농장: 성공 ${results.gf.success}명, 실패 ${results.gf.fail}명`);
    console.log('========================================');

    // 계정 목록 출력
    if (results.lw.accounts.length > 0) {
        console.log('\n=== 연결된 계정 목록 (언어의 창) ===');
        console.log('이름 | 학교 | 아이디 | 비밀번호');
        console.log('--------------------------------');
        results.lw.accounts.forEach(a => {
            console.log(`${a.name} | ${a.school} | ${a.username} | ${a.password}`);
        });
    }

    if (results.gf.accounts.length > 0) {
        console.log('\n=== 연결된 계정 목록 (국어농장) ===');
        console.log('이름 | 학교 | 아이디 | 비밀번호');
        console.log('--------------------------------');
        results.gf.accounts.forEach(a => {
            console.log(`${a.name} | ${a.school} | ${a.username} | ${a.password}`);
        });
    }
}

run().catch(console.error);
