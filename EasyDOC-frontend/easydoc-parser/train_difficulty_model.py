import torch
from torch.utils.data import Dataset, DataLoader
from torch.optim import AdamW
from transformers import AutoTokenizer, AutoModelForSequenceClassification, get_scheduler
from sklearn.model_selection import train_test_split
import pandas as pd
import os

# ========================================
# 1. 설정
# ========================================
MODEL_NAME = "klue/roberta-base"
NUM_LABELS = 4  # 난이도 1~4
BATCH_SIZE = 16
EPOCHS = 30
LEARNING_RATE = 2e-5
MAX_LENGTH = 32  # 단어라서 짧게

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Using device: {device}")

# ========================================
# 2. 데이터 로드
# ========================================
df = pd.read_csv("word_difficulty_dataset.csv")
print(f"전체 데이터: {len(df)}개")
print(df['난이도'].value_counts().sort_index())

# 난이도 1~4 → 0~3으로 변환 (모델 학습용)
df['label'] = df['난이도'] - 1

# 학습/검증 분리
train_df, val_df = train_test_split(df, test_size=0.2, random_state=42, stratify=df['label'])
print(f"학습: {len(train_df)}개, 검증: {len(val_df)}개")

# ========================================
# 3. Dataset 클래스
# ========================================
class WordDifficultyDataset(Dataset):
    def __init__(self, dataframe, tokenizer, max_length):
        self.data = dataframe.reset_index(drop=True)
        self.tokenizer = tokenizer
        self.max_length = max_length
    
    def __len__(self):
        return len(self.data)
    
    def __getitem__(self, idx):
        word = self.data.loc[idx, '단어']
        label = self.data.loc[idx, 'label']
        
        encoding = self.tokenizer(
            word,
            truncation=True,
            padding='max_length',
            max_length=self.max_length,
            return_tensors='pt'
        )
        
        return {
            'input_ids': encoding['input_ids'].squeeze(),
            'attention_mask': encoding['attention_mask'].squeeze(),
            'labels': torch.tensor(label, dtype=torch.long)
        }

# ========================================
# 4. 모델 및 토크나이저 로드
# ========================================
print("모델 로딩 중...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME, num_labels=NUM_LABELS)
model.to(device)
print("모델 로딩 완료!")

# ========================================
# 5. DataLoader 생성
# ========================================
train_dataset = WordDifficultyDataset(train_df, tokenizer, MAX_LENGTH)
val_dataset = WordDifficultyDataset(val_df, tokenizer, MAX_LENGTH)

train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)
val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE)

# ========================================
# 6. 옵티마이저 및 스케줄러
# ========================================
optimizer = AdamW(model.parameters(), lr=LEARNING_RATE)
num_training_steps = EPOCHS * len(train_loader)
lr_scheduler = get_scheduler(
    "linear",
    optimizer=optimizer,
    num_warmup_steps=0,
    num_training_steps=num_training_steps
)

# ========================================
# 7. 학습 함수
# ========================================
def train_epoch(model, dataloader, optimizer, scheduler, device):
    model.train()
    total_loss = 0
    correct = 0
    total = 0
    
    for batch in dataloader:
        input_ids = batch['input_ids'].to(device)
        attention_mask = batch['attention_mask'].to(device)
        labels = batch['labels'].to(device)
        
        outputs = model(input_ids=input_ids, attention_mask=attention_mask, labels=labels)
        loss = outputs.loss
        
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        scheduler.step()
        
        total_loss += loss.item()
        
        preds = torch.argmax(outputs.logits, dim=1)
        correct += (preds == labels).sum().item()
        total += labels.size(0)
    
    return total_loss / len(dataloader), correct / total

def evaluate(model, dataloader, device):
    model.eval()
    total_loss = 0
    correct = 0
    total = 0
    
    with torch.no_grad():
        for batch in dataloader:
            input_ids = batch['input_ids'].to(device)
            attention_mask = batch['attention_mask'].to(device)
            labels = batch['labels'].to(device)
            
            outputs = model(input_ids=input_ids, attention_mask=attention_mask, labels=labels)
            
            total_loss += outputs.loss.item()
            
            preds = torch.argmax(outputs.logits, dim=1)
            correct += (preds == labels).sum().item()
            total += labels.size(0)
    
    return total_loss / len(dataloader), correct / total

# ========================================
# 8. 학습 실행
# ========================================
print("\n학습 시작!")
print("=" * 50)

best_val_acc = 0

for epoch in range(EPOCHS):
    train_loss, train_acc = train_epoch(model, train_loader, optimizer, lr_scheduler, device)
    val_loss, val_acc = evaluate(model, val_loader, device)
    
    print(f"Epoch {epoch+1}/{EPOCHS}")
    print(f"  Train Loss: {train_loss:.4f}, Train Acc: {train_acc:.4f}")
    print(f"  Val Loss: {val_loss:.4f}, Val Acc: {val_acc:.4f}")
    
    # 베스트 모델 저장
    if val_acc > best_val_acc:
        best_val_acc = val_acc
        torch.save(model.state_dict(), "best_model.pt")
        print(f"  ✓ Best model saved! (Val Acc: {val_acc:.4f})")
    
    print()

print("=" * 50)
print(f"학습 완료! Best Val Acc: {best_val_acc:.4f}")

# ========================================
# 9. 모델 저장 (전체)
# ========================================
save_dir = "word_difficulty_model"
os.makedirs(save_dir, exist_ok=True)

model.save_pretrained(save_dir)
tokenizer.save_pretrained(save_dir)
print(f"모델 저장 완료: {save_dir}/")

# ========================================
# 10. 테스트 추론
# ========================================
print("\n테스트 추론:")
print("-" * 30)

test_words = ["신청", "증명서", "행정기관", "준용", "유치권"]

model.eval()
for word in test_words:
    inputs = tokenizer(word, return_tensors="pt", padding=True, truncation=True, max_length=MAX_LENGTH)
    inputs = {k: v.to(device) for k, v in inputs.items()}
    
    with torch.no_grad():
        outputs = model(**inputs)
        pred = torch.argmax(outputs.logits, dim=1).item() + 1  # 0~3 → 1~4
    
    print(f"'{word}' → 난이도 {pred}단계")