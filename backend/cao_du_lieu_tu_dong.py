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

# Danh sách chuẩn tên 21 đài Miền Nam để quét Text trực tiếp
MỞ_THƯỞNG_XSMN = [
    "TP.HCM", "Hồ Chí Minh", "Đồng Tháp", "Cà Mau", "Bến Tre", "Vũng Tàu", "Bạc Liêu",
    "Đồng Nai", "Cần Thơ", "Sóc Trăng", "Tây Ninh", "An Giang", "Bình Thuận",
    "Vĩnh Long", "Bình Dương", "Trà Vinh", "Long An", "Bình Phước", "Hậu Giang",
    "Tiền Giang", "Kiên Giang", "Đà Lạt"
]

def log_action(message):
    timestamp = datetime.now().strftime('%d/%m/%Y %H:%M:%S')
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(f"[{timestamp}] [PYTHON - cao_du_lieu] {message}\n")
    print(message, flush=True)

def crawl_missing_data():
    log_action("============ KÍCH HOẠT QUÉT PLAIN-TEXT ĐẠI PHÁT ============")
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

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    all_new_data = []

    for current_date in missing_dates:
        date_str = current_date.strftime("%d-%m-%Y")
        url = f"https://xosodaiphat.com/xsmn-{date_str}.html"
        
        log_action(f"🌐 Đang quét Text từ: {url}")
        try:
            resp = requests.get(url, headers=headers, timeout=10)
            if resp.status_code != 200: continue
            
            # Làm sạch mã HTML, xóa khoảng trắng thừa để đưa về chuỗi text liên tục
            html_clean = re.sub(r'\s+', ' ', resp.text)
            
            # Tìm kiếm khối chứa bảng kết quả của từng tỉnh mở thưởng trong ngày
            # Cấu trúc chung của các trang xổ số luôn là: [Tên Tỉnh] ... [Giải 8] ... [Số trúng]
            day_data = []
            
            for tinh in MỞ_THƯỞNG_XSMN:
                # Nếu tìm thấy tên tỉnh xuất hiện trong mã nguồn
                if tinh in html_clean:
                    # Cắt một đoạn text ngắn dài 1500 ký tự ngay sau tên tỉnh đó để dò riêng giải 8 của đài này
                    tinh_pos = html_clean.find(tinh)
                    sub_text = html_clean[tinh_pos:tinh_pos+1500]
                    
                    # Giải 8 là giải đầu tiên xuất hiện hoặc nằm gần nhất với từ khóa prize-8 / v-g8 / g8
                    # Tìm cụm số có đúng 2 chữ số nằm trong thẻ chứa thông tin giải 8
                    g8_match = re.search(r'(?:g8|prize-8|v-g8)[^>]*>.*?(\d{2})</', sub_text, re.IGNORECASE)
                    
                    # Phương án quét phụ: nếu không thấy class, bốc thẳng cụm 2 số đầu tiên nằm trong thẻ td/span sau chữ Giải 8
                    if not g8_match:
                        g8_match = re.search(r'(?:Giải 8|G8).*?>.*?(\d{2})</', sub_text, re.IGNORECASE)
                        
                    if g8_match:
                        so_g8 = g8_match.group(1)
                        # Chuẩn hóa tên đài HCM về đúng định dạng gốc của bạn
                        ten_dai = "Hồ Chí Minh" if tinh in ["TP.HCM", "Hồ Chí Minh"] else tinh
                        
                        day_data.append({
                            "Ngày": current_date.strftime("%d/%m/%Y"),
                            "Đài": ten_dai,
                            "G.8": so_g8
                        })
            
            if day_data:
                log_action(f"✅ Ngày {date_str} bóc trần được {len(day_data)} đài: {[x['Đài']+':'+x['G.8'] for x in day_data]}")
                all_new_data.extend(day_data)
            else:
                log_action(f"⚠️ Không tìm thấy từ khóa xổ số hợp lệ cho ngày {date_str}")
                
        except Exception as e:
            log_action(f"❌ Lỗi xử lý text ngày {date_str}: {e}")

    if all_new_data:
        df_new = pd.DataFrame(all_new_data)
        if os.path.exists(FILE_TONG_HOP) and os.path.getsize(FILE_TONG_HOP) > 0:
            df_main = pd.read_csv(FILE_TONG_HOP, names=['Ngày', 'Đài', 'G.8'], header=0)
            df_final = pd.concat([df_main, df_new], ignore_index=True).drop_duplicates(subset=["Ngày", "Đài"], keep="last")
        else:
            df_final = df_new
        df_final.to_csv(FILE_TONG_HOP, index=False, encoding="utf-8-sig")
        log_action(f"🎉 HOÀN THÀNH: Đã ép nạp {len(all_new_data)} dòng dữ liệu giải 8 mới vào CSV!")
    else:
        log_action("❌ Thất bại hoàn toàn: Phương pháp bóc tách chuỗi text trần vẫn không tìm thấy kết quả.")

if __name__ == "__main__":
    crawl_missing_data()
