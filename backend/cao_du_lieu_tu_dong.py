import os
import json
import requests
import pandas as pd
import re
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FILE_TONG_HOP = os.path.join(BASE_DIR, 'xsmn_tong_hop_20_nam.csv')
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
    log_action("============ KÍCH HOẠT NGUỒN DỰ PHÒNG TOÀN DIỆN (ĐẠI PHÁT) ============")
    existing_dates = set()
    if os.path.exists(FILE_TONG_HOP):
        try:
            df_existing = pd.read_csv(FILE_TONG_HOP, names=['Ngày', 'Đài', 'G.8'], header=0)
            existing_dates = set(pd.to_datetime(df_existing["Ngày"], dayfirst=True, errors='coerce').dropna().dt.date)
        except:
            pass

    missing_dates = sorted(EXPECTED_DATES - existing_dates)
    if not missing_dates:
        log_action("📝 Không thiếu ngày nào trong chu kỳ 10 ngày.")
        return

    # Sử dụng Header chuẩn sạch để tránh bị chặn
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    all_new_data = []

    for current_date in missing_dates:
        date_str = current_date.strftime("%d-%m-%Y")
        
        # CHUYỂN SANG NGUỒN DỰ PHÒNG XOSODAIPHAT
        url = f"https://xosodaiphat.com/xsmn-{date_str}.html"
        
        log_action(f"🌐 Đang cào nguồn dự phòng: {url}")
        try:
            resp = requests.get(url, headers=headers, timeout=10)
            if resp.status_code != 200:
                log_action(f"❌ Nguồn dự phòng phản hồi HTTP: {resp.status_code}")
                continue
            
            # Cấu trúc Đại Phát cực kỳ sạch, giải 8 nằm trong thẻ có class="g8" hoặc id rõ ràng
            # Bóc tách tên đài mở thưởng
            tieu_de_dai = re.findall(r'class="tinh"[^>]*>([^<]+)', resp.text)
            if not tieu_de_dai:
                tieu_de_dai = re.findall(r'title="Xổ số([^"]+)" class="title-provice"', resp.text)
            
            # Bóc tách số giải 8 (đặc trưng chứa chuỗi số 2 chữ số trong class="prize-8")
            matches = re.findall(r'class="v-g8[^>]*>(\d+)', resp.text) or re.findall(r'class="txt-g8"[^>]*>(\d+)', resp.text)
            
            # Quét bao vây dự phòng nếu cấu trúc class thay đổi
            if not matches:
                matches = re.findall(r'<td[^>]*class="[^"]*g8[^"]*"[^>]*>(\d+)', resp.text)

            log_action(f"🔍 [DỰ PHÒNG] Tìm thấy đài: {tieu_de_dai}")
            log_action(f"🔍 [DỰ PHÒNG] Tìm thấy G8: {matches}")

            if matches and tieu_de_dai:
                for i, dai in enumerate(tieu_de_dai):
                    if i < len(matches):
                        # Chuẩn hóa tên đài về dạng chữ gọn để khớp biểu đồ của bạn
                        ten_dai_sach = dai.replace("Xổ Số", "").replace("XS", "").strip()
                        all_new_data.append({
                            "Ngày": current_date.strftime("%d/%m/%Y"),
                            "Đài": ten_dai_sach,
                            "G.8": str(matches[i])
                        })
            else:
                log_action(f"⚠️ Không khớp được dữ liệu Regex tại nguồn dự phòng ngày {date_str}")
                
        except Exception as e:
            log_action(f"❌ Lỗi kết nối nguồn dự phòng: {e}")

    if all_new_data:
        df_new = pd.DataFrame(all_new_data)
        if os.path.exists(FILE_TONG_HOP) and os.path.getsize(FILE_TONG_HOP) > 0:
            df_main = pd.read_csv(FILE_TONG_HOP, names=['Ngày', 'Đài', 'G.8'], header=0)
            df_final = pd.concat([df_main, df_new], ignore_index=True).drop_duplicates(subset=["Ngày", "Đài"], keep="last")
        else:
            df_final = df_new
        df_final.to_csv(FILE_TONG_HOP, index=False, encoding="utf-8-sig")
        log_action(f"🎉 KHÔI PHỤC THÀNH CÔNG: Đã nạp {len(all_new_data)} dòng dữ liệu từ nguồn dự phòng vào CSV!")
    else:
        log_action("❌ Tất cả các nguồn đều thất bại do lỗi hệ thống mạng bên ngoài.")

if __name__ == "__main__":
    crawl_missing_data()
