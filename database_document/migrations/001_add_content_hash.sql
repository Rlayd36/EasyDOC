-- 기존 DB에 content_hash 컬럼 추가 (신규 설치는 schema.sql 사용)
ALTER TABLE docsinfos
  ADD COLUMN content_hash VARCHAR(64) NULL COMMENT '원본 파일 SHA-256 hex'
  AFTER file_name;
