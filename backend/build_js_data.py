import pandas as pd
import json
import os
import random
from datetime import datetime

# Định nghĩa đường dẫn tuyệt đối động động chống lỗi vị trí chạy
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, 'xsmn_tong_hop_20_nam.csv')
DB_HISTORY_PRED = os.path.join(BASE_DIR, 'history_predictions.json') # File lưu vết vĩnh viễn

# Đường dẫn xuất thẳng vào thư mục js của frontend theo đúng cấu trúc của bạn
OUTPUT_JS = os.path.join(BASE_DIR, '..', 'frontend', 'js', 'dashboard_data.js')

def export_permanent_mlops_data():
    if not os.path.exists(DATA_FILE):
        print("❌ Không tìm thấy file dữ liệu gốc xsmn_tong_hop_20_nam.csv")
        return

    # 1. Đọc và sắp xếp lịch sử kết quả thật
    df = pd.read_csv(DATA_FILE, dtype=str)
    df['Date_DT'] = pd.to_datetime(df['Ngày'], dayfirst=True)
    df = df.sort_values('Date_DT').reset_index(drop=True)
    
    all_dates = sorted(df['Ngày'].unique(), key=lambda x: datetime.strptime(x, '%d/%m/%Y'))
    all_channels = df['Đài'].unique().tolist()
    
    # Tạo cấu trúc trục Y kết quả thật cho biểu đồ đường
    historical_lines = {}
    for channel in all_channels:
        historical_lines[channel] = [None] * len(all_dates)
        df_channel = df[df['Đài'] == channel]
        for _, row in df_channel.iterrows():
            date_str = row['Ngày']
            date_idx = all_dates.index(date_str)
            try:
                historical_lines[channel][date_idx] = int(str(row['G.8']).split('.')[0][-2:])
            except:
                pass

    # 2. XỬ LÝ LƯU TRỮ VĨNH VIỄN KẾT QUẢ DỰ ĐOÁN CỦA AI
    today_str = datetime.now().strftime('%d/%m/%Y')
    
    # Nạp kho lịch sử dự đoán cũ lên (Nếu chưa có thì tạo mới)
    if os.path.exists(DB_HISTORY_PRED):
        with open(DB_HISTORY_PRED, 'r', encoding='utf-8') as f:
            history_predictions = json.load(f)
    else:
        history_predictions = {}

    # Tạo dự đoán cho ngày hôm nay (Top 3 số vàng/đài)
    # Trong thực tế hệ thống, đoạn này sẽ nhận mảng kết quả từ file du_doan.py của bạn
    today_channels = df[df['Ngày'] == all_dates[-1]]['Đài'].unique().tolist() # Lấy đài kỳ gần nhất làm mẫu
    today_pred_data = []
    
    for dai in today_channels:
        ai_numbers = [f"{random.randint(0, 99):02d}" for _ in range(3)] # Giả lập 3 số AI chọn
        today_pred_data.append({
            "dai": dai,
            "predictions": [
                {"so": ai_numbers[0], "xac_suat": 72.4},
                {"so": ai_numbers[1], "xac_suat": 58.1},
                {"so": ai_numbers[2], "xac_suat": 44.9}
            ]
        })
    
    # Lưu vĩnh viễn dự đoán hôm nay vào kho lưu trữ dữ liệu nền
    history_predictions[today_str] = today_pred_data
    with open(DB_HISTORY_PRED, 'w', encoding='utf-8') as f:
        json.dump(history_predictions, f, ensure_ascii=False, indent=2)

    # 3. ĐỐI CHIẾU KIỂM TRA CHÉO (BACKTEST THỰC TẾ TỪ LỊCH SỬ LƯU VẾT)
    backtest_report = []
    
    # Quét qua tất cả các ngày trong quá khứ mà AI từng đoán để đối chiếu kết quả thật đã nổ
    for past_date, pred_list in history_predictions.items():
        if past_date == today_str: 
            continue # Ngày hôm nay chưa quay thưởng nên bỏ qua không đối chiếu
            
        df_past_real = df[df['Ngày'] == past_date]
        if df_past_real.empty: 
            continue
            
        for channel_pred in pred_list:
            dai_name = channel_pred['dai']
            # Lấy số thật giải 8 mở thưởng ngày hôm đó
            row_real = df_past_real[df_past_real['Đài'] == dai_name]
            if not row_real.empty:
                real_g8 = str(row_real.iloc[0]['G.8']).split('.')[0][-2:]
                ai_so_vàng = [p['so'] for p in channel_pred['predictions']]
                
                is_hit = real_g8 in ai_so_vàng
                backtest_report.append({
                    "date": past_date,
                    "dai": dai_name,
                    "real_number": real_g8,
                    "ai_numbers": ai_so_vàng,
                    "success": is_hit
                })

    # 4. ĐÓNG GÓI THÀNH FILE JAVASCRIPT TĨNH
    final_package = {
        "build_time": datetime.now().strftime('%d/%m/%Y %H:%M:%S'),
        "timeline_x": all_dates,
        "lines_y": historical_lines,
        "top_3_today": today_pred_data,
        "backtest_history": backtest_report[-6:] # Chỉ trả về 6 trận đối chiếu gần nhất để giao diện gọn gàng
    }
    
    # Đảm bảo thư mục đích tồn tại trước khi ghi file
    os.makedirs(os.path.dirname(OUTPUT_JS), exist_ok=True)
    
    with open(OUTPUT_JS, 'w', encoding='utf-8') as f:
        f.write("const xoso_data = ")
        json.dump(final_package, f, ensure_ascii=False, indent=2)
        f.write(";")
        
    print(f"🎉 Đã đồng bộ & Cập nhật kho dữ liệu vĩnh viễn tại: '{OUTPUT_JS}'")

if __name__ == "__main__":
    export_permanent_mlops_data()
