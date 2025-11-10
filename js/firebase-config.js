/**
 * Firebase 설정 및 초기화
 */

// Firebase SDK (CDN 방식 사용)
const firebaseConfig = {
    apiKey: "AIzaSyCAuV-OLuUwbBJI_IBj4v__T0sMFF2q-wQ",
    authDomain: "grade-report-app.firebaseapp.com",
    databaseURL: "https://grade-report-app-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "grade-report-app",
    storageBucket: "grade-report-app.firebasestorage.app",
    messagingSenderId: "209059155283",
    appId: "1:209059155283:web:727ee61d11a8d7e55e65a6",
    measurementId: "G-92W73TRP86"
};

// Firebase 초기화
let firebaseApp;
let firebaseDatabase;

function initializeFirebase() {
    try {
        // Firebase 앱 초기화
        firebaseApp = firebase.initializeApp(firebaseConfig);

        // Realtime Database 가져오기
        firebaseDatabase = firebase.database();

        console.log('✅ Firebase 초기화 완료');
        return true;
    } catch (error) {
        console.error('❌ Firebase 초기화 실패:', error);
        alert('클라우드 데이터베이스 연결에 실패했습니다. 로컬 스토리지를 사용합니다.');
        return false;
    }
}

// Firebase Database 참조 헬퍼 함수
function getRef(path) {
    return firebaseDatabase.ref(path);
}

// Firebase가 로드되면 자동 초기화
if (typeof firebase !== 'undefined') {
    initializeFirebase();
}
