import pandas as pd
import json
import os
import random
from datetime import datetime

# Định nghĩa đường dẫn mục tiêu là thư mục js của frontend
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Giả sử cấu trúc: backend/ (đang chạy) và frontend/js/ (chứa data)
OUTPUT_DIR = os.path.join(BASE_DIR, '..', 'frontend', 'js')

# Đảm bảo thư mục js tồn tại
os.makedirs(OUTPUT_DIR, exist_ok=True)

DATA_FILE = os.path.join(BASE_DIR, 'xsmn_tong_hop_20_nam.csv')
DB_HISTORY_PRED = os.path.join(OUTPUT_DIR, 'history_predictions.json') 
OUTPUT_JS = os.path.join(OUTPUT_DIR, 'dashboard_data.js')

def export_permanent_mlops_data():
    if not os.path.exists(DATA_FILE):
        print("❌ Không tìm thấy file dữ liệu gốc.")
        return

    # 1. Đọc dữ liệu (giữ nguyên logic cũ)
    df = pd.read_csv(DATA_FILE, dtype=str)
    df['Date_DT'] = pd.to_datetime(df['Ngày'], dayfirst=True)
    df = df.sort_values('Date_DT').reset_index(drop=True)
    
    all_dates = sorted(df['Ngày'].unique(), key=lambda x: datetime.strptime(x, '%d/%m/%Y'))
    all_channels = df['Đài'].unique().tolist()
    
    historical_lines = {}
    for channel in all_channels:
        historical_lines[channel] = [None] * len(all_dates)
        df_channel = df[df['Đài'] == channel]
        for _, row in df_channel.iterrows():
            date_idx = all_dates.index(row['Ngày'])
            try:
                historical_lines[channel][date_idx] = int(str(row['G.8']).split('.')[0][-2:])
            except: pass

    # 2. XỬ LÝ FILE LỊCH SỬ DỰ ĐOÁN (history_predictions.json)
    # Lấy dự đoán từ file tạm hoặc biến toàn cục của bạn
    # (Tại đây ta giả định bạn đã có kết quả dự đoán của hôm nay)
    today_str = datetime.now().strftime('%d/%m/%Y')
    
    if os.path.exists(DB_HISTORY_PRED):
        with open(DB_HISTORY_PRED, 'r', encoding='utf-8') as f:
            try: history_predictions = json.load(f)
            except: history_predictions = {}
    else:
        history_predictions = {}

    # Ghi đè hoặc thêm mới dữ liệu dự đoán hôm nay vào file JSON
    # Lưu ý: Bạn cần đảm bảo 'today_pred_data' đã được tính toán từ du_doan.py
    # Ở đây tôi giả định bạn đã có biến này từ luồng xử lý trước đó
    # history_predictions[today_str] = today_pred_data 
    
    with open(DB_HISTORY_PRED, 'w', encoding='utf-8') as f:
        json.dump(history_predictions, f, ensure_ascii=False, indent=2)

    # 3. ĐÓNG GÓI JS TĨNH (dashboard_data.js)
    # Gộp các thông tin cần thiết vào file dashboard_data.js
    final_package = {
        "build_time": datetime.now().strftime('%d/%m/%Y %H:%M:%S'),
        "timeline_x": all_dates,
        "lines_y": historical_lines,
        # Các dữ liệu cần hiển thị ngay lập tức trên dashboard
        "top_3_today": history_predictions.get(today_str, []),
        "backtest_history": [] # (Tính toán logic backtest của bạn ở đây)
    }
    
    with open(OUTPUT_JS, 'w', encoding='utf-8') as f:
        f.write("const xoso_data = ")
        json.dump(final_package, f, ensure_ascii=False, indent=2)
        f.write(";")
        
    print(f"🎉 Đã đồng bộ tại: {OUTPUT_DIR}")

if __name__ == "__main__":
    export_permanent_mlops_data()
