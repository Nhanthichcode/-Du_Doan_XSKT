import pandas as pd
import joblib
import json
import os
from sklearn.ensemble import RandomForestClassifier

def train_model():
    try:
        # Đường dẫn tuyệt đối an toàn khi chạy ngầm trên Render
        BASE_DIR = os.path.dirname(os.path.abspath(__file__))
        input_csv = os.path.join(BASE_DIR, 'data_training_ai.csv')
        
        if not os.path.exists(input_csv):
            print(json.dumps({"success": False, "error": f"Không tìm thấy file {input_csv}"}))
            return

        # 1. Đọc dữ liệu đã chế biến ở Bước 2
        df = pd.read_csv(input_csv)
        
        # 2. ĐỒNG BỘ 8 CỘT (Khớp 100% với file du_doan.py và chuyen_thanh_du_lieu_huan_luyen.py)
        features = ['So', 'Thu', 'Gap', 'F5', 'F10', 'F30', 'H_Freq', 'T_Freq']
        target_col = 'Label' if 'Label' in df.columns else 'Target'

        # Kiểm tra bảo vệ lỗi: Đảm bảo dữ liệu đổ ra đủ 8 cột
        missing_cols = [col for col in features if col not in df.columns]
        if missing_cols:
            print(json.dumps({"success": False, "error": f"Dữ liệu huấn luyện bị thiếu cột: {missing_cols}"}))
            return

        # 3. Kích hoạt huấn luyện
        model = RandomForestClassifier(
            n_estimators=100, 
            max_depth=15, 
            min_samples_leaf=3, 
            class_weight='balanced', 
            random_state=42, 
            n_jobs=-1
        )
        
        model.fit(df[features], df[target_col])
        
        # 4. Xuất file mô hình .pkl để Bước 4 dùng
        model_name = os.path.join(BASE_DIR, 'model_xsmn_predict.pkl')
        joblib.dump(model, model_name, compress=3)
        
        print(json.dumps({
            "success": True,
            "message": "Huấn luyện mô hình chuẩn 8 cột thành công!",
            "used_features": features,
            "file_size_mb": round(os.path.getsize(model_name) / (1024 * 1024), 2)
        }))

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    train_model()
