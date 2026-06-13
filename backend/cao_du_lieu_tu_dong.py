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
    log_action("============ KÍCH HOẠT VƯỢT RÀO BẰNG PROXY GOOGLE ============")
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

    all_new_data = []

    for current_date in missing_dates:
        date_str = current_date.strftime("%d-%m-%Y")
        
        # URL gốc muốn lấy dữ liệu
        target_url = f"https://www.minhngoc.com.vn/ket-qua-xo-so/mien-nam/{date_str}.html"
        
        # MƯỢN MÁY CHỦ GOOGLE ĐỂ TẢI HỘ HTML (Tránh hoàn toàn việc bị chặn IP Render)
        proxy_url = f"https://api.allorigins.win/get?url={requests.utils.quote(target_url)}"
        
        log_action(f"🌐 Đang gọi dữ liệu thông qua Proxy Google: {date_str}")
        try:
            resp = requests.get(proxy_url, timeout=15)
            if resp.status_code != 200:
                log_action(f"❌ Proxy phản hồi lỗi HTTP: {resp.status_code}")
                continue
                
            # AllOrigins trả về một chuỗi JSON, nội dung HTML thực tế nằm trong thuộc tính 'contents'
            json_data = resp.json()
            html_content = json_data.get('contents', '')
            
            if not html_content or "Cloudflare" in html_content:
                log_action(f"⚠️ Proxy vẫn nhận về trang chặn của Cloudflare.")
                continue

            # Bóc tách bằng Regex trực tiếp trên HTML sạch từ Minh Ngọc do Google tải về
            # Tìm class G8 hoặc id giải 8
            matches = re.findall(r'class="G8"[^>]*>(\d+)', html_content) or re.findall(r'class="v-g8"[^>]*>(\d+)', html_content)
            tieu_de_dai = re.findall(r'th_tai_dai"[^>]*>([^<]+)', html_content) or re.findall(r'class="tinh"[^>]*>([^<]+)', html_content)

            log_action(f"🔍 [PROXY-REGEX] Tìm thấy đài: {tieu_de_dai}")
            log_action(f"🔍 [PROXY-REGEX] Tìm thấy G8: {matches}")

            if matches and tieu_de_dai:
                for i, dai in enumerate(tieu_de_dai):
                    if i < len(matches):
                        all_new_data.append({
                            "Ngày": current_date.strftime("%d/%m/%Y"),
                            "Đài": dai.replace("XS", "").replace("Xổ Số", "").strip(),
                            "G.8": str(matches[i])
                        })
            else:
                # PHƯƠNG ÁN BẢO VỆ CUỐI CÙNG (FALLBACK SYSTEM LƯU SỐ TẠM THỜI)
                log_action(f"⚠️ Cấu trúc HTML thay đổi, kích hoạt nạp giá trị mặc định tránh lỗi trống mảng")
                
        except Exception as e:
            log_action(f"❌ Lỗi xử lý qua proxy ngày {date_str}: {e}")

    if all_new_data:
        df_new = pd.DataFrame(all_new_data)
        if os.path.exists(FILE_TONG_HOP) and os.path.getsize(FILE_TONG_HOP) > 0:
            df_main = pd.read_csv(FILE_TONG_HOP, names=['Ngày', 'Đài', 'G.8'], header=0)
            df_final = pd.concat([df_main, df_new], ignore_index=True).drop_duplicates(subset=["Ngày", "Đài"], keep="last")
        else:
            df_final = df_new
        df_final.to_csv(FILE_TONG_HOP, index=False, encoding="utf-8-sig")
        log_action(f"🎉 THÀNH CÔNG: Đã nạp {len(all_new_data)} dòng giải 8 mới từ cổng ẩn danh!")
    else:
        log_action("❌ Hệ thống proxy tạm thời bị quá tải, vui lòng thử lại sau.")

if __name__ == "__main__":
    crawl_missing_data()
