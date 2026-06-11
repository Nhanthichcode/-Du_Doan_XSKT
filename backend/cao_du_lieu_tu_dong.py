import os
import re
import json
import requests
import pandas as pd
from bs4 import BeautifulSoup
from datetime import date, timedelta

START_DATE = date(2006, 5, 1)
END_DATE = date.today()
FILE_TONG_HOP = 'xsmn_tong_hop_20_nam.csv'
FILE_BO_SUNG = 'xsmn_bosung.csv'

def crawl_missing_data():
    try:
        print("🔍 Đang phân tích dữ liệu cũ...")
        expected_dates = set(START_DATE + timedelta(days=x) for x in range((END_DATE - START_DATE).days + 1))
        existing_dates = set()

        if os.path.exists(FILE_TONG_HOP):
            df_existing = pd.read_csv(FILE_TONG_HOP)
            if 'Ngày' in df_existing.columns:
                existing_dates = set(pd.to_datetime(df_existing['Ngày'], dayfirst=True).dt.date)

        missing_dates = sorted(list(expected_dates - existing_dates))
        if not missing_dates:
            print(json.dumps({"success": True, "message": "Dữ liệu đã đầy đủ đến hôm nay, không cần cào thêm."}))
            return

        print(f"📡 Phát hiện thiếu {len(missing_dates)} ngày. Bắt đầu cào dữ liệu mới...")
        
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        du_lieu_bo_sung = []

        # Chỉ cào tối đa 5 ngày gần nhất mỗi lần chạy tự động để tránh bị chặn IP
        for current_date in missing_dates[:5]:
            date_str = current_date.strftime('%d-%m-%Y')
            url = f"https://www.minhngoc.com.vn/ket-qua-xo-so/mien-nam/{date_str}.html"
            
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code != 200:
                continue

            soup = BeautifulSoup(response.content, 'html.parser')
            box_kq = soup.find('table', class_='box_kqmien')
            if not box_kq:
                continue

            tieu_de_dai = [th.text.strip() for th in box_kq.find_all('th', class_='th_tai_dai')]
            rows = box_kq.find_all('tr')
            
            du_lieu_ngay = {dai: {} for dai in tieu_de_dai}
            
            for row in rows:
                cols = row.find_all(['td', 'th'])
                if len(cols) > 1:
                    giai = cols[0].text.strip()
                    if giai in ['G.8', 'G.7', 'G.6', 'G.5', 'G.4', 'G.3', 'G.2', 'G.1', 'ĐB']:
                        for i, dai in enumerate(tieu_de_dai):
                            if i + 1 < len(cols):
                                so = cols[i+1].text.strip().replace('\n', ' - ')
                                du_lieu_ngay[dai][giai] = so

            for dai, cac_giai in du_lieu_ngay.items():
                row_data = {'Ngày': date_str, 'Đài': dai}
                row_data.update(cac_giai)
                du_lieu_bo_sung.append(row_data)

        if du_lieu_bo_sung:
            df_temp = pd.DataFrame(du_lieu_bo_sung)
            file_exists = os.path.isfile(FILE_BO_SUNG)
            df_temp.to_csv(FILE_BO_SUNG, mode='a', index=False, header=not file_exists, encoding='utf-8-sig')
            
            # Gộp trực tiếp file bổ sung vào file tổng hợp chính
            if os.path.exists(FILE_TONG_HOP):
                df_main = pd.read_csv(FILE_TONG_HOP)
                df_final = pd.concat([df_main, df_temp]).drop_duplicates(subset=['Ngày', 'Đài'])
            else:
                df_final = df_temp
            df_final.to_csv(FILE_TONG_HOP, index=False, encoding='utf-8-sig')

        print(json.dumps({"success": True, "message": f"Đã cập nhật thêm {len(du_lieu_bo_sung)} bản ghi mới."}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    crawl_missing_data()