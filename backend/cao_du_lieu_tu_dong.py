import os
import json
import requests
import pandas as pd
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

# 1. ĐỊNH NGHĨA ĐƯỜNG DẪN TUYỆT ĐỐI CHUẨN TRÁNH LỖI MÔI TRƯỜNG RENDER
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(BASE_DIR, 'system_log.txt')
FILE_TONG_HOP = os.path.join(BASE_DIR, 'xsmn_tong_hop_20_nam.csv')
FILE_BO_SUNG = os.path.join(BASE_DIR, 'xsmn_bosung.csv')

# Luôn lấy ngày theo giờ Việt Nam để đồng bộ lịch quay thưởng
VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
TODAY = datetime.now(VN_TZ).date()

# Chỉ kiểm tra dữ liệu trong vòng 10 ngày gần nhất
EXPECTED_DATES = {
    TODAY - timedelta(days=i)
    for i in range(10)
}

# 2. HÀM GHI LOG LIVE ĐỒNG BỘ VÀO SYSTEM_LOG.TXT
def log_action(message):
    timestamp = datetime.now().strftime('%d/%m/%Y %H:%M:%S')
    log_entry = f"[{timestamp}] [PYTHON - cao_du_lieu] {message}\n"
    try:
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(log_entry)
        print(log_entry.strip(), flush=True) # Ép đẩy dữ liệu lập tức lên màn hình logs live
    except:
        print(log_entry.strip(), flush=True)

def crawl_missing_data():
    try:
        log_action("🚀 Bắt đầu tiến trình kiểm tra và quét dữ liệu xổ số thiếu...")
        existing_dates = set()

        # Đọc dữ liệu lịch sử hiện có để tìm lỗ hổng ngày thiếu
        if os.path.exists(FILE_TONG_HOP):
            df_existing = pd.read_csv(FILE_TONG_HOP)

            if "Ngày" in df_existing.columns:
                existing_dates = set(
                    pd.to_datetime(
                        df_existing["Ngày"],
                        dayfirst=True,
                        errors="coerce"
                    )
                    .dropna()
                    .dt.date
                )
        else:
            log_action("⚠️ Cảnh báo: Không tìm thấy file csv gốc, hệ thống sẽ tự khởi tạo mới.")

        # Tìm các ngày còn thiếu bằng phương pháp trừ tập hợp
        missing_dates = sorted(EXPECTED_DATES - existing_dates)

        if not missing_dates:
            log_action("✅ Dữ liệu lịch sử 10 ngày gần nhất đã hoàn toàn đầy đủ. Không cần cào thêm.")
            print(json.dumps({
                "success": True,
                "message": "Dữ liệu 10 ngày gần nhất đã đầy đủ."
            }))
            return

        log_action(f"📡 Phát hiện hệ thống đang bị hổng {len(missing_dates)} ngày: {', '.join(d.strftime('%d-%m-%Y') for d in missing_dates)}")

        # Thiết lập Header giả lập trình duyệt chuẩn để giảm thiểu bị Cloudflare chặn
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7"
        }

        tong_so_ban_ghi_da_luu = 0

        # Tiến hành cào cuốn chiếu từng ngày còn thiếu
        for current_date in missing_dates:
            date_str = current_date.strftime("%d-%m-%Y")
            url = f"https://www.minhngoc.com.vn/ket-qua-xo-so/mien-nam/{date_str}.html"

            log_action(f"🌐 Đang gửi request kết nối cổng dữ liệu ngày: {date_str}...")

            try:
                response = requests.get(url, headers=headers, timeout=15)

                if response.status_code != 200:
                    log_action(f"⚠️ Từ chối kết nối ngày {date_str} (Mã lỗi HTTP: {response.status_code})")
                    continue

                soup = BeautifulSoup(response.content, "html.parser")

                # --- BẮT ĐẦU KHỐI IN LOG DEBUG CHI TIẾT ---
                html_snippet = response.text[:500].replace('\n', ' ').strip()
                log_action(f"🔍 [DEBUG HTML] 500 ký tự đầu tiên của trang: {html_snippet}")
                
                # Quét xem trên trang có tồn tại những Class bảng nào
                all_tables = soup.find_all("table")
                table_classes = [str(t.get('class', 'Không có class')) for t in all_tables]
                log_action(f"🔍 [DEBUG TABLE] Tìm thấy {len(all_tables)} thẻ table trên trang. Danh sách class tìm được: {table_classes}")
                # --- KẾT THÚC KHỐI LOG DEBUG ---

                # Tiến hành tìm bảng dữ liệu theo các class nhận diện
                box_kq = soup.find("table", class_="box_kqmien") or soup.find("table", class_="bkqmiennam")

                if not box_kq:
                    for table in all_tables:
                        if table.find("th", class_="th_tai_dai"):
                            box_kq = table
                            break

                if not box_kq:
                    log_action(f"⚠️ Không bóc tách được bảng kết quả cho ngày {date_str}. Tiến hành xuất file HTML lỗi để kiểm tra...")
                    debug_file = os.path.join(BASE_DIR, f"debug_error_{date_str}.html")
                    with open(debug_file, "w", encoding="utf-8") as f_err:
                        f_err.write(response.text)
                    log_action(f"💾 Đã lưu file HTML lỗi thực tế tại: {debug_file}. Bạn hãy kiểm tra file này hoặc push về local để xem nội dung!")
                    continue

                tieu_de_dai = [
                    th.get_text(strip=True)
                    for th in box_kq.find_all("th", class_="th_tai_dai")
                ]

                if not tieu_de_dai:
                    log_action(f"⚠️ Không bóc tách được danh sách tên đài mở thưởng ngày {date_str}")
                    continue

                log_action(f"📊 Phát hiện {len(tieu_de_dai)} đài quay thưởng ngày {date_str}: {', '.join(tieu_de_dai)}")

                rows = box_kq.find_all("tr")
                du_lieu_ngay = {dai: {} for dai in tieu_de_dai}

                for row in rows:
                    cols = row.find_all(["td", "th"])
                    if len(cols) <= 1:
                        continue

                    giai = cols[0].get_text(strip=True)
                    if giai not in ["G.8", "G.7", "G.6", "G.5", "G.4", "G.3", "G.2", "G.1", "ĐB"]:
                        continue

                    for i, dai in enumerate(tieu_de_dai):
                        if i + 1 >= len(cols):
                            continue

                        so = cols[i + 1].get_text("\n", strip=True).replace("\n", " - ")
                        du_lieu_ngay[dai][giai] = so

                du_lieu_ngay_bo_sung = []
                for dai, cac_giai in du_lieu_ngay.items():
                    row_data = {
                        "Ngày": date_str,
                        "Đài": dai
                    }
                    row_data.update(cac_giai)
                    du_lieu_ngay_bo_sung.append(row_data)

                if du_lieu_ngay_bo_sung:
                    df_temp = pd.DataFrame(du_lieu_ngay_bo_sung)
                    file_exists = os.path.isfile(FILE_BO_SUNG)

                    df_temp.to_csv(
                        FILE_BO_SUNG,
                        mode="a",
                        index=False,
                        header=not file_exists,
                        encoding="utf-8-sig"
                    )

                    if os.path.exists(FILE_TONG_HOP):
                        df_main = pd.read_csv(FILE_TONG_HOP)
                        df_final = pd.concat([df_main, df_temp], ignore_index=True).drop_duplicates(
                            subset=["Ngày", "Đài"],
                            keep="last"
                        )
                    else:
                        df_final = df_temp

                    df_final.to_csv(
                        FILE_TONG_HOP,
                        index=False,
                        encoding="utf-8-sig"
                    )

                    tong_so_ban_ghi_da_luu += len(du_lieu_ngay_bo_sung)
                    log_action(f"💾 [CUỐN CHIẾU] Đã gộp thành công dữ liệu ngày {date_str} vào tệp {FILE_TONG_HOP}")

            except Exception as crawl_err:
                log_action(f"❌ Xảy ra sự cố lỗi mạng hoặc cấu trúc khi quét ngày {date_str}: {str(crawl_err)}")

        if tong_so_ban_ghi_da_luu == 0:
            log_action("❌ Tiến trình kết thúc: Không tích hợp được thêm bất kỳ dòng dữ liệu mới nào cho chu kỳ này.")
            print(json.dumps({
                "success": False,
                "message": "Không lấy được dữ liệu mới."
            }))
            return

        log_action(f"🎉 Hoàn tất chu kỳ cào! Tổng cộng đã bổ sung vĩnh viễn {tong_so_ban_ghi_da_luu} bản ghi mới.")
        print(json.dumps({
            "success": True,
            "message": f"Đã cập nhật hoàn tất {tong_so_ban_ghi_da_luu} bản ghi mới lên hệ thống."
        }))

    except Exception as e:
        log_action(f"❌ Lỗi hệ thống nghiêm trọng tại tiến trình cào: {str(e)}")
        print(json.dumps({
            "success": False,
            "error": str(e)
        }))

if __name__ == "__main__":
    crawl_missing_data()
