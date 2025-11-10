/**
 * CSV Import/Export 유틸리티
 * 기존 데이터 형식과 호환되면서 새로운 정규화된 구조로 변환
 */

class CSVUtils {
    /**
     * CSV 파싱 (BOM 제거 및 quote 처리)
     */
    static parseCSV(text) {
        // BOM 제거
        if (text.charCodeAt(0) === 0xFEFF) {
            text = text.substr(1);
        }

        const lines = [];
        let currentLine = [];
        let currentField = '';
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    currentField += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                currentLine.push(currentField);
                currentField = '';
            } else if ((char === '\n' || char === '\r') && !inQuotes) {
                if (char === '\r' && nextChar === '\n') {
                    i++;
                }
                if (currentField || currentLine.length > 0) {
                    currentLine.push(currentField);
                    lines.push(currentLine);
                    currentLine = [];
                    currentField = '';
                }
            } else {
                currentField += char;
            }
        }

        if (currentField || currentLine.length > 0) {
            currentLine.push(currentField);
            lines.push(currentLine);
        }

        return lines;
    }

    /**
     * CSV를 객체 배열로 변환
     */
    static csvToObjects(text) {
        const lines = this.parseCSV(text);
        if (lines.length < 2) return [];

        const headers = lines[0];
        const objects = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            const obj = {};
            headers.forEach((header, index) => {
                obj[header.trim()] = line[index] ? line[index].trim() : '';
            });
            objects.push(obj);
        }

        return objects;
    }

    /**
     * 객체 배열을 CSV 텍스트로 변환
     */
    static objectsToCSV(objects, headers) {
        if (objects.length === 0) return '';

        const keys = headers || Object.keys(objects[0]);
        const lines = [];

        // 헤더
        lines.push(keys.map(k => this.escapeCSVField(k)).join(','));

        // 데이터
        objects.forEach(obj => {
            const line = keys.map(key => {
                const value = obj[key] !== undefined && obj[key] !== null ? String(obj[key]) : '';
                return this.escapeCSVField(value);
            });
            lines.push(line.join(','));
        });

        return lines.join('\n');
    }

    /**
     * CSV 필드 이스케이프 (쉼표, 따옴표, 줄바꿈 처리)
     */
    static escapeCSVField(field) {
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }

    /**
     * 문제 정보 CSV를 Question 객체 배열로 변환
     * @returns {Object} {questions: Question[], examName: string}
     */
    static importQuestionsFromCSV(text, examId) {
        const rows = this.csvToObjects(text);
        const questions = [];
        let examName = '';

        console.log('=== CSV 가져오기 시작 ===');
        console.log(`총 ${rows.length}개 행 발견`);

        // 첫 번째 행에서 시험명 추출
        if (rows.length > 0 && rows[0]['시험명']) {
            examName = rows[0]['시험명'];
            console.log(`CSV 시험명: ${examName}`);
        }

        rows.forEach((row, idx) => {
            // 문제 유형 판단
            const type = row['객관식/서술형'] || row['유형'] || row['문제유형'] || '객관식';

            // 정답/모범답안 파싱
            let correctAnswer = '';
            if (type === '객관식') {
                // 객관식: 정답 번호
                correctAnswer = row['정답'] || '';
            } else {
                // 서술형: 선택지1 컬럼에서 모범 답안 가져오기
                correctAnswer = row['선택지1'] || row['선택지2'] || '';

                // 만약 정답 컬럼에 "서술형"이 아닌 실제 답안이 있으면 그것을 사용
                if (row['정답'] && row['정답'].trim() !== '' && row['정답'] !== '서술형') {
                    correctAnswer = row['정답'];
                }
            }

            // 컬럼명 매핑
            const questionData = {
                examId: examId,
                number: parseInt(row['문항 번호'] || row['번호'] || row['문항번호']) || 0,
                type: type,
                domain: row['영역'] || row['대영역'] || '',
                subDomain: row['세부 영역'] || row['세부영역'] || row['소영역'] || '',
                passage: row['작품/지문/단원'] || row['지문'] || row['작품'] || '',
                points: parseFloat(row['배점'] || row['점수']) || 0,
                correctAnswer: correctAnswer,
                intent: row['출제 의도'] || row['출제의도'] || row['의도'] || '',
                choices: []
            };

            // 선택지 해설 파싱 (객관식인 경우)
            if (questionData.type === '객관식') {
                questionData.choiceExplanations = {};
                let hasExplanations = false;

                for (let i = 1; i <= 5; i++) {
                    // "선택지1", "선택지2", ... "선택지5" 컬럼에서 해설 가져오기
                    const explanation = row[`선택지${i}`] || '';

                    if (explanation && explanation.trim() !== '' && explanation !== '정답') {
                        questionData.choiceExplanations[i.toString()] = explanation.trim();
                        hasExplanations = true;
                    }
                }

                if (!hasExplanations) {
                    console.warn(`${questionData.number}번 객관식 문제: 선택지 해설이 없습니다`);
                }
            } else {
                // 서술형
                if (!correctAnswer || correctAnswer.trim() === '' || correctAnswer === '서술형') {
                    console.warn(`${questionData.number}번 서술형 문제: 모범 답안이 없습니다 (선택지1 컬럼 확인 필요)`);
                } else {
                    console.log(`${questionData.number}번 서술형: 모범 답안 ${correctAnswer.length}자`);
                }
            }

            if (questionData.type === '객관식') {
                const explCount = Object.keys(questionData.choiceExplanations || {}).length;
                console.log(`${questionData.number}번 객관식: 정답=${correctAnswer}, 해설 ${explCount}개`);
            }

            questions.push(new Question(questionData));
        });

        console.log(`=== CSV 가져오기 완료: ${questions.length}개 문제 ===`);

        return {
            questions: questions,
            examName: examName
        };
    }

    /**
     * Question 객체 배열을 CSV로 변환 (원본 CSV 형식과 동일)
     */
    static exportQuestionsToCSV(questions) {
        // 첫 번째 문제에서 시험명 가져오기
        let examName = '';
        if (questions.length > 0 && typeof storage !== 'undefined') {
            const exam = storage.getExam(questions[0].examId);
            examName = exam ? exam.name : '';
        }

        const rows = questions.map(q => {
            const row = {
                '시험명': examName,
                '문항 번호': q.number,
                '객관식/서술형': q.type,
                '영역': q.domain,
                '작품/지문/단원': q.passage,
                '배점': q.points,
                '출제 의도': q.intent,
                '정답': '',
                '선택지1': '',
                '선택지2': '',
                '선택지3': '',
                '선택지4': '',
                '선택지5': ''
            };

            // 객관식: 정답 컬럼에 정답 번호, 선택지1~5에 해설
            if (q.type === '객관식') {
                row['정답'] = q.correctAnswer;
                for (let i = 1; i <= 5; i++) {
                    row[`선택지${i}`] = q.choiceExplanations[i.toString()] || '';
                }
            } else {
                // 서술형: 정답 컬럼에 "서술형", 선택지1에 모범 답안
                row['정답'] = '서술형';
                row['선택지1'] = q.correctAnswer || '';
            }

            return row;
        });

        return this.objectsToCSV(rows);
    }

    /**
     * 답안 CSV를 Answer 객체 배열로 변환
     */
    static importAnswersFromCSV(text, examId) {
        const rows = this.csvToObjects(text);
        const questions = storage.getQuestionsByExamId(examId);
        const answers = [];
        const studentsMap = new Map();

        rows.forEach(row => {
            const studentName = row['이름'] || '';
            const studentSchool = row['학교'] || '';
            const studentGrade = row['학년'] || '';

            if (!studentName) return;

            // 학생 찾기 또는 생성
            let student = storage.getStudentByName(studentName, studentSchool, studentGrade);
            if (!student) {
                student = new Student({
                    name: studentName,
                    school: studentSchool,
                    grade: studentGrade
                });
                storage.saveStudent(student);
            }

            // 각 문제에 대한 답안 파싱
            questions.forEach(question => {
                const answerValue = row[String(question.number)] || '';
                if (!answerValue) return;

                const answerData = {
                    examId: examId,
                    studentId: student.id,
                    questionId: question.id,
                    answerText: '',
                    scoreReceived: null
                };

                if (question.type === '객관식') {
                    // 객관식: 선택지 번호
                    answerData.answerText = answerValue;
                } else if (question.type === '서술형') {
                    // 서술형: 기존 CSV는 점수만 있음
                    // 점수인지 텍스트인지 판단
                    const scoreValue = parseFloat(answerValue);
                    if (!isNaN(scoreValue) && scoreValue <= question.points) {
                        // 점수로 판단
                        answerData.scoreReceived = scoreValue;
                        answerData.answerText = '(답안 없음)'; // 실제 답안 텍스트는 없음
                    } else {
                        // 텍스트로 판단
                        answerData.answerText = answerValue;
                        answerData.scoreReceived = null; // 채점 필요
                    }
                }

                answers.push(new Answer(answerData));
            });
        });

        return answers;
    }

    /**
     * Answer 객체 배열을 CSV로 변환
     */
    static exportAnswersToCSV(examId) {
        const exam = storage.getExam(examId);
        const questions = storage.getQuestionsByExamId(examId);
        const allAnswers = storage.getAnswersByExamId(examId);

        // 학생별로 그룹화
        const studentIds = [...new Set(allAnswers.map(a => a.studentId))];
        const rows = [];

        studentIds.forEach(studentId => {
            const student = storage.getStudent(studentId);
            const answers = allAnswers.filter(a => a.studentId === studentId);

            const row = {
                '입력일시': new Date().toLocaleString('ko-KR'),
                '시험명': exam.name,
                '이름': student.name,
                '학교': student.school,
                '학년': student.grade
            };

            // 각 문제 번호별 답안
            questions.forEach(question => {
                const answer = answers.find(a => a.questionId === question.id);
                if (answer) {
                    if (question.type === '객관식') {
                        row[question.number] = answer.answerText;
                    } else {
                        // 서술형: 점수가 있으면 점수, 없으면 답안 텍스트
                        row[question.number] = answer.scoreReceived !== null
                            ? answer.scoreReceived
                            : answer.answerText;
                    }
                } else {
                    row[question.number] = '';
                }
            });

            rows.push(row);
        });

        return this.objectsToCSV(rows);
    }

    /**
     * 시험 결과를 CSV로 변환
     */
    static exportResultsToCSV(examId) {
        const results = storage.getAllExamResults(examId);
        const rows = [];

        results.forEach(result => {
            const row = {
                '시험명': result.exam.name,
                '이름': result.student.name,
                '학교': result.student.school,
                '학년': result.student.grade,
                '총점': result.totalScore.toFixed(2),
                '만점': result.maxScore,
                '객관식_점수': result.multipleChoiceScore.toFixed(2),
                '서술형_점수': result.essayScore.toFixed(2),
                '등수': result.rank,
                '응시 인원': result.totalStudents,
                '틀린 문제 번호': result.wrongQuestions.map(wq => wq.question.number).join(',')
            };

            // 영역별 점수
            Object.keys(result.domainScores).forEach(domain => {
                const ds = result.domainScores[domain];
                row[`${domain}_점수`] = ds.score.toFixed(2);
                row[`${domain}_만점`] = ds.maxScore;
            });

            rows.push(row);
        });

        return this.objectsToCSV(rows);
    }

    /**
     * 파일 다운로드
     */
    static downloadCSV(filename, csvText) {
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvText], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    /**
     * 파일 읽기
     */
    static readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file, 'UTF-8');
        });
    }
}
