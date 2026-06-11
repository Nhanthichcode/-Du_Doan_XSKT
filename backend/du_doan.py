import pandas as pd
import joblib
import re
import json
import os
from datetime import datetime

def predict_all_today_channels(data_file, model_file):
    try:
        if not os.path.exists(data_file) or not os.path.exists(model_file):
            print(json.dumps({"success": False, "error": "Thiếu file dữ liệu hoặc mô hình AI."}))
            return

        model = joblib.load(model_file)
        df = pd.read_csv(data_file, dtype=str)
        
        # 1. Xác định thứ hiện tại (Thứ 2 = 2, ..., Chủ Nhật = 8)
        today_weekday = datetime.now().weekday() + 2
        
        df['Date_DT'] = pd.to_datetime(df['Ngày'], dayfirst=True)
        df['Thu'] = df['Date_DT'].dt.dayofweek + 2

        # 2. Lấy danh sách các đài mở thưởng của Thứ này trong lịch sử gần đây
        recent_records = df[df['Thu'] == today_weekday].sort_values('Date_DT', ascending=False).head(30)
        today_channels = recent_records['Đài'].unique().tolist()

        if not today_channels:
            print(json.dumps({"success": False, "error": f"Không tìm thấy đài nào mở thưởng cho Thứ {today_weekday}"}))
            return

        # Hàm băm số chuẩn từ cột G.8 theo file dữ liệu gốc của bạn
        def get_day_lotos(row):
            val = str(row.get('G.8', '')).split('.')[0]
            nums = re.findall(r'\d{2,}', val)
            return [n[-2:] for n in nums]

        output_data = {
            "success": True,
            "thu": today_weekday,
            "ngay_du_doan": datetime.now().strftime('%d-%m-%Y'),
            "results": []
        }

        # 3. Vòng lặp dự đoán tự động cho từng đài trong ngày
        for dai_name in today_channels:
            df_dai = df[df['Đài'] == dai_name].sort_values('Date_DT').reset_index(drop=True)
            if len(df_dai) < 35: 
                continue

            draw_results = df_dai.apply(get_day_lotos, axis=1).tolist()

            current_features = []
            for n in range(100):
                s_num = f"{n:02d}"
                
                # Tính Nhịp Gan (Gap)
                gap = 0
                for j in range(len(draw_results)-1, -1, -1):
                    if s_num in draw_results[j]: 
                        break
                    gap += 1
                
                # Tính Tần suất xuất hiện 10 kỳ và 30 kỳ
                freq_10 = sum(1 for res in draw_results[-10:] if s_num in res)
                freq_30 = sum(1 for res in draw_results[-30:] if s_num in res)
                was_last = 1 if s_num in draw_results[-1] else 0

                current_features.append({
                    'So': n,
                    'Gap': gap,
                    'Freq_10': freq_10,
                    'Freq_30': freq_30,
                    'Was_Last': was_last
                })

            # Xây dựng DataFrame chuẩn 5 cột để nạp vào mô hình AI
            X_predict = pd.DataFrame(current_features)
            feature_cols = ['So', 'Gap', 'Freq_10', 'Freq_30', 'Was_Last']
            
            # Dự đoán xác suất
            probs = model.predict_proba(X_predict[feature_cols])[:, 1]
            X_predict['Xac_Suat'] = probs

            # Lấy ra Top 3 số có xác suất nổ cao nhất
            top_3 = X_predict.sort_values('Xac_Suat', ascending=False).head(3).reset_index(drop=True)

            dai_result = {
                "dai": dai_name,
                "ngay_cap_nhat_cu": str(df_dai['Ngày'].iloc[-1]),
                "predictions": []
            }
            for _, row in top_3.iterrows():
                dai_result["predictions"].append({
                    "so": f"{int(row['So']):02d}",
                    "xac_suat": round(float(row['Xac_Suat']) * 100, 2)
                })
            
            output_data["results"].append(dai_result)

        print(json.dumps(output_data, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    predict_all_today_channels('xsmn_tong_hop_20_nam.csv', 'model_xsmn_predict.pkl')