import os
import json
import requests
import pandas as pd
from bs4 import BeautifulSoup
from datetime import date, timedelta, datetime

FILE_TONG_HOP = 'xsmn_tong_hop_20_nam.csv'
FILE_BO_SUNG = 'xsmn_bosung.csv'

def crawl_missing_data():
    try:
        if os.path.exists(FILE_BO_SUNG):
            os.remove(FILE_BO_SUNG)
            print("🧹 Đã dọn dẹp trắng file bổ sung.")
            
        # --- 1. XÁC ĐỊNH THỜI GIAN THỰC TẾ THEO GIỜ VIỆT NAM (GMT+7) ---
        utc_now = datetime.utcnow()
        vn_now = utc_now + timedelta(hours=7)
        
        current_vn_hour = vn_now.hour
        current_vn_minute = vn_now.minute
        
        print(f"⏰ Thời gian hệ thống ghi nhận (Giờ VN): {vn_now.strftime('%d/%m/%Y %H:%M:%S')}")
        
        # Kiểm tra điều kiện mốc thời gian 23h40 tối
        is_after_23h40 = (current_vn_hour > 23) or (current_vn_hour == 23 and current_vn_minute >= 40)
        
        # --- 2. THIẾT LẬP CHIẾN LƯỢC MỐC NGÀY KẾT THÚC (END_DATE) ---
        if is_after_23h40:
            END_DATE = vn_now.date()
            print(f"🎯 Hệ thống chạy sau 23h40. Chiến lược: Quét dải dữ liệu đến hết ngày hôm nay ({END_DATE.strftime('%d/%m/%Y')}).")
        else:
            # Nếu chạy trước 23h40 (ví dụ buổi trưa), mốc ngày tối đa chỉ quét đến hết ngày hôm qua để tránh lặp ngày
            END_DATE = vn_now.date() - timedelta(days=1)
            print(f"⏳ Hệ thống chạy trước 23h40. Chiến lược: Chỉ quét dải dữ liệu đến hết ngày hôm qua ({END_DATE.strftime('%d/%m/%Y')}) để tránh lặp ngày.")

        # ĐÃ SỬA CHUẨN: Đồng bộ mốc dải quét 30 ngày qua biến mới
        START_DATE_30_DAYS = END_DATE - timedelta(days=30)
        print(f"📅 Khung ngày kiểm tra vá hổng dữ liệu: Từ {START_DATE_30_DAYS.strftime('%d/%m/%Y')} đến {END_DATE.strftime('%d/%m/%Y')}")

        # --- 3. PHÂN TÍCH DỮ LIỆU CŨ TRONG KHO CSV ---
        print("🔍 Đang phân tích dữ liệu cũ...")
        # ĐÃ SỬA CHUẨN: Thay thế START_DATE_10_DAYS thành START_DATE_30_DAYS
        expected_dates = set(START_DATE_30_DAYS + timedelta(days=x) for x in range((END_DATE - START_DATE_30_DAYS).days + 1))
        existing_dates = set()

        if os.path.exists(FILE_TONG_HOP) and os.path.getsize(FILE_TONG_HOP) > 0:
            df_existing = pd.read_csv(FILE_TONG_HOP, dtype=str)
            if 'Ngày' in df_existing.columns:
                existing_dates = set(pd.to_datetime(df_existing['Ngày'], format='%d/%m/%Y', errors='coerce').dropna().dt.date)

        # Định vị các ngày khuyết thiếu thực tế trong kho lưu trữ 20 năm
        missing_dates = sorted(list(expected_dates - existing_dates))
        
        if not missing_dates:
            print(json.dumps({
                "success": True, 
                "has_new_data": False, 
                "message": f"Dữ liệu trong 30 ngày trước ngày ({END_DATE.strftime('%d/%m/%Y')}) đã đầy đủ. Không cần bổ sung."
            }))
            return

        print(f"📡 Phát hiện thiếu dữ liệu của {len(missing_dates)} ngày. Tiến hành kết nối cào bổ sung...")
        
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
        du_lieu_bo_sung = []

        # --- 4. THỰC HIỆN CÀO QUÉT DỮ LIỆU ---
        for current_date in missing_dates:
            date_str = current_date.strftime('%d-%m-%Y')
            url = f"https://www.minhngoc.com.vn/ket-qua-xo-so/mien-nam/{date_str}.html"
            
            print(f"🌐 Đang kết nối tải dữ liệu ngày: {date_str}...")
            try:
                response = requests.get(url, headers=headers, timeout=10)
                if response.status_code != 200:
                    continue

                soup = BeautifulSoup(response.content, 'html.parser')
                box_kq_ngay_hien_tai = soup.find('table', class_='bkqmiennam') or soup.find('table', class_='box_kqmien')
                
                if not box_kq_ngay_hien_tai:
                    continue
                
                # CHỐNG GHI ĐÈ TRANG CHỜ/TRANG TRỐNG
                page_text = box_kq_ngay_hien_tai.get_text()
                if "đang được" in page_text.lower() or "chưa có" in page_text.lower() or "sắp" in page_text.lower():
                    continue

                # Xác thực chuỗi ngày trên giao diện HTML để chống chuyển hướng ngầm của trang xổ số
                target_slash = current_date.strftime('%d/%m/%Y')
                target_hyphen = current_date.strftime('%d-%m-%Y')
                title_text = box_kq_ngay_hien_tai.get_text()

                # Nếu bảng trả về không khớp với ngày đang quét, bỏ qua để tránh ghi đè dữ liệu rác
                if (target_slash not in title_text) and (target_hyphen not in title_text):
                    continue
                    
                bang_cac_tinh = box_kq_ngay_hien_tai.find_all('table', class_='rightcl')
                count_dai = 0
                
                for bang in bang_cac_tinh:
                    td_tinh = bang.find('td', class_='tinh')
                    if not td_tinh: continue
                    ten_dai = td_tinh.text.strip()
                    
                    if ten_dai == "TP. HCM" or ten_dai == "TP.HCM":
                        ten_dai = "Hồ Chí Minh"
                        
                    td_giai8 = bang.find('td', class_='giai8')
                    if not td_giai8: continue
                    so_giai8 = td_giai8.text.strip()
                    
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
                continue

        # --- 5. HÒA TRỘN VÀ SẮP XẾP LẠI DỮ LIỆU ---
        if du_lieu_bo_sung:
            df_temp = pd.DataFrame(du_lieu_bo_sung)
            
            file_exists = os.path.isfile(FILE_BO_SUNG)
            df_temp.to_csv(FILE_BO_SUNG, mode='a', index=False, header=not file_exists, encoding='utf-8-sig')
            
            if os.path.exists(FILE_TONG_HOP) and os.path.getsize(FILE_TONG_HOP) > 0:
                df_main = pd.read_csv(FILE_TONG_HOP, dtype=str)
                df_final = pd.concat([df_main, df_temp]).drop_duplicates(subset=['Ngày', 'Đài'], keep='last')
            else:
                df_final = df_temp
            
            df_final['Date_DT'] = pd.to_datetime(df_final['Ngày'], format='%d/%m/%Y', errors='coerce')
            df_final = df_final.sort_values(by=['Date_DT', 'Đài']).drop(columns=['Date_DT'])
            
            df_final = df_final[['Ngày', 'Đài', 'G.8']]
            df_final.to_csv(FILE_TONG_HOP, index=False, encoding='utf-8-sig')

            print(json.dumps({
                "success": True, 
                "has_new_data": True, 
                "message": f"Hệ thống phát hiện khuyết thiếu và đã vá thành công {len(du_lieu_bo_sung)} bản ghi mới."
            }))
        else:
            print(json.dumps({
                "success": True, 
                "has_new_data": False, 
                "message": "Không phát hiện lỗ hổng dữ liệu nào cần bổ sung trong dải ngày yêu cầu."
            }))
            
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    crawl_missing_data()
