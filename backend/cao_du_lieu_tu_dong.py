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
    try:
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(f"[{timestamp}] [PYTHON - cao_du_lieu] {message}\n")
        print(message, flush=True)
    except Exception as e:
        print(f"Lỗi ghi file log: {e}", flush=True)

def crawl_missing_data():
    log_action("============ KHỞI CHẠY KIỂM TRA ĐỘC LẬP ============")
    existing_dates = set()
    if os.path.exists(FILE_TONG_HOP):
        try:
            df_existing = pd.read_csv(FILE_TONG_HOP, names=['Ngày', 'Đài', 'G.8'], header=0)
            existing_dates = set(pd.to_datetime(df_existing["Ngày"], dayfirst=True, errors='coerce').dropna().dt.date)
        except Exception as e:
            log_action(f"⚠️ Không đọc được ngày từ file tổng hợp (Có thể do file rỗng): {e}")

    missing_dates = sorted(EXPECTED_DATES - existing_dates)
    
    # Nếu file CSV đang rỗng, ép buộc cào thử nghiệm ngày hôm nay và hôm qua để kiểm tra
    if not missing_dates:
        log_action("📝 Không thấy ngày thiếu trong 10 ngày qua, ép buộc cào thử nghiệm 2 ngày gần nhất...")
        missing_dates = [TODAY - timedelta(days=1), TODAY]

    log_action(f"📡 Danh sách ngày thực hiện quét: {[d.strftime('%d-%m-%Y') for d in missing_dates]}")

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    all_new_data = []

    for current_date in missing_dates:
        date_str = current_date.strftime("%d-%m-%Y")
        url = f"https://www.minhngoc.com.vn/ket-qua-xo-so/mien-nam/{date_str}.html"
        
        log_action(f"🌐 Đang kết nối: {url}")
        try:
            resp = requests.get(url, headers=headers, timeout=10)
            log_action(f"➔ Kết quả HTTP Status: {resp.status_code}")
            
            if resp.status_code != 200: 
                continue
            
            # 🔍 IN CHI TIẾT KẾT QUẢ MÃ NGUỒN HTML TÌM ĐƯỢC RA LOG FILE
            matches = re.findall(r'class="G8"[^>]*>(\d+)', resp.text)
            tieu_de_dai = re.findall(r'th_tai_dai"[^>]*>([^<]+)', resp.text)
            
            log_action(f"🔍 [KẾT QUẢ REGEX {date_str}] - Tìm thấy class='G8': {matches}")
            log_action(f"🔍 [KẾT QUẢ REGEX {date_str}] - Tìm thấy th_tai_dai: {tieu_de_dai}")

            if matches and tieu_de_dai:
                day_records = []
                for i, dai in enumerate(tieu_de_dai):
                    if i < len(matches):
                        record = {
                            "Ngày": date_str,
                            "Đài": dai.strip(),
                            "G.8": matches[i]
                        }
                        all_new_data.append(record)
                        day_records.append(f"{dai.strip()}:{matches[i]}")
                log_action(f"✅ Chi tiết G.8 trích xuất được: {', '.join(day_records)}")
            else:
                log_action(f"❌ Thất bại: Regex không khớp dữ liệu (Mã HTML trang đích có thể đã chặn bot hoặc rỗng)")
                
        except Exception as e:
            log_action(f"❌ Sự cố kết nối ngày {date_str}: {e}")

    if all_new_data:
        df_new = pd.DataFrame(all_new_data)
        if os.path.exists(FILE_TONG_HOP) and os.path.getsize(FILE_TONG_HOP) > 0:
            df_main = pd.read_csv(FILE_TONG_HOP, names=['Ngày', 'Đài', 'G.8'], header=0)
            df_final = pd.concat([df_main, df_new], ignore_index=True).drop_duplicates(subset=["Ngày", "Đài"], keep="last")
        else:
            df_final = df_new
        df_final.to_csv(FILE_TONG_HOP, index=False, encoding="utf-8-sig")
        log_action(f"🎉 Đã lưu trực tiếp {len(all_new_data)} dòng dữ liệu mới vào file CSV!")
    else:
        log_action("⚠️ Kết thúc chu kỳ thử nghiệm: Không có dữ liệu mới nào được lưu.")

if __name__ == "__main__":
    crawl_missing_data()
