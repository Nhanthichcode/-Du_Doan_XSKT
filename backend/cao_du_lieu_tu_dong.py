import os
import json
import requests
import pandas as pd
from bs4 import BeautifulSoup
from datetime import date, timedelta

# Cấu hình chu kỳ 10 ngày gần nhất
END_DATE = date.today()
START_DATE_10_DAYS = END_DATE - timedelta(days=10)

FILE_TONG_HOP = 'xsmn_tong_hop_20_nam.csv'
FILE_BO_SUNG = 'xsmn_bosung.csv'

def crawl_missing_data():
    try:
        if os.path.exists(FILE_BO_SUNG):
            os.remove(FILE_BO_SUNG)
            print(f"🧹 Đã dọn dẹp trắng file {FILE_BO_SUNG} từ lần chạy trước.")
            
        print("🔍 Đang phân tích dữ liệu cũ...")
        expected_dates = set(START_DATE_10_DAYS + timedelta(days=x) for x in range((END_DATE - START_DATE_10_DAYS).days + 1))
        existing_dates = set()

        if os.path.exists(FILE_TONG_HOP) and os.path.getsize(FILE_TONG_HOP) > 0:
            # Ép kiểu string (str) để Pandas không tự động cắt mất số 0 ở đầu (như 06, 08)
            df_existing = pd.read_csv(FILE_TONG_HOP, dtype=str)
            if 'Ngày' in df_existing.columns:
                existing_dates = set(pd.to_datetime(df_existing['Ngày'], format='%d/%m/%Y', errors='coerce').dropna().dt.date)

        # Cào xuôi theo thời gian từ cũ tới mới để CSV luôn chuẩn thứ tự
        missing_dates = sorted(list(expected_dates - existing_dates))
        
        if not missing_dates:
            print(json.dumps({"success": True, "message": "Dữ liệu đã đầy đủ, không cần cào thêm."}))
            return

        print(f"📡 Phát hiện thiếu {len(missing_dates)} ngày. Tiến hành cào chính xác...")
        
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
        du_lieu_bo_sung = []

        for current_date in missing_dates:
            date_str = current_date.strftime('%d-%m-%Y')
            url = f"https://www.minhngoc.com.vn/ket-qua-xo-so/mien-nam/{date_str}.html"
            
            print(f"🌐 Đang kết nối ngày: {date_str}...")
            try:
                response = requests.get(url, headers=headers, timeout=10)
                if response.status_code != 200:
                    continue

                soup = BeautifulSoup(response.content, 'html.parser')
                
                # ❌ SỬA LỖI ÔM ĐỒM: Dùng find() thay vì find_all() để chỉ bóc ĐÚNG cái bảng đầu tiên
                box_kq_ngay_hien_tai = soup.find('table', class_='bkqmiennam') or soup.find('table', class_='box_kqmien')
                
                if not box_kq_ngay_hien_tai:
                    print("   ⚠️ Không tìm thấy bảng kết quả.")
                    continue
                    
                # Bây giờ mới tìm các tỉnh nằm TRONG bảng của ngày hôm đó
                bang_cac_tinh = box_kq_ngay_hien_tai.find_all('table', class_='rightcl')
                count_dai = 0
                
                for bang in bang_cac_tinh:
                    td_tinh = bang.find('td', class_='tinh')
                    if not td_tinh: continue
                    ten_dai = td_tinh.text.strip()
                    
                    # ❌ ĐỒNG BỘ TÊN ĐÀI: Chuyển TP. HCM thành Hồ Chí Minh để khớp lịch sử
                    if ten_dai == "TP. HCM":
                        ten_dai = "Hồ Chí Minh"
                        
                    td_giai8 = bang.find('td', class_='giai8')
                    if not td_giai8: continue
                    so_giai8 = td_giai8.text.strip()
                    
                    # ❌ SỬA LỖI MẤT SỐ 0: Trả lại số 0 cho các giải như '6', '8'
                    if len(so_giai8) == 1:
                        so_giai8 = '0' + so_giai8
                    
                    if ten_dai and so_giai8:
                        du_lieu_bo_sung.append({
                            'Ngày': current_date.strftime('%d/%m/%Y'),
                            'Đài': ten_dai,
                            'G.8': so_giai8
                        })
                        count_dai += 1
                        
                print(f"   ➔ Lấy thành công {count_dai} đài.")

            except Exception as e:
                print(f"⚠️ Lỗi khi cào ngày {date_str}: {str(e)}")
                continue

        # Ghi và SẮP XẾP LẠI DỮ LIỆU
        if du_lieu_bo_sung:
            df_temp = pd.DataFrame(du_lieu_bo_sung)
            
            # Ghi vào file bổ sung
            file_exists = os.path.isfile(FILE_BO_SUNG)
            df_temp.to_csv(FILE_BO_SUNG, mode='a', index=False, header=not file_exists, encoding='utf-8-sig')
            
            # Gộp vào file chính
            if os.path.exists(FILE_TONG_HOP) and os.path.getsize(FILE_TONG_HOP) > 0:
                df_main = pd.read_csv(FILE_TONG_HOP, dtype=str)
                df_final = pd.concat([df_main, df_temp]).drop_duplicates(subset=['Ngày', 'Đài'], keep='last')
            else:
                df_final = df_temp
            
            # ❌ SẮP XẾP CHUẨN XÁC: Ép thời gian và xếp tăng dần từ cũ -> mới
            df_final['Date_DT'] = pd.to_datetime(df_final['Ngày'], format='%d/%m/%Y', errors='coerce')
            df_final = df_final.sort_values(by=['Date_DT', 'Đài']).drop(columns=['Date_DT'])
            
            # Lưu lại
            df_final = df_final[['Ngày', 'Đài', 'G.8']]
            df_final.to_csv(FILE_TONG_HOP, index=False, encoding='utf-8-sig')

            print(json.dumps({"success": True, "has_new_data": True, "message": f"Đã cập nhật thêm {len(du_lieu_bo_sung)} bản ghi mới."}))
        else:
            # Nếu mảng du_lieu_bo_sung rỗng
            print(json.dumps({"success": True, "has_new_data": False, "message": "Không có dữ liệu mới nào được tìm thấy."}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    crawl_missing_data()