import pandas as pd
import json
import os
from datetime import datetime, timedelta

# 1. ĐỊNH NGHĨA ĐƯỜNG DẪN
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(BASE_DIR, 'system_log.txt')
OUTPUT_DIR = os.path.join(BASE_DIR, '..', 'frontend', 'js')
DATA_FILE = os.path.join(BASE_DIR, 'xsmn_tong_hop_20_nam.csv')
OUTPUT_JS = os.path.join(OUTPUT_DIR, 'dashboard_data.js')

os.makedirs(OUTPUT_DIR, exist_ok=True)

def log_action(message):
    vn_timestamp = (datetime.utcnow() + timedelta(hours=7)).strftime('%d/%m/%Y %H:%M:%S')
    log_entry = f"[{vn_timestamp}] [PYTHON - build_data] {message}\n"
    try:
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(log_entry)
        print(log_entry.strip())
    except:
        pass

def export_permanent_mlops_data():
    log_action("Bắt đầu đóng gói dữ liệu tĩnh JS...")
    
    if not os.path.exists(DATA_FILE):
        log_action("❌ Không tìm thấy file dữ liệu gốc.")
        return

    # 1. Đọc dữ liệu
    df = pd.read_csv(DATA_FILE, dtype=str)
    df['Date_DT'] = pd.to_datetime(df['Ngày'], format='%d/%m/%Y', errors='coerce')
    df = df.sort_values('Date_DT').reset_index(drop=True)
    
    all_dates = sorted(df['Ngày'].unique(), key=lambda x: datetime.strptime(x, '%d/%m/%Y'))
    all_channels = df['Đài'].unique().tolist()
    
    # 2. Xử lý dữ liệu lịch sử vẽ biểu đồ
    historical_lines = {}
    for channel in all_channels:
        historical_lines[channel] = [None] * len(all_dates)
        df_channel = df[df['Đài'] == channel]
        for _, row in df_channel.iterrows():
            date_idx = all_dates.index(row['Ngày'])
            try:
                val = str(row['G.8']).split('.')[0]
                historical_lines[channel][date_idx] = int(val[-2:])
            except: 
                pass
                
    # --- KIẾN TRÚC MỚI TINH GỌN ---
    # Loại bỏ hoàn toàn top_3_today để tránh dư thừa và xung đột múi giờ hệ thống
    vn_now = datetime.utcnow() + timedelta(hours=7)    
    final_package = {
        "build_time": vn_now.strftime('%d/%m/%Y %H:%M:%S'),
        "timeline_x": all_dates,
        "lines_y": historical_lines
    }
    
    # 3. Ghi file JS
    with open(OUTPUT_JS, 'w', encoding='utf-8') as f:
        f.write("const xoso_data = ")
        json.dump(final_package, f, ensure_ascii=False, indent=2)
        f.write(";")
        
    log_action(f"🎉 Đã tạo thành công file tĩnh đồ thị tại: {OUTPUT_JS}")

if __name__ == "__main__":
    export_permanent_mlops_data()
