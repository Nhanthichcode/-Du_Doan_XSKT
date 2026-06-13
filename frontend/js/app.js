const paletteColors = [
            '#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b'
        ];

        let historyChart = null;
        let currentTimelineX = []; // Lưu trữ trục X hiện hành để phục vụ thanh kéo

        function initPermanentDashboard() {
    if (typeof xoso_data === 'undefined') {
        console.error("❌ Không tìm thấy biến dữ liệu xoso_data tĩnh!");
        return;
    }

    const data = xoso_data;
    document.getElementById('lbl-time').innerText = data.build_time;

    // 1. Load và hiển thị Dự đoán & Đối chiếu từ file JSON riêng biệt
    fetch('js/history_predictions.json')
        .then(response => response.json())
        .then(historyJson => {
            // Lấy danh sách ngày và sắp xếp
            const dates = Object.keys(historyJson).sort((a, b) => {
                const dateA = new Date(a.split('/').reverse().join('/'));
                const dateB = new Date(b.split('/').reverse().join('/'));
                return dateB - dateA; // Ngày mới nhất lên đầu
            });

            const latestDate = dates[0];
            const predictDiv = document.getElementById('prediction-list');
            const backtestDiv = document.getElementById('backtest-list');

            // --- HIỂN THỊ DỰ ĐOÁN MỚI NHẤT ---
            let predictHtml = "";
            historyJson[latestDate].forEach(item => {
                predictHtml += `
                    <div class="card">
                        <div class="card-label">Đài: ${item.dai}</div>
                        <div style="font-size: 13px; margin-top: 5px;">
                            ${item.predictions.map((p, i) => `<div>${i+1}st: <b>${p.so}</b> (${p.xac_suat}%)</div>`).join('')}
                        </div>
                    </div>
                `;
            });
            predictDiv.innerHTML = predictHtml;

            // --- HIỂN THỊ LỊCH SỬ ĐỐI CHIẾU ---
            let backtestHtml = "";
            // Duyệt qua các ngày cũ (từ ngày thứ 2 trở đi)
            for (let i = 1; i < dates.length; i++) {
                const date = dates[i];
                historyJson[date].forEach(pred => {
                    // Tìm giải 8 thực tế trong xoso_data.lines_y để đối chiếu
                    const realValues = data.lines_y[pred.dai] || [];
                    const dateIndex = data.timeline_x.indexOf(date);
                    const realResult = (dateIndex !== -1) ? realValues[dateIndex] : null;

                    if (realResult !== null) {
                        const isWin = pred.predictions.some(p => String(p.so) === String(realResult).padStart(2, '0'));
                        backtestHtml += `
                            <div class="card">
                                <div class="card-label">Đài: ${pred.dai}</div>
                                <div class="card-subtext">${date}</div>
                                <div style="margin-top: 6px;">Giải 8: <span style="color: var(--accent-red); font-weight: 700;">${String(realResult).padStart(2, '0')}</span></div>
                                <div class="card-subtext">AI đoán: [${pred.predictions.map(p => p.so).join(', ')}]</div>
                                <div style="margin-top: 6px; font-size: 12px;">
                                    ${isWin ? `<span style="color: var(--accent-green); font-weight: 600;">🎯 Trúng</span>` : `<span style="color: var(--text-muted);">Trượt</span>`}
                                </div>
                            </div>
                        `;
                    }
                });
            }
            backtestDiv.innerHTML = backtestHtml || "<p style='color:var(--text-muted); font-size:12px;'>Chưa có dữ liệu đối chiếu.</p>";
        })
        .catch(err => console.error("❌ Lỗi load history_predictions.json:", err));

    // --- CÁC HÀM KHỞI TẠO BIỂU ĐỒ (GIỮ NGUYÊN NHƯ CŨ) ---
    renderAdvanceChart('recent', data);
    
    document.getElementById('cbo-year').addEventListener('change', (e) => {
        renderAdvanceChart(e.target.value, data);
    });

    // Sự kiện nút Bỏ chọn/Chọn tất cả
    document.getElementById('btn-deselect-all').addEventListener('click', () => {
        historyChart.data.datasets.forEach((_, i) => historyChart.hide(i));
        historyChart.update();
    });

    document.getElementById('btn-select-all').addEventListener('click', () => {
        historyChart.data.datasets.forEach((_, i) => historyChart.show(i));
        historyChart.update();
    });
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
                                    // Kiểm tra xem đài này có đang hiển thị thực tế trên bản đồ không
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
