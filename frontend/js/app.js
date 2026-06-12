 // Bảng màu cho các đường Line đồ thị đài
        const paletteColors = [
            '#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b'
        ];

        let historyChart = null;
        let currentTimelineX = []; // Lưu trữ trục X hiện hành để phục vụ thanh kéo

        // KHỞI TẠO THANH KÉO CHO DANH SÁCH ĐỐI CHIẾU LỊCH SỬ KỲ TRƯỚC (ĐỒNG BỘ 2 CHIỀU)
        function initBacktestSlider(dates) {
            const wrapper = document.getElementById('backtest-slider-wrapper');
            const slider = document.getElementById('backtest-slider');
            const label = document.getElementById('backtest-slider-label');
            const container = document.getElementById('backtest-list-container');
            const listDiv = document.getElementById('backtest-list');

            if (!dates || dates.length <= 1) {
                wrapper.style.display = 'none';
                return;
            }

            wrapper.style.display = 'block';
            slider.min = 0;
            slider.max = dates.length - 1;
            slider.value = 0; // Mặc định ở kỳ đầu tiên
            
            label.innerText = `Kỳ ngày: ${dates[0]}`;

            let isDragging = false;

            // Khi người dùng kéo thanh trượt (Kéo sang phải/trái để cuộn danh sách)
            slider.addEventListener('input', (e) => {
                isDragging = true;
                const idx = parseInt(e.target.value);
                const targetDate = dates[idx];
                label.innerText = `Kỳ ngày: ${targetDate}`;

                // Tìm thẻ card đầu tiên thuộc ngày này và cuộn danh sách tới vị trí đó
                const targetCard = listDiv.querySelector(`[data-date="${targetDate}"]`);
                if (targetCard) {
                    container.scrollTo({
                        top: targetCard.offsetTop - listDiv.offsetTop,
                        behavior: 'smooth'
                    });
                }
                
                // Mở khóa kéo sau khi cuộn hoàn tất mượt mà
                setTimeout(() => { isDragging = false; }, 200);
            });

            // Đồng bộ hóa ngược lại: Khi người dùng cuộn danh sách thủ công bằng chuột hoặc vuốt
            container.addEventListener('scroll', () => {
                if (isDragging) return; // Nếu đang kéo slider thì không ghi đè lại giá trị

                const cards = listDiv.querySelectorAll('.card');
                let closestIdx = 0;
                let minDiff = Infinity;

                cards.forEach(card => {
                    // Tính khoảng cách từ đỉnh phần tử card tới đỉnh vùng nhìn thấy
                    const diff = Math.abs(card.offsetTop - listDiv.offsetTop - container.scrollTop);
                    if (diff < minDiff) {
                        minDiff = diff;
                        const cardDate = card.getAttribute('data-date');
                        const idx = dates.indexOf(cardDate);
                        if (idx !== -1) {
                            closestIdx = idx;
                        }
                    }
                });

                slider.value = closestIdx;
                label.innerText = `Kỳ ngày: ${dates[closestIdx]}`;
            });
        }

        // HÀM TẢI LỊCH SỬ DỰ ĐOÁN TỪ FILE JSON NGOẠI VI (CẬP NHẬT LẤY 10 KỲ GẦN NHẤT)
        async function loadHistoryPredictions() {
            const backtestDiv = document.getElementById('backtest-list');
            if (!backtestDiv) return;

            try {
                const response = await fetch('js/history_predictions.json');
                if (!response.ok) throw new Error("Không tìm thấy file");
                
                const historyData = await response.json();
                const dates = Object.keys(historyData).reverse(); // Lấy ngày mới nhất trước
                
                let backtestHtml = "";
                
                // CẬP NHẬT: Lấy đúng 10 kỳ gần nhất thay vì 5 kỳ
                const selectedDates = dates.slice(0, 10);
                
                // Duyệt qua tối đa 10 kỳ để hiển thị
                selectedDates.forEach(date => {
                    historyData[date].forEach(item => {
                        backtestHtml += `
                            <div class="card" data-date="${date}">
                                <div class="card-label">Đài: ${item.dai}</div>
                                <div class="card-subtext" style="font-size: 11px;">Ngày: ${date}</div>
                                <div class="card-subtext">Dự đoán: <strong>${item.predictions.map(p => String(p.so).padStart(2, '0')).join(', ')}</strong></div>
                            </div>
                        `;
                    });
                });
                
                backtestDiv.innerHTML = backtestHtml;
                
                // Khởi tạo thanh kéo đồng bộ 10 kỳ
                initBacktestSlider(selectedDates);

            } catch (err) {
                console.warn("Chưa có dữ liệu lịch sử hoặc file không tồn tại.");
                // Trường hợp chạy file tĩnh độc lập (fallback), lấy dữ liệu xoso_data tĩnh để dựng thanh kéo
                if (backtestDiv.innerHTML.trim() === "" || backtestDiv.innerHTML.includes("Dữ liệu lưu vết")) {
                    const data = xoso_data;
                    let staticHtml = "";
                    if (data.backtest_history && data.backtest_history.length > 0) {
                        data.backtest_history.forEach(item => {
                            staticHtml += `
                                <div class="card" data-date="${item.date}">
                                    <div class="card-label">Đài: ${item.dai}</div>
                                    <div class="card-subtext">${item.date}</div>
                                    <div style="margin-top: 6px;">Giải 8 về: <span style="color: var(--accent-red); font-weight: 700;">${String(item.real_number).padStart(2, '0')}</span></div>
                                    <div class="card-subtext">AI đoán: [${item.ai_numbers.map(n => String(n).padStart(2, '0')).join(', ')}]</div>
                                    <div style="margin-top: 6px; font-size: 12px;">
                                        ${item.success ? `<span style="color: var(--accent-green); font-weight: 600;">🎯 Trúng mục tiêu</span>` : `<span style="color: var(--text-muted);">Chưa trúng</span>`}
                                    </div>
                                </div>
                            `;
                        });
                        backtestDiv.innerHTML = staticHtml;
                        const uniqueDates = [...new Set(data.backtest_history.map(item => item.date))];
                        initBacktestSlider(uniqueDates);
                    }
                }
            }
        }

        function initPermanentDashboard() {
            if (typeof xoso_data === 'undefined') {
                console.error("❌ Không tìm thấy biến dữ liệu xoso_data tĩnh!");
                return;
            }

            const data = xoso_data;
            document.getElementById('lbl-time').innerText = data.build_time;

            // --- 1. HIỂN THỊ BÁO CÁO ĐỐI CHIẾU KẾT QUẢ VĨNH VIỄN ---
            const backtestDiv = document.getElementById('backtest-list');
            let backtestHtml = "";
            if (data.backtest_history.length === 0) {
                backtestHtml = `<p style="color: var(--text-muted); padding: 10px; font-size: 13px;">Dữ liệu lưu vết sẽ xuất hiện sau vòng quay ngày kế tiếp.</p>`;
                backtestDiv.innerHTML = backtestHtml;
            } else {
                data.backtest_history.forEach(item => {
                    backtestHtml += `
                        <div class="card" data-date="${item.date}">
                            <div class="card-label">Đài: ${item.dai}</div>
                            <div class="card-subtext">${item.date}</div>
                            <div style="margin-top: 6px;">Giải 8 về: <span style="color: var(--accent-red); font-weight: 700;">${String(item.real_number).padStart(2, '0')}</span></div>
                            <div class="card-subtext">AI đoán: [${item.ai_numbers.map(n => String(n).padStart(2, '0')).join(', ')}]</div>
                            <div style="margin-top: 6px; font-size: 12px;">
                                ${item.success ? `<span style="color: var(--accent-green); font-weight: 600;">🎯 Trúng mục tiêu</span>` : `<span style="color: var(--text-muted);">Chưa trúng</span>`}
                            </div>
                        </div>
                    `;
                });
                backtestDiv.innerHTML = backtestHtml;
                const uniqueDates = [...new Set(data.backtest_history.map(item => item.date))];
                initBacktestSlider(uniqueDates);
            }

            // --- 2. HIỂN THỊ TOP 3 HÔM NAY ---
            const predictDiv = document.getElementById('prediction-list');
            let predictHtml = "";
            data.top_3_today.forEach(item => {
                predictHtml += `
                    <div class="card" style="background-color: var(--bg-card); border-color: var(--border-color);">
                        <div class="card-label" style="color: var(--accent-green); margin-bottom: 8px; border-bottom: 1px dashed var(--border-color); padding-bottom: 4px;">Đài: ${item.dai}</div>
                        <div style="display:flex; flex-direction:column; gap:6px;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <span>1st: <span class="badge" style="background-color: var(--accent-red);">${String(item.predictions[0].so).padStart(2, '0')}</span></span>
                                <span style="font-size: 12px; color: var(--text-muted);">${item.predictions[0].xac_suat}%</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <span>2nd: <span class="badge" style="background-color: var(--accent-orange);">${String(item.predictions[1].so).padStart(2, '0')}</span></span>
                                <span style="font-size: 12px; color: var(--text-muted);">${item.predictions[1].xac_suat}%</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <span>3rd: <span class="badge" style="background-color: var(--primary);">${String(item.predictions[2].so).padStart(2, '0')}</span></span>
                                <span style="font-size: 12px; color: var(--text-muted);">${item.predictions[2].xac_suat}%</span>
                            </div>
                        </div>
                    </div>
                `;
            });
            predictDiv.innerHTML = predictHtml;

            // --- 3. KHỞI TẠO BIỂU ĐỒ HOẠT ĐỘNG (MẶC ĐỊNH LÀ 30 KỲ GẦN NHẤT) ---
            renderAdvanceChart('recent', data);

            // Sự kiện bộ lọc năm
            document.getElementById('cbo-year').addEventListener('change', (e) => {
                renderAdvanceChart(e.target.value, data);
            });

            // --- ĐỒNG BỘ SIÊU TỐC VÀ MƯỢT MÀ ---
            
            // Sự kiện nút Bỏ chọn tất cả các tỉnh
            document.getElementById('btn-deselect-all').addEventListener('click', () => {
                if (!historyChart) return;
                historyChart.data.datasets.forEach((dataset, index) => {
                    historyChart.setDatasetVisibility(index, false); // Đặt trạng thái ẩn trực tiếp cho dữ liệu
                });
                historyChart.update(); // Chạy hoạt ảnh mượt mà đúng 300ms theo cấu hình biểu đồ
                initScrollbarControls(); // Cập nhật lại thanh kéo slider
            });

            // Sự kiện nút Chọn lại tất cả các tỉnh
            document.getElementById('btn-select-all').addEventListener('click', () => {
                if (!historyChart) return;
                historyChart.data.datasets.forEach((dataset, index) => {
                    historyChart.setDatasetVisibility(index, true); // Đặt trạng thái hiện trực tiếp
                });
                historyChart.update(); // Chạy hoạt ảnh mượt mà đúng 300ms theo cấu hình biểu đồ
                initScrollbarControls(); // Cập nhật lại thanh kéo slider
            });

            // Kích hoạt hàm tải lịch sử bổ sung lấy 10 kỳ từ tệp JSON
            loadHistoryPredictions();
        }

        function renderAdvanceChart(filterType, data) {
            let filteredLabels = [];
            let startIndex = 0;
            let endIndex = data.timeline_x.length;

            if (filterType === 'recent') {
                startIndex = Math.max(0, data.timeline_x.length - 30);
                filteredLabels = data.timeline_x.slice(startIndex, endIndex);
            } else {
                data.timeline_x.forEach((dateStr, idx) => {
                    if (dateStr.endsWith('/' + filterType) || dateStr.endsWith('-' + filterType)) {
                        if (filteredLabels.length === 0) startIndex = idx;
                        filteredLabels.push(dateStr);
                        endIndex = idx + 1;
                    }
                });
            }

            currentTimelineX = filteredLabels; 

            const datasets = [];
            let colorIdx = 0;

            for (const [channelName, points] of Object.entries(data.lines_y)) {
                const slicedPoints = points.slice(startIndex, endIndex);
                if (!slicedPoints.some(p => p !== null && p !== undefined)) continue;

                datasets.push({
                    label: channelName,
                    data: slicedPoints,
                    borderColor: paletteColors[colorIdx % paletteColors.length],
                    backgroundColor: paletteColors[colorIdx % paletteColors.length],
                    borderWidth: 2.5,
                    pointRadius: filterType === 'recent' ? 5 : 2,
                    tension: 0.15,
                    spanGaps: true
                });
                colorIdx++;
            }

            if (historyChart) historyChart.destroy();

            const ctx = document.getElementById('historyLineChart').getContext('2d');
            
            historyChart = new Chart(ctx, {
                type: 'line',
                data: { labels: filteredLabels, datasets: datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    // Giới hạn tất cả hoạt ảnh hiển thị/ẩn/thay đổi về đúng 300ms mượt mà
                    animation: {
                        duration: 300
                    },
                    scales: {
                        x: { min: 0, max: filteredLabels.length - 1 },
                        y: { min: 0, max: 99, ticks: { callback: v => String(v).padStart(2, '0') } }
                    },
                    plugins: {
                        zoom: {
                            pan: { enabled: true, mode: 'x', onPan: syncSliderWithChart },
                            zoom: {
                                wheel: { enabled: true },
                                pinch: { enabled: true },
                                mode: 'x',
                                speed: 0.04,
                                onZoom: syncSliderWithChart
                            }
                        }
                    }
                },
                plugins: [{
                    id: 'inlineZoomLabels',
                    afterDatasetsDraw(chart) {
                        try {
                            const { ctx, scales: { x } } = chart;
                            const totalPoints = currentTimelineX.length;
                            const visiblePoints = x.max - x.min;
                            
                            const zoomRatio = (totalPoints - visiblePoints) / totalPoints;

                            // Khi phóng to vượt ngưỡng 10%
                            if (zoomRatio >= 0.10) { 
                                ctx.save();
                                ctx.font = 'bold 11px Inter, sans-serif';
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'middle';

                                chart.data.datasets.forEach((dataset, dIdx) => {
                                    // SỬA LỖI: Nhãn số của đài bị ẩn sẽ không hiển thị đè lên nữa (biến mất ngay lập tức)
                                    if (chart.isDatasetVisible(dIdx)) {
                                        const meta = chart.getDatasetMeta(dIdx);
                                        meta.data.forEach((element, pIdx) => {
                                            // Chỉ vẽ những điểm nằm trong vùng hiển thị của mắt nhìn (Viewport)
                                            if (pIdx >= x.min && pIdx <= x.max) {
                                                const value = dataset.data[pIdx];
                                                if (value !== null && value !== undefined) {
                                                    // Vẽ một ô tròn trắng đệm bên dưới chữ
                                                    ctx.fillStyle = '#ffffff';
                                                    ctx.beginPath();
                                                    ctx.arc(element.x, element.y, 9, 0, 2 * Math.PI);
                                                    ctx.fill();

                                                    // Vẽ đường viền mỏng quanh ô tròn
                                                    ctx.strokeStyle = dataset.borderColor;
                                                    ctx.lineWidth = 1;
                                                    ctx.stroke();
                                                    
                                                    // Ghi chữ con số kết quả đè lên ô tròn trắng
                                                    ctx.fillStyle = dataset.borderColor;
                                                    ctx.fillText(String(value).padStart(2, '0'), element.x, element.y);
                                                }
                                            }
                                        });
                                    }
                                });
                                ctx.restore();
                            }
                        } catch (err) {
                            // Bỏ qua lỗi vẽ đè nếu kích thước khung chưa kịp khởi tạo ổn định
                        }
                    }
                }]
            });

            initScrollbarControls();
        }

        // HÀM KHỞI TẠO VÀ ĐỒNG BỘ THANH KÉO (SLIDER SCROLLBAR)
        function initScrollbarControls() {
            const wrapper = document.getElementById('scrollbar-wrapper');
            const slider = document.getElementById('chart-scrollbar');
            
            if (!historyChart) return;
            const { min, max } = historyChart.scales.x;
            const total = currentTimelineX.length;
            const visibleRange = max - min;

            if (visibleRange >= total - 1) {
                wrapper.style.display = 'none'; 
            } else {
                wrapper.style.display = 'block'; 
                slider.max = total - 1 - visibleRange;
                slider.value = min;
            }
        }

        // Khi kéo slider input -> Biểu đồ dịch chuyển theo trục X
        document.getElementById('chart-scrollbar').addEventListener('input', (e) => {
            if (!historyChart) return;
            const sliderVal = parseInt(e.target.value);
            const { min, max } = historyChart.scales.x;
            const visibleRange = max - min;

            historyChart.options.scales.x.min = sliderVal;
            historyChart.options.scales.x.max = sliderVal + visibleRange;
            historyChart.update('none'); 
        });

        function syncSliderWithChart({ chart }) {
            const slider = document.getElementById('chart-scrollbar');
            const wrapper = document.getElementById('scrollbar-wrapper');
            const { min, max } = chart.scales.x;
            const total = currentTimelineX.length;
            const visibleRange = max - min;

            if (visibleRange >= total - 1) {
                wrapper.style.display = 'none';
            } else {
                wrapper.style.display = 'block';
                slider.max = total - 1 - visibleRange;
                slider.value = Math.round(min);
            }
        }

        // LOGIC TOGGLE SIDEBAR (ĐÓNG MỞ THANH BÊN) MƯỢT MÀ KHÔNG TRỄ LẮC
        document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
            const sidebar = document.getElementById('app-sidebar');
            const main = document.querySelector('.app-main');
            
            // Thêm class đánh dấu đang bắt đầu hoạt ảnh đóng/mở
            document.body.classList.add('sidebar-toggling');
            
            sidebar.classList.toggle('collapsed');
            sidebar.classList.toggle('active'); // Sử dụng cho phiên bản di động
            
            // Trì hoãn việc gọi hàm resize của ChartJS cho tới khi hoạt ảnh CSS hoàn tất (300ms)
            // Việc này loại bỏ hoàn toàn việc ChartJS phải render liên tục 60 lần/giây gây lag 2s
            setTimeout(() => {
                if (historyChart) {
                    try {
                        historyChart.resize();
                    } catch (e) {
                        // Tránh ném lỗi nếu chart chưa render xong
                    }
                }
                // Loại bỏ class đánh dấu hoạt ảnh
                document.body.classList.remove('sidebar-toggling');
            }, 320); // 320ms nhỉnh hơn tốc độ transition 300ms một chút để tối ưu
        });

        window.addEventListener('DOMContentLoaded', toggleFixLoad);
        function toggleFixLoad() {
            try {
                initPermanentDashboard();
            } catch (err) {
                console.warn("Lỗi khởi chạy bảo mật môi trường cục bộ: ", err);
            }
        }