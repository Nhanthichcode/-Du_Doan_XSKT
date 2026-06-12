import pandas as pd
import json
import os
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, 'xsmn_tong_hop_20_nam.csv')
PRED_FILE = os.path.join(BASE_DIR, '..', 'frontend', 'js', 'history_predictions.json')
OUTPUT_JS = os.path.join(BASE_DIR, '..', 'frontend', 'js', 'dashboard_data.js')

def update_dashboard():
    # 1. Đọc dữ liệu lịch sử
    df = pd.read_csv(DATA_FILE, dtype=str)
    df['Date_DT'] = pd.to_datetime(df['Ngày'], dayfirst=True)
    
    # Chỉ lấy 30 ngày gần nhất để dashboard chạy nhanh
    recent_dates = sorted(df['Date_DT'].unique())[-30:]
    
    timeline_x = [d.strftime('%d/%m/%Y') for d in recent_dates]
    lines_y = {}

    # Lấy dữ liệu giải 8 cho các đài
    for dai in df['Đài'].unique():
        lines_y[dai] = []
        for d in recent_dates:
            val = df[(df['Đài'] == dai) & (df['Date_DT'] == d)]['G.8'].values
            lines_y[dai].append(val[0] if len(val) > 0 else None)

    # 2. Đọc dự đoán mới nhất (nếu có)
    predictions = {}
    if os.path.exists(PRED_FILE):
        with open(PRED_FILE, 'r', encoding='utf-8') as f:
            predictions = json.load(f)

    # 3. Đóng gói JSON
    data = {
        "build_time": datetime.now().strftime('%d/%m/%Y %H:%M:%S'),
        "timeline_x": timeline_x,
        "lines_y": lines_y,
        "predictions": predictions
    }

    # 4. Ghi file JS (Dạng biến hằng số để frontend load)
    js_content = f"const xoso_data = {json.dumps(data, indent=2, ensure_ascii=False)};"
    
    with open(OUTPUT_JS, 'w', encoding='utf-8') as f:
        f.write(js_content)
    
    print(f"🎉 Đã cập nhật xong dữ liệu mới vào {OUTPUT_JS} lúc {data['build_time']}")

if __name__ == "__main__":
    update_dashboard()
