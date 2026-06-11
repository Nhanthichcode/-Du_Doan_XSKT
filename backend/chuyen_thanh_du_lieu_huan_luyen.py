import pandas as pd
import re
import os
import json

def generate_training_data():
    try:
        input_file = 'xsmn_tong_hop_20_nam.csv'
        output_file = 'data_training_ai.csv'

        if not os.path.exists(input_file):
            print(json.dumps({"success": False, "error": "Chưa có file dữ liệu gốc để xử lý."}))
            return

        df_raw = pd.read_csv(input_file)
        df_raw['Date_DT'] = pd.to_datetime(df_raw['Ngày'], dayfirst=True)
        df_raw['Thu'] = df_raw['Date_DT'].dt.dayofweek + 2

        def get_day_lotos(row):
            lotos = []
            cols = ['G.8', 'G.7', 'G.6', 'G.5', 'G.4', 'G.3', 'G.2', 'G.1', 'ĐB']
            for col in cols:
                val = str(row.get(col, '')).split('.')[0]
                nums = re.findall(r'\d{2,}', val)
                for n in nums: lotos.append(n[-2:])
            return list(set(lotos))

        all_training_data = []

        for dai, group in df_raw.groupby('Đài'):
            group = group.sort_values('Date_DT').reset_index(drop=True)
            if len(group) < 35: continue
            
            draws = group.apply(get_day_lotos, axis=1).tolist()
            thus = group['Thu'].tolist()
            
            # Giới hạn lấy tối đa 150 kỳ gần nhất của mỗi đài để tránh tràn RAM trên Render Free
            start_idx = max(30, len(group) - 150)
            
            for i in range(start_idx, len(group)):
                history_5 = draws[i-5:i]
                flat_5 = [item for sublist in history_5 for item in sublist]
                h5 = [s[0] for s in flat_5] if flat_5 else []
                t5 = [s[1] for s in flat_5] if flat_5 else []
                
                for n in range(100):
                    s_num = f"{n:02d}"
                    gap = 0
                    for j in range(i-1, -1, -1):
                        if s_num in draws[j]: break
                        gap += 1
                    
                    label = 1 if s_num in draws[i] else 0
                    
                    all_training_data.append({
                        'So': n, 'Thu': thus[i], 'Gap': gap,
                        'F5': sum(1 for d in draws[i-5:i] if s_num in d),
                        'F10': sum(1 for d in draws[i-10:i] if s_num in d),
                        'F30': sum(1 for d in draws[i-30:i] if s_num in d),
                        'H_Freq': h5.count(s_num[0]),
                        'T_Freq': t5.count(s_num[1]),
                        'Label': label
                    })

        df_ml = pd.DataFrame(all_training_data)
        df_ml.to_csv(output_file, index=False)
        print(json.dumps({"success": True, "message": "Xử lý dữ liệu 8 cột thành công!"}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    generate_training_data()