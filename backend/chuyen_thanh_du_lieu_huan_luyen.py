import pandas as pd
import re
import os
import json
from datetime import datetime, timedelta

# 1. ĐỊNH NGHĨA ĐƯỜNG DẪN TUYỆT ĐỐI CHUẨN
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(BASE_DIR, 'system_log.txt')
INPUT_FILE = os.path.join(BASE_DIR, 'xsmn_tong_hop_20_nam.csv')
OUTPUT_FILE = os.path.join(BASE_DIR, 'data_training_ai.csv')

# 2. HÀM GHI LOG ĐỒNG BỘ VÀO SYSTEM_LOG.TXT
def log_action(message):
    # ĐÃ SỬA: Chuyển cú pháp JavaScript thành cú pháp Python GMT+7 chuẩn xác
    timestamp = (datetime.utcnow() + timedelta(hours=7)).strftime('%d/%m/%Y %H:%M:%S')
    log_entry = f"[{timestamp}] [PYTHON - chuyen_du_lieu] {message}\n"
    try:
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(log_entry)
        print(log_entry.strip(), flush=True)
    except:
        print(log_entry.strip(), flush=True)

def generate_training_data():
    try:
        log_action("🚀 Khởi chạy tiến trình trích xuất đặc trưng AI (Chế độ bảo vệ RAM)...")

        if not os.path.exists(INPUT_FILE):
            log_action("❌ Lỗi nghiêm trọng: Không tìm thấy tệp gốc xsmn_tong_hop_20_nam.csv")
            print(json.dumps({"success": False, "error": "Chưa có file dữ liệu gốc để xử lý."}))
            return

        log_action("📊 Đang nạp cơ sở dữ liệu CSV vào bộ nhớ...")
        df_raw = pd.read_csv(INPUT_FILE)
        df_raw['Date_DT'] = pd.to_datetime(df_raw['Ngày'], dayfirst=True)
        df_raw['Thu'] = df_raw['Date_DT'].dt.dayofweek + 2

        def get_day_lotos(row):
            val = str(row.get('G.8', '')).split('.')[0]
            nums = re.findall(r'\d{2,}', val)
            return [n[-2:] for n in nums]

        grouped = list(df_raw.groupby('Đài'))
        total_groups = len(grouped)
        
        log_action(f"📂 Tổng hợp phát hiện {total_groups} đài cần phân tích chu kỳ lịch sử.")

        # XÓA FILE CŨ ĐỂ GHI MỚI TỪ ĐẦU THEO PHƯƠNG PHÁP CUỐN CHIẾU
        if os.path.exists(OUTPUT_FILE):
            os.remove(OUTPUT_FILE)
            log_action("🗑️ Đã làm sạch tệp dữ liệu huấn luyện cũ để chuẩn bị ghi cuốn chiếu.")

        is_header_written = False

        for idx, (dai, group) in enumerate(grouped, 1):
            log_action(f"🔄 [{idx}/{total_groups}] Đang tính toán chu kỳ cho Đài: {dai}...")
            
            group = group.sort_values('Date_DT').reset_index(drop=True)
            draws = group.apply(get_day_lotos, axis=1).tolist()
            thus = group['Thu'].tolist()
            
            start_idx = 30
            total_rows_in_group = len(group)
            
            if total_rows_in_group <= start_idx:
                log_action(f"⚠️ Đài {dai} có ít hơn 30 kỳ quay thưởng, bỏ qua.")
                continue

            # Mảng tạm thời chỉ lưu dữ liệu cho RIÊNG ĐÀI HIỆN TẠI nhằm bảo vệ tài nguyên RAM
            dai_training_data = []
            
            last_seen = {f"{n:02d}": -1 for n in range(100)}
            
            for i in range(start_idx):
                for num in draws[i]:
                    last_seen[num] = i

            for i in range(start_idx, total_rows_in_group):
                if i % 300 == 0:
                    percentage = round((i / total_rows_in_group) * 100, 1)
                    log_action(f"   ↳ Tiến độ đài {dai}: {i}/{total_rows_in_group} kỳ ({percentage}%)")

                history_5 = draws[i-5:i]
                flat_5 = [item for sublist in history_5 for item in sublist]
                h5 = [s[0] for s in flat_5] if flat_5 else []
                t5 = [s[1] for s in flat_5] if flat_5 else []
                
                for n in range(100):
                    s_num = f"{n:02d}"
                    
                    if last_seen[s_num] == -1:
                        gap = i
                    else:
                        gap = i - 1 - last_seen[s_num]
                        
                    label = 1 if s_num in draws[i] else 0
                    
                    dai_training_data.append({
                        'So': n, 'Thu': thus[i], 'Gap': gap,
                        'F5': sum(1 for d in draws[i-5:i] if s_num in d),
                        'F10': sum(1 for d in draws[i-10:i] if s_num in d),
                        'F30': sum(1 for d in draws[i-30:i] if s_num in d),
                        'H_Freq': h5.count(s_num[0]),
                        'T_Freq': t5.count(s_num[1]),
                        'Label': label
                    })
                
                for num in draws[i]:
                    last_seen[num] = i

            # TIẾN HÀNH GHI CUỐN CHIẾU ĐÀI NÀY XUỐNG Ổ CỨNG VÀ XÓA MẢNG ĐỂ GIẢI PHÓNG RAM NGAY LẬP TỨC
            if dai_training_data:
                df_dai_ml = pd.DataFrame(dai_training_data)
                df_dai_ml.to_csv(
                    OUTPUT_FILE, 
                    mode='a', 
                    index=False, 
                    header=not is_header_written, 
                    encoding='utf-8'
                )
                is_header_written = True
                log_action(f"💾 Đã xả {len(dai_training_data)} dòng của đài {dai} xuống ổ cứng & giải phóng RAM.")
                
                # Giải phóng bộ nhớ RAM triệt để cho vòng lặp đài kế tiếp
                del dai_training_data
                del df_dai_ml

        log_action(f"✅ Hoàn thành xuất sắc! Toàn bộ 21 đài đã được trích xuất an toàn vào tệp: {OUTPUT_FILE}")
        print(json.dumps({"success": True, "message": "Đã tạo xong dữ liệu huấn luyện dạng cuốn chiếu bảo vệ RAM."}))

    except Exception as e:
        log_action(f"❌ Lỗi nghiêm trọng xảy ra trong quá trình tính toán: {str(e)}")
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    generate_training_data()
