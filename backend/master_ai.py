import pandas as pd
import joblib
import json
import os
from datetime import datetime, timedelta
from sklearn.ensemble import RandomForestClassifier

# 1. ĐỊNH NGHĨA ĐƯỜNG DẪN TUYỆT ĐỐI CHUẨN
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(BASE_DIR, 'system_log.txt')
INPUT_CSV = os.path.join(BASE_DIR, 'data_training_ai.csv')
MODEL_OUTPUT = os.path.join(BASE_DIR, 'model_xsmn_predict.pkl')

# 2. HÀM GHI LOG ĐỒNG BỘ VÀO SYSTEM_LOG.TXT
def log_action(message):
    timestamp = (datetime.utcnow() + timedelta(hours=7)).strftime('%d/%m/%Y %H:%M:%S')
    log_entry = f"[{timestamp}] [PYTHON - master_ai] {message}\n"
    try:
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(log_entry)
        print(log_entry.strip(), flush=True) # Ép đẩy log ngay lập tức lên web logs
    except:
        print(log_entry.strip(), flush=True)

def train_model():
    try:
        log_action("🚀 Bắt đầu chu kỳ huấn luyện mô hình học máy...")
        
        if not os.path.exists(INPUT_CSV):
            log_action(f"❌ Lỗi: Không tìm thấy tệp dữ liệu đặc trưng {INPUT_CSV}")
            print(json.dumps({"success": False, "error": f"Không tìm thấy file {INPUT_CSV}"}))
            return

        # 3. ĐỌC TỐI ƯU HÓA BỘ NHỚ (Gắn sẵn kiểu dữ liệu nhỏ để bảo vệ RAM)
        log_action("📊 Đang nạp và nén dung lượng bộ nhớ tập dữ liệu đặc trưng...")
        
        # Định nghĩa kiểu dữ liệu nhỏ nhất có thể cho từng cột để tiết kiệm RAM tối đa
        dtypes_dict = {
            'So': 'int8',
            'Thu': 'int8',
            'Gap': 'int16',
            'F5': 'int8',
            'F10': 'int8',
            'F30': 'int8',
            'H_Freq': 'int16',
            'T_Freq': 'int16',
            'Label': 'int8'
        }
        
        df = pd.read_csv(INPUT_CSV, dtype=dtypes_dict)
        log_action(f"📈 Nạp thành công {len(df)} dòng dữ liệu vào cấu trúc RAM thu gọn.")
        
        features = ['So', 'Thu', 'Gap', 'F5', 'F10', 'F30', 'H_Freq', 'T_Freq']
        target_col = 'Label'

        missing_cols = [col for col in features if col not in df.columns]
        if missing_cols:
            log_action(f"❌ Khớp đặc trưng thất bại. Thiếu cột dữ liệu: {missing_cols}")
            print(json.dumps({"success": False, "error": f"Dữ liệu huấn luyện bị thiếu cột: {missing_cols}"}))
            return

        # 4. KÍCH HOẠT HUẤN LUYỆN ĐƠN LUỒNG AN TOÀN CHO GÓI FREE RENDER
        log_action("🧠 Đang khởi tạo thuật toán Random Forest Classifier...")
        model = RandomForestClassifier(
            n_estimators=60,         # Giảm nhẹ từ 100 xuống 60 cây để giảm gánh nặng RAM tính toán mà vẫn giữ nguyên độ chính xác ổn định
            max_depth=12,            # Khống chế độ sâu cây tối đa tránh bùng nổ bộ nhớ
            min_samples_leaf=4, 
            class_weight='balanced', 
            random_state=42, 
            n_jobs=1                 # ĐỂ BẰNG 1: Ép chạy đơn luồng tuần tự, loại bỏ hoàn toàn lỗi văng tiến trình do OOM Killer
        )
        
        log_action("🏋️ AI đang tiến hành học tập và phân tích trọng số các chu kỳ (Vui lòng đợi)...")
        model.fit(df[features], df[target_col])
        
        log_action("💾 Tiến trình học hoàn tất. Đang nén và xuất file mô hình cơ sở dữ liệu...")
        joblib.dump(model, MODEL_OUTPUT, compress=3) # Ép nén mức độ 3 để thu nhỏ dung lượng file cứng tệp .pkl
        
        file_size = round(os.path.getsize(MODEL_OUTPUT) / (1024 * 1024), 2)
        log_action(f"🎉 Huấn luyện mô hình chuẩn thành công! Kích thước file đích: {file_size} MB")
        
        print(json.dumps({
            "success": True,
            "message": "Huấn luyện mô hình chuẩn 8 cột thành công!",
            "used_features": features,
            "file_size_mb": file_size
        }))

    except Exception as e:
        log_action(f"❌ Lỗi xảy ra trong quá trình huấn luyện: {str(e)}")
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    train_model()
