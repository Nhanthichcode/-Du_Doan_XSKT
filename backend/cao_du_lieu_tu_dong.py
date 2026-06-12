import os
import json
import requests
import pandas as pd
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

FILE_TONG_HOP = "xsmn_tong_hop_20_nam.csv"
FILE_BO_SUNG = "xsmn_bosung.csv"

# Luôn lấy ngày theo giờ Việt Nam
VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
TODAY = datetime.now(VN_TZ).date()

# Chỉ kiểm tra 10 ngày gần nhất
EXPECTED_DATES = {
    TODAY - timedelta(days=i)
    for i in range(10)
}


def crawl_missing_data():
    try:
        print("🔍 Đang kiểm tra dữ liệu 10 ngày gần nhất...")

        existing_dates = set()

        # Đọc dữ liệu hiện có
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

        # Tìm các ngày còn thiếu
        missing_dates = sorted(EXPECTED_DATES - existing_dates)

        if not missing_dates:
            print(json.dumps({
                "success": True,
                "message": "Dữ liệu 10 ngày gần nhất đã đầy đủ."
            }))
            return

        print(
            f"📡 Phát hiện thiếu {len(missing_dates)} ngày: "
            f"{', '.join(d.strftime('%d-%m-%Y') for d in missing_dates)}"
        )

        headers = {
            "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }

        du_lieu_bo_sung = []

        # Chỉ crawl các ngày đang thiếu
        for current_date in missing_dates:

            date_str = current_date.strftime("%d-%m-%Y")

            url = (
                "https://www.minhngoc.com.vn/"
                f"ket-qua-xo-so/mien-nam/{date_str}.html"
            )

            print(f"🌐 Đang tải: {date_str}")

            try:
                response = requests.get(
                    url,
                    headers=headers,
                    timeout=15
                )

                if response.status_code != 200:
                    print(
                        f"⚠️ Không lấy được dữ liệu "
                        f"{date_str} (HTTP {response.status_code})"
                    )
                    continue

                soup = BeautifulSoup(
                    response.content,
                    "html.parser"
                )

                box_kq = soup.find(
                    "table",
                    class_="box_kqmien"
                )

                if not box_kq:
                    print(
                        f"⚠️ Không tìm thấy bảng kết quả "
                        f"{date_str}"
                    )
                    continue

                tieu_de_dai = [
                    th.get_text(strip=True)
                    for th in box_kq.find_all(
                        "th",
                        class_="th_tai_dai"
                    )
                ]

                if not tieu_de_dai:
                    continue

                rows = box_kq.find_all("tr")

                du_lieu_ngay = {
                    dai: {}
                    for dai in tieu_de_dai
                }

                for row in rows:
                    cols = row.find_all(["td", "th"])

                    if len(cols) <= 1:
                        continue

                    giai = cols[0].get_text(strip=True)

                    if giai not in [
                        "G.8",
                        "G.7",
                        "G.6",
                        "G.5",
                        "G.4",
                        "G.3",
                        "G.2",
                        "G.1",
                        "ĐB"
                    ]:
                        continue

                    for i, dai in enumerate(tieu_de_dai):
                        if i + 1 >= len(cols):
                            continue

                        so = (
                            cols[i + 1]
                            .get_text("\n", strip=True)
                            .replace("\n", " - ")
                        )

                        du_lieu_ngay[dai][giai] = so

                for dai, cac_giai in du_lieu_ngay.items():

                    row_data = {
                        "Ngày": date_str,
                        "Đài": dai
                    }

                    row_data.update(cac_giai)

                    du_lieu_bo_sung.append(row_data)

            except Exception as crawl_err:
                print(
                    f"❌ Lỗi khi crawl {date_str}: "
                    f"{crawl_err}"
                )

        # Không lấy được dữ liệu nào
        if not du_lieu_bo_sung:
            print(json.dumps({
                "success": False,
                "message": "Không lấy được dữ liệu mới."
            }))
            return

        # Ghi file bổ sung
        df_temp = pd.DataFrame(du_lieu_bo_sung)

        file_exists = os.path.isfile(FILE_BO_SUNG)

        df_temp.to_csv(
            FILE_BO_SUNG,
            mode="a",
            index=False,
            header=not file_exists,
            encoding="utf-8-sig"
        )

        # Gộp vào file tổng hợp
        if os.path.exists(FILE_TONG_HOP):

            df_main = pd.read_csv(FILE_TONG_HOP)

            df_final = (
                pd.concat(
                    [df_main, df_temp],
                    ignore_index=True
                )
                .drop_duplicates(
                    subset=["Ngày", "Đài"],
                    keep="last"
                )
            )

        else:
            df_final = df_temp

        df_final.to_csv(
            FILE_TONG_HOP,
            index=False,
            encoding="utf-8-sig"
        )

        print(json.dumps({
            "success": True,
            "message":
                f"Đã cập nhật {len(du_lieu_bo_sung)} bản ghi mới "
                f"từ {len(missing_dates)} ngày thiếu."
        }))

    except Exception as e:

        print(json.dumps({
            "success": False,
            "error": str(e)
        }))


if __name__ == "__main__":
    crawl_missing_data()