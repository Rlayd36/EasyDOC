-- 1. 새로운 데이터베이스(easydoc_db) 생성 (한글 깨짐 방지를 위해 utf8mb4 설정)
CREATE DATABASE IF NOT EXISTS easydoc_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. 해당 데이터베이스 사용 선언
USE easydoc_db;

-- 3. 통합된 문서를 담을 docsinfos 테이블 생성
CREATE TABLE IF NOT EXISTS docsinfos (
    id INT AUTO_INCREMENT PRIMARY KEY,				-- 고유 번호 (자동 증가)
    file_name VARCHAR(255) NOT NULL, 				-- 파일명 (예: 행정기본법.pdf)
    file_type VARCHAR(50),							-- 확장자 (예: pdf, png)
    s3_url VARCHAR(1000),							-- S3에 저장된 경로
    extracted_text LONGTEXT,						-- 추출된 아주 긴 텍스트
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP	-- 업로드된 시간 (자동 기록)
);