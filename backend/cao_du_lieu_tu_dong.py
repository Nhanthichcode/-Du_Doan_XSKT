import os
import json
import requests
import pandas as pd
import re
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FILE_TONG_HOP = os.path.join(BASE_DIR, 'xsmn_tong_hop_20_nam.csv')
FILE_BO_SUNG = os.path.join(BASE_DIR, 'xsmn_bosung.csv')
LOG_FILE = os.path.join(BASE_DIR, 'system_log.txt')

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
TODAY = datetime.now(VN_TZ).date()
EXPECTED_DATES = {TODAY - timedelta(days=i) for i in range(10)}

def log_action(message):
    timestamp = datetime.now().strftime('%d/%m/%Y %H:%M:%S')
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(f"[{timestamp}] [PYTHON - cao_du_lieu] {message}\n")
    print(message, flush=True)

def crawl_missing_data():
    existing_dates = set()
    if os.path.exists(FILE_TONG_HOP):
        df_existing = pd.read_csv(FILE_TONG_HOP)
        existing_dates = set(pd.to_datetime(df_existing["Ngày"], dayfirst=True).dropna().dt.date)

    missing_dates = sorted(EXPECTED_DATES - existing_dates)
    if not missing_dates: return

    headers = {"User-Agent": "Mozilla/5.0"}
    all_new_data = []

    for current_date in missing_dates:
        date_str = current_date.strftime("%d-%m-%Y")
        url = f"https://www.minhngoc.com.vn/ket-qua-xo-so/mien-nam/{date_str}.html"
        
        try:
            resp = requests.get(url, headers=headers, timeout=10)
            if resp.status_code != 200: continue
            
            # QUÉT TRỰC TIẾP GIẢI 8 BẰNG REGEX
            # Cấu trúc Minh Ngọc thường để G.8 trong thẻ có class "G8" hoặc ngay sau chữ "G.8"
            # Regex này tìm nội dung nằm trong ô (td) của giải 8 cho từng đài
            # Ví dụ: <td class="G8">12345</td>
            matches = re.findall(r'class="G8"[^>]*>(\d+)', resp.text)
            
            # Lấy danh sách tên đài (thường nằm trong thẻ th có class="th_tai_dai")
            tieu_de_dai = re.findall(r'th_tai_dai"[^>]*>([^<]+)', resp.text)
            
            if matches and tieu_de_dai:
                # Minh Ngọc liệt kê đài theo thứ tự, giải 8 cũng theo thứ tự đó
                for i, dai in enumerate(tieu_de_dai):
                    if i < len(matches):
                        all_new_data.append({
                            "Ngày": date_str,
                            "Đài": dai.strip(),
                            "G.8": matches[i]
                        })
                log_action(f"✅ Đã cào G.8 ngày {date_str}: {len(matches)} đài.")
        except Exception as e:
            log_action(f"❌ Lỗi ngày {date_str}: {e}")

    if all_new_data:
        df_new = pd.DataFrame(all_new_data)
        # Ghi đè hoặc gộp vào file chính
        if os.path.exists(FILE_TONG_HOP):
            df_main = pd.read_csv(FILE_TONG_HOP)
            df_final = pd.concat([df_main, df_new], ignore_index=True).drop_duplicates(subset=["Ngày", "Đài"], keep="last")
        else:
            df_final = df_new
        df_final.to_csv(FILE_TONG_HOP, index=False, encoding="utf-8-sig")
        log_action("🎉 Cập nhật thành công G.8 vào file tổng hợp!")

if __name__ == "__main__":
    crawl_missing_data()
