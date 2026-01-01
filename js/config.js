/**
 * AWS 서비스 설정
 */

const APP_CONFIG = {
    // API Gateway 엔드포인트
    API_BASE_URL: 'https://q80ku3pnp7.execute-api.ap-northeast-2.amazonaws.com/dev/api/v1',

    // AWS Cognito 설정
    COGNITO: {
        REGION: 'ap-northeast-2',
        USER_POOL_ID: 'ap-northeast-2_YmPcJGjEo',
        CLIENT_ID: 'm5fisbffr5c50a18pf8jn05mv'
    },

    // 앱 설정
    APP: {
        NAME: '성적표 생성 시스템',
        VERSION: '2.0.0',
        BASE_PATH: '/test_report'
    }
};
