/**
 * AWS 서비스 설정
 * 배포 환경에 맞게 값을 수정하세요
 */

const APP_CONFIG = {
    // API Gateway 엔드포인트
    API_BASE_URL: 'https://YOUR_API_GATEWAY_ID.execute-api.ap-northeast-2.amazonaws.com/prod/api/v1',

    // AWS Cognito 설정
    COGNITO: {
        REGION: 'ap-northeast-2',
        USER_POOL_ID: 'ap-northeast-2_XXXXXXXXX',
        CLIENT_ID: 'YOUR_COGNITO_CLIENT_ID'
    },

    // 앱 설정
    APP: {
        NAME: '성적표 생성 시스템',
        VERSION: '2.0.0',
        BASE_PATH: '/test_report'
    }
};

// 개발 환경 감지
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    // 로컬 개발 환경
    APP_CONFIG.API_BASE_URL = 'http://localhost:3000/api/v1';
    console.log('Development mode: Using local API');
}
