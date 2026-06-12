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
        
        today_weekday = datetime.now().weekday() + 2
        df['Date_DT'] = pd.to_datetime(df['Ngày'], dayfirst=True)
        df['Thu'] = df['Date_DT'].dt.dayofweek + 2

        recent_records = df[df['Thu'] == today_weekday].sort_values('Date_DT', ascending=False).head(30)
        today_channels = recent_records['Đài'].unique().tolist()

        if not today_channels:
            print(json.dumps({"success": False, "error": f"Không tìm thấy đài mở thưởng Thứ {today_weekday}"}))
            return

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

        # --- Vòng lặp dự đoán ---
        for dai_name in today_channels:
            df_dai = df[df['Đài'] == dai_name].sort_values('Date_DT').reset_index(drop=True)
            if len(df_dai) < 35: continue

            draw_results = df_dai.apply(get_day_lotos, axis=1).tolist()
            current_features = []
            for n in range(100):
                s_num = f"{n:02d}"
                gap = 0
                for j in range(len(draw_results)-1, -1, -1):
                    if s_num in draw_results[j]: break
                    gap += 1
                
                current_features.append({
                    'So': n, 'Gap': gap,
                    'Freq_10': sum(1 for res in draw_results[-10:] if s_num in res),
                    'Freq_30': sum(1 for res in draw_results[-30:] if s_num in res),
                    'Was_Last': 1 if s_num in draw_results[-1] else 0
                })

            X_predict = pd.DataFrame(current_features)
            probs = model.predict_proba(X_predict[['So', 'Gap', 'Freq_10', 'Freq_30', 'Was_Last']])[:, 1]
            X_predict['Xac_Suat'] = probs
            top_3 = X_predict.sort_values('Xac_Suat', ascending=False).head(3).reset_index(drop=True)

            dai_result = {"dai": dai_name, "predictions": []}
            for _, row in top_3.iterrows():
                dai_result["predictions"].append({"so": f"{int(row['So']):02d}", "xac_suat": round(float(row['Xac_Suat']) * 100, 2)})
            output_data["results"].append(dai_result)

        # --- Ghi dữ liệu vào file JSON ---
        file_path = 'history_predictions.json'
        date_key = datetime.now().strftime('%d/%m/%Y')
        history = {}
        
        if os.path.exists(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
                try: history = json.load(f)
                except: history = {}

        if date_key not in history:
            history[date_key] = output_data["results"]
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(history, f, ensure_ascii=False, indent=2)
            print(f"✅ Đã lưu dự đoán cho ngày {date_key}")
        else:
            print(f"⚠️ Ngày {date_key} đã có dự đoán, không ghi đè.")

        print(json.dumps(output_data, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    predict_all_today_channels('xsmn_tong_hop_20_nam.csv', 'model_xsmn_predict.pkl')
