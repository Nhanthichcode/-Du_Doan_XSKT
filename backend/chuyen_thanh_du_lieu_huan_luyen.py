import pandas as pd
import re
import os
import json
from datetime import datetime

# 1. ĐỊNH NGHĨA ĐƯỜNG DẪN TUYỆT ĐỐI CHUẨN
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(BASE_DIR, 'system_log.txt')
INPUT_FILE = os.path.join(BASE_DIR, 'xsmn_tong_hop_20_nam.csv')
OUTPUT_FILE = os.path.join(BASE_DIR, 'data_training_ai.csv')

# 2. HÀM GHI LOG ĐỒNG BỘ VÀO SYSTEM_LOG.TXT
def log_action(message):
    timestamp = datetime.now().strftime('%d/%m/%Y %H:%M:%S')
    log_entry = f"[{timestamp}] [PYTHON - chuyen_du_lieu] {message}\n"
    try:
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(log_entry)
        print(log_entry.strip(), flush=True) # Ép Python phải in ra ngay lập tức, chống nghẽn bộ đệm log
    except:
        print(log_entry.strip(), flush=True)

def generate_training_data():
    try:
        log_action("🚀 Khởi chạy tiến trình trích xuất đặc trưng AI...")

        if not os.path.exists(input_file_path := INPUT_FILE):
            log_action("❌ Lỗi nghiêm trọng: Không tìm thấy tệp gốc xsmn_tong_hop_20_nam.csv")
            print(json.dumps({"success": False, "error": "Chưa có file dữ liệu gốc để xử lý."}))
            return

        log_action("📊 Đang nạp cơ sở dữ liệu CSV vào bộ nhớ...")
        df_raw = pd.read_csv(input_file_path)
        df_raw['Date_DT'] = pd.to_datetime(df_raw['Ngày'], dayfirst=True)
        df_raw['Thu'] = df_raw['Date_DT'].dt.dayofweek + 2

        # Hàm băm số chỉ tập trung vào giải 8 (G.8) theo đúng yêu cầu huấn luyện của bạn
        def get_day_lotos(row):
            val = str(row.get('G.8', '')).split('.')[0]
            nums = re.findall(r'\d{2,}', val)
            return [n[-2:] for n in nums]

        all_training_data = []
        grouped = list(df_raw.groupby('Đài'))
        total_groups = len(grouped)
        
        log_action(f"📂 Tổng hợp phát hiện {total_groups} đài cần phân tích chu kỳ lịch sử.")

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

            # Mẹo tối ưu hóa: Dùng cấu trúc bảng ánh xạ (Dictionary) để lưu vị trí xuất hiện cuối cùng
            # Loại bỏ hoàn toàn vòng lặp tìm Gap lùi về quá khứ giúp tăng tốc độ xử lý vượt bậc
            last_seen = {f"{n:02d}": -1 for n in range(100)}
            
            # Khởi tạo trạng thái ban đầu cho 30 kỳ đầu tiên
            for i in range(start_idx):
                for num in draws[i]:
                    last_seen[num] = i

            # Bắt đầu quét từ kỳ thứ 30 trở đi để trích xuất đặc trưng
            for i in range(start_idx, total_rows_in_group):
                # In log tiến độ ngầm mỗi khi hoàn thành 200 kỳ quay để tránh làm ngợp file log
                if i % 200 == 0:
                    percentage = round((i / total_rows_in_group) * 100, 1)
                    log_action(f"   ↳ Tiến độ đài {dai}: {i}/{total_rows_in_group} kỳ ({percentage}%)")

                history_5 = draws[i-5:i]
                flat_5 = [item for sublist in history_5 for item in sublist]
                h5 = [s[0] for s in flat_5] if flat_5 else []
                t5 = [s[1] for s in flat_5] if flat_5 else []
                
                # Quét nhanh 100 cặp số bằng mảng phân tích chu kỳ
                for n in range(100):
                    s_num = f"{n:02d}"
                    
                    # Tính toán Gap siêu tốc dựa trên bảng ánh xạ vị trí
                    if last_seen[s_num] == -1:
                        gap = i
                    else:
                        gap = i - 1 - last_seen[s_num]
                        
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
                
                # Cập nhật lại vị trí xuất hiện mới nhất của các con số sau khi kỳ quay hoàn tất
                for num in draws[i]:
                    last_seen[num] = i

        log_action(f"💾 Tiến trình tính toán hoàn tất. Đang ghi dữ liệu học máy vào tệp: {OUTPUT_FILE}")
        df_ml = pd.DataFrame(all_training_data)
        df_ml.to_csv(OUTPUT_FILE, index=False)
        
        log_action(f"✅ Thành công! Đã kết xuất tổng cộng {len(df_ml)} dòng đặc trưng sang dữ liệu huấn luyện.")
        print(json.dumps({"success": True, "message": f"Đã tạo {len(df_ml)} dòng dữ liệu huấn luyện."}))

    except Exception as e:
        log_action(f"❌ Lỗi nghiêm trọng xảy ra trong quá trình tính toán: {str(e)}")
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    generate_training_data()