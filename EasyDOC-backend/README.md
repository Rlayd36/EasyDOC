# EasyDOC-backend (Spring Boot)

**통합 백엔드**: 로그인/회원가입, JWT 인증, 비밀번호 변경·삭제·정보 조회, 비밀번호 찾기(재설정) 모두 제공.

## 환경 변수

서버 실행 전에 다음 환경 변수를 설정하거나, `application-local.properties`에 넣어 두세요 (로컬용, Git 제외).

- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` — MySQL
- `JWT_SECRET` — JWT 서명용 시크릿 (필수, 32자 이상 권장)
- `JWT_EXPIRATION` — 토큰 유효 시간(ms), 기본값 3600000

예 (bash):
```bash
export DB_PASSWORD=비밀번호
export JWT_SECRET=a1b2c3d4e5f6g7h8i9j1k2l3m4n5o6p7
./gradlew bootRun
```

## 테이블 생성

테이블(`users`, `userinfos`) 없으면 서버 실행 시 자동으로 생성. (application.properties)

## MySQL DB 설정

- 스키마: `easydoc` (MySQL에서 생성)
- DB 비번 있음 --> `export DB_PASSWORD= 내꺼 비번`

## 서버 실행

```bash
./gradlew bootRun
```
