import pandas as pd
import joblib
import re
import json
import os
from datetime import datetime, timedelta

# 1. ĐỊNH NGHĨA ĐƯỜNG DẪN CHUẨN
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(BASE_DIR, 'system_log.txt')
OUTPUT_DIR = os.path.join(BASE_DIR, '..', 'frontend', 'js')
HISTORY_FILE = os.path.join(OUTPUT_DIR, 'history_predictions.json')

def log_action(message):
    # Ép giờ Việt Nam chuẩn xác cho file Nhật ký hệ thống
    vn_timestamp = (datetime.utcnow() + timedelta(hours=7)).strftime('%d/%m/%Y %H:%M:%S')
    log_entry = f"[{vn_timestamp}] [PYTHON - du_doan] {message}\n"
    try:
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(log_entry)
        print(log_entry.strip())
    except:
        pass

def predict_all_today_channels(data_file, model_file):
    try:
        log_action("Bắt đầu chạy thuật toán dự đoán AI...")
        os.makedirs(OUTPUT_DIR, exist_ok=True)

        if not os.path.exists(data_file) or not os.path.exists(model_file):
            log_action("❌ Lỗi: Thiếu file dữ liệu hoặc mô hình AI.")
            return

        model = joblib.load(model_file)
        df = pd.read_csv(data_file, dtype=str)
        
        # --- ĐỒNG BỘ MÚI GIỜ GMT+7 VÀ PHÂN CHIA CHIẾN LƯỢC CUỘN NGÀY ---
        vn_now = datetime.utcnow() + timedelta(hours=7)
        
        # Nếu chạy sau 17h00 chiều (như mốc 23h40 của bạn), kết quả hôm nay đã ra, ta phải dự đoán cho NGÀY MAI
        if vn_now.hour >= 17:
            target_date = vn_now + timedelta(days=1)
            log_action(f"🌙 Hệ thống chạy vào đêm muộn ({vn_now.strftime('%H:%M')}). Tự động cuộn lịch sang NGÀY MAI ({target_date.strftime('%d/%m/%Y')}) để dự báo.")
        else:
            target_date = vn_now
            log_action(f"☀️ Hệ thống chạy ban ngày ({vn_now.strftime('%H:%M')}). Tiến hành dự báo cho NGÀY HÔM NAY ({target_date.strftime('%d/%m/%Y')}).")
            
        target_weekday = target_date.weekday() + 2  # Quy đổi ra Thứ chuẩn Việt Nam (Thứ 2 -> Chủ Nhật là 2 -> 8)
        
        df['Date_DT'] = pd.to_datetime(df['Ngày'], format='%d/%m/%Y', errors='coerce')
        df['Thu'] = df['Date_DT'].dt.dayofweek + 2

        # Tìm ngày có cùng thứ gần nhất trong lịch sử để bốc chính xác các đài quay của ngày mục tiêu
        max_date_for_weekday = df[df['Thu'] == target_weekday]['Date_DT'].max()
        today_channels = df[(df['Thu'] == target_weekday) & (df['Date_DT'] == max_date_for_weekday)]['Đài'].unique().tolist()

        if not today_channels:
            log_action(f"⚠️ Không tìm thấy lịch sử mở thưởng của Thứ {target_weekday} để làm căn cứ.")
            return

        def get_day_lotos(row):
            val = str(row.get('G.8', '')).split('.')[0]
            nums = re.findall(r'\d{2,}', val)
            return [n[-2:] for n in nums]

        output_data = {
            "thu": target_weekday,
            "ngay_du_doan": target_date.strftime('%d/%m/%Y'),
            "results": []
        }

        # --- Vòng lặp tính toán đặc trưng và toán dự đoán AI ---
        for dai_name in today_channels:
            df_dai = df[df['Đài'] == dai_name].sort_values('Date_DT').reset_index(drop=True)
            if len(df_dai) < 35: continue

            draw_results = df_dai.apply(get_day_lotos, axis=1).tolist()
            history_5 = draw_results[-5:]
            flat_5 = [item for sublist in history_5 for item in sublist]
            h5 = [s[0] for s in flat_5] if flat_5 else []
            t5 = [s[1] for s in flat_5] if flat_5 else []

            current_features = []
            for n in range(100):
                s_num = f"{n:02d}"
                gap = 0
                for j in range(len(draw_results)-1, -1, -1):
                    if s_num in draw_results[j]: break
                    gap += 1
                
                current_features.append({
                    'So': n, 'Thu': target_weekday, 'Gap': gap,
                    'F5': sum(1 for d in draw_results[-5:] if s_num in d),
                    'F10': sum(1 for d in draw_results[-10:] if s_num in d),
                    'F30': sum(1 for d in draw_results[-30:] if s_num in d),
                    'H_Freq': h5.count(s_num[0]), 'T_Freq': t5.count(s_num[1])
                })

            X_predict = pd.DataFrame(current_features)
            feature_cols = ['So', 'Thu', 'Gap', 'F5', 'F10', 'F30', 'H_Freq', 'T_Freq']
            
            probs = model.predict_proba(X_predict[feature_cols])[:, 1]
            X_predict['Xac_Suat'] = probs
            top_3 = X_predict.sort_values('Xac_Suat', ascending=False).head(3).reset_index(drop=True)

            dai_result = {"dai": dai_name, "predictions": []}
            for _, row in top_3.iterrows():
                dai_result["predictions"].append({"so": f"{int(row['So']):02d}", "xac_suat": round(float(row['Xac_Suat']) * 100, 2)})
            output_data["results"].append(dai_result)

        # --- Gộp kết quả vào kho tệp JSON Lịch Sử ---
        date_key = target_date.strftime('%d/%m/%Y')
        history = {}
        
        if os.path.exists(HISTORY_FILE):
            with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                try: history = json.load(f)
                except: history = {}

        # Ghi nhận bộ dự đoán mới dưới nhãn ngày mai
        history[date_key] = output_data["results"]
        log_action(f"✅ Đã lưu bộ dự đoán của ngày {date_key} vào tệp lịch sử.")

        # [ĐỐI SOÁT THÔNG MINH]: Dò tìm kết quả thực tế từ file tổng hợp CSV
        log_action("🔄 Đang quét đối chiếu và vá kết quả thực tế cho dải ngày cũ...")
        for past_date, stations_list in list(history.items()):
            df_date = df[df['Ngày'] == past_date]
            
            # Nếu ngày này chưa có kết quả quay thưởng thật trong file CSV (Ví dụ ngày mai) -> Dọn sạch trường check trúng
            if df_date.empty:
                for station in stations_list:
                    station.pop('actual_g8', None)
                    station.pop('is_hit', None)
                continue 
                
            for station in stations_list:
                dai_name = station.get('dai')
                df_match = df_date[df_date['Đài'] == dai_name]
                
                if not df_match.empty:
                    row_match = df_match.iloc[0]
                    val_g8 = str(row_match.get('G.8', '')).split('.')[0]
                    nums_g8 = re.findall(r'\d+', val_g8)
                    if nums_g8:
                        actual_g8 = f"{int(nums_g8[0][-2:]):02d}"
                        station['actual_g8'] = actual_g8
                        pred_numbers = [p['so'] for p in station.get('predictions', [])]
                        station['is_hit'] = actual_g8 in pred_numbers

        # Xuất file JSON
        with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
            json.dump(history, f, ensure_ascii=False, indent=2)
            
        log_action(f"🎉 Hoàn tất chuỗi xử lý đối soát tại: {HISTORY_FILE}")

    except Exception as e:
        log_action(f"❌ Lỗi nghiêm trọng: {str(e)}")

if __name__ == "__main__":
    predict_all_today_channels('xsmn_tong_hop_20_nam.csv', 'model_xsmn_predict.pkl')