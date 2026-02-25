# EasyDOC-backend (Spring Boot)

## 테이블 생성

테이블(`users`, `userinfos`) 없으면 서버 실행 시 자동으로 생성. (application.properties)

## MySQL DB 설정

- 스키마: `easydoc` (MySQL에서 생성)
- DB 비번 있음 --> `export DB_PASSWORD= 내꺼 비번`

## 서버 실행

```bash
./gradlew bootRun
```
