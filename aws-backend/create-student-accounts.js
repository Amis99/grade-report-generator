/**
 * 학생 계정 일괄 생성 스크립트
 * - 언어의 창 시험 응시 학생 → 언어의 창 소속
 * - 그 외 학생 → 국어농장 소속
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand } = require('@aws-sdk/client-cognito-identity-provider');

const client = new DynamoDBClient({ region: 'ap-northeast-2' });
const docClient = DynamoDBDocumentClient.from(client);
const cognitoClient = new CognitoIdentityProviderClient({ region: 'ap-northeast-2' });

const USER_POOL_ID = 'ap-northeast-2_wFjVERBWq';
const DEFAULT_PASSWORD = 'student1';

// 기관별 카운터
const counters = {
    'lw': 1,  // 언어의 창
    'gf': 1   // 국어농장
};

function generateUsername(org) {
    const prefix = org === '언어의 창' ? 'lw' : 'gf';
    const num = String(counters[prefix]).padStart(4, '0');
    counters[prefix]++;
    return `${prefix}${num}`;
}

function generateId() {
    return 'mi' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

async function createCognitoUser(username, name, organization, studentId) {
    try {
        // Cognito 사용자 생성
        await cognitoClient.send(new AdminCreateUserCommand({
            UserPoolId: USER_POOL_ID,
            Username: username,
            UserAttributes: [
                { Name: 'email', Value: `${username}@student.local` },
                { Name: 'email_verified', Value: 'true' },
                { Name: 'name', Value: name },
                { Name: 'custom:organization', Value: organization },
                { Name: 'custom:role', Value: 'student' },
                { Name: 'custom:studentId', Value: studentId }
            ],
            MessageAction: 'SUPPRESS'
        }));

        // 비밀번호 설정 (영구)
        await cognitoClient.send(new AdminSetUserPasswordCommand({
            UserPoolId: USER_POOL_ID,
            Username: username,
            Password: DEFAULT_PASSWORD,
            Permanent: true
        }));

        return true;
    } catch (error) {
        if (error.name === 'UsernameExistsException') {
            console.log(`  [SKIP] 이미 존재: ${username}`);
            counters[username.substring(0, 2)]++; // 카운터 증가
            return false;
        }
        throw error;
    }
}

async function run() {
    console.log('학생 계정 일괄 생성 시작...\n');

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
    console.log('언어의 창 시험 수:', lwExamIds.size);

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

    console.log('전체 학생 수:', studentsResult.Items.length);

    // 4. 학생 분류
    const lwStudents = [];
    const gfStudents = [];
    let alreadyHasAccount = 0;

    studentsResult.Items.forEach(s => {
        // 이미 계정이 있는 학생은 건너뜀
        if (s.hasAccount) {
            alreadyHasAccount++;
            return;
        }

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

    console.log('이미 계정 있는 학생:', alreadyHasAccount);
    console.log('언어의 창 소속 학생 (계정 생성 대상):', lwStudents.length);
    console.log('국어농장 소속 학생 (계정 생성 대상):', gfStudents.length);
    console.log('');

    // 5. 계정 생성
    const results = {
        lw: { success: 0, fail: 0, accounts: [] },
        gf: { success: 0, fail: 0, accounts: [] }
    };

    // 언어의 창 학생 계정 생성
    console.log('=== 언어의 창 학생 계정 생성 ===');
    for (const student of lwStudents) {
        const username = generateUsername('언어의 창');
        const organization = '언어의 창';

        try {
            const created = await createCognitoUser(username, student.name, organization, student.studentId);

            if (created) {
                // DynamoDB 학생 레코드 업데이트
                await docClient.send(new UpdateCommand({
                    TableName: 'TestReportStudents-dev',
                    Key: { PK: `STUDENT#${student.studentId}`, SK: 'METADATA' },
                    UpdateExpression: 'SET hasAccount = :has, username = :un, organization = :org, updatedAt = :now',
                    ExpressionAttributeValues: {
                        ':has': true,
                        ':un': username,
                        ':org': organization,
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
                        cognitoSub: 'batch-created',
                        name: student.name,
                        organization,
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
            }
        } catch (error) {
            console.error(`  [ERROR] ${student.name}: ${error.message}`);
            results.lw.fail++;
        }
    }

    console.log('');

    // 국어농장 학생 계정 생성
    console.log('=== 국어농장 학생 계정 생성 ===');
    for (const student of gfStudents) {
        const username = generateUsername('국어농장');
        const organization = '국어농장';

        try {
            const created = await createCognitoUser(username, student.name, organization, student.studentId);

            if (created) {
                // DynamoDB 학생 레코드 업데이트
                await docClient.send(new UpdateCommand({
                    TableName: 'TestReportStudents-dev',
                    Key: { PK: `STUDENT#${student.studentId}`, SK: 'METADATA' },
                    UpdateExpression: 'SET hasAccount = :has, username = :un, organization = :org, updatedAt = :now',
                    ExpressionAttributeValues: {
                        ':has': true,
                        ':un': username,
                        ':org': organization,
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
                        cognitoSub: 'batch-created',
                        name: student.name,
                        organization,
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
            }
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
    console.log('\n=== 생성된 계정 목록 (언어의 창) ===');
    console.log('이름 | 학교 | 아이디 | 비밀번호');
    console.log('--------------------------------');
    results.lw.accounts.forEach(a => {
        console.log(`${a.name} | ${a.school} | ${a.username} | ${a.password}`);
    });

    console.log('\n=== 생성된 계정 목록 (국어농장) ===');
    console.log('이름 | 학교 | 아이디 | 비밀번호');
    console.log('--------------------------------');
    results.gf.accounts.forEach(a => {
        console.log(`${a.name} | ${a.school} | ${a.username} | ${a.password}`);
    });
}

run().catch(console.error);
