import boto3
import os
from dotenv import load_dotenv

load_dotenv()

s3 = boto3.client(
    "s3",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    region_name=os.getenv("AWS_DEFAULT_REGION"),
)
BUCKET_NAME = os.getenv("S3_BUCKET_NAME")

print(f"버킷: {BUCKET_NAME}")
print(f"리전: {os.getenv('AWS_DEFAULT_REGION')}")
print("-" * 50)

try:
    response = s3.list_objects_v2(Bucket=BUCKET_NAME)
    
    if 'Contents' in response:
        print(f"총 {len(response['Contents'])}개 파일 발견:\n")
        for obj in response['Contents']:
            print(f"  키: {obj['Key']}")
            print(f"  크기: {obj['Size']} bytes")
            print(f"  수정일: {obj['LastModified']}")
            print()
    else:
        print("버킷이 비어 있습니다.")
        
except Exception as e:
    print(f"오류: {e}")
