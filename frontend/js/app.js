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

    // --- 1 & 2. ĐỌC DỮ LIỆU TỪ FILE JSON ĐỂ SINH DỰ ĐOÁN VÀ ĐỐI CHIẾU ---
    fetch('js/history_predictions.json')
        .then(response => response.json())
        .then(historyJson => {
            const dates = Object.keys(historyJson);
            if (dates.length === 0) return;

            // Hàm chuẩn hóa chuỗi ngày dạng DD/MM/YYYY sang đối tượng Date để sắp xếp chính xác
            const convertToDateObject = (dateStr) => {
                const parts = dateStr.replace(/-/g, '/').split('/');
                return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
            };

            // Sắp xếp ngày từ mới nhất đến cũ nhất
            dates.sort((a, b) => convertToDateObject(b) - convertToDateObject(a));

            const latestDate = dates[0];
            const predictDiv = document.getElementById('prediction-list');
            const backtestDiv = document.getElementById('backtest-list');

            // --- HIỂN THỊ DỰ ĐOÁN MỚI NHẤT ---
            let predictHtml = "";
            if (historyJson[latestDate]) {
                historyJson[latestDate].forEach(item => {
                    predictHtml += `
                        <div class="card">
                            <div class="card-label">Đài: ${item.dai}</div>
                            <div style="font-size: 13px; margin-top: 5px;">
                                ${item.predictions.map((p, i) => `<div>${i + 1}st: <b>${String(p.so).padStart(2, '0')}</b> (${p.xac_suat}%)</div>`).join('')}
                            </div>
                        </div>
                    `;
                });
            }
            if (predictDiv) predictDiv.innerHTML = predictHtml;

            // --- HIỂN THỊ LỊCH SỬ ĐỐI CHIẾU TOÀN BỘ CÁC KỲ ---
            let backtestHtml = "";

            // Hàm chuẩn hóa tên đài để so khớp không lệch ký tự viết hoa hoặc khoảng trống
            const cleanStationName = (name) => {
                if (!name) return "";
                return name.toLowerCase()
                           .replace(/hồ chí minh/g, 'hcm')
                           .replace(/tp\.hcm/g, 'hcm')
                           .replace(/tp\./g, '')
                           .trim();
            };

            // Duyệt qua tất cả mốc ngày có trong file dự đoán lịch sử
            dates.forEach(date => {
                // Chuẩn hóa định dạng ngày của file JSON về dạng gạch chéo giống biểu đồ
                const normalDateKey = date.replace(/-/g, '/');
                const targetIndex = data.timeline_x.indexOf(normalDateKey);

                historyJson[date].forEach(pred => {
                    let realResult = null;

                    // Dò tìm đài khớp tên trong xoso_data.lines_y
                    for (const [lineName, points] of Object.entries(data.lines_y)) {
                        if (cleanStationName(lineName) === cleanStationName(pred.dai)) {
                            if (targetIndex !== -1 && points[targetIndex] !== null && points[targetIndex] !== undefined) {
                                realResult = points[targetIndex];
                            }
                            break;
                        }
                    }

                    // Nếu ngày này trong quá khứ đã có kết quả quay thưởng thực tế
                    if (realResult !== null) {
                        const actualG8Str = String(realResult).padStart(2, '0');
                        const isWin = pred.predictions.some(p => String(p.so).padStart(2, '0') === actualG8Str);

                        backtestHtml += `
                            <div class="card">
                                <div class="card-label">Đài: ${pred.dai}</div>
                                <div class="card-subtext">${normalDateKey}</div>
                                <div style="margin-top: 6px;">Giải 8 về: <span style="color: var(--accent-red); font-weight: 700;">${actualG8Str}</span></div>
                                <div class="card-subtext">AI đoán: [${pred.predictions.map(p => String(p.so).padStart(2, '0')).join(', ')}]</div>
                                <div style="margin-top: 6px; font-size: 12px;">
                                    ${isWin ? `<span style="color: var(--accent-green); font-weight: 600;">🎯 Trúng mục tiêu</span>` : `<span style="color: var(--text-muted);">Chưa trúng</span>`}
                                </div>
                            </div>
                        `;
                    }
                });
            });

            if (backtestDiv) {
                backtestDiv.innerHTML = backtestHtml || `<p style="color: var(--text-muted); padding: 10px; font-size: 13px;">Dữ liệu lưu vết sẽ xuất hiện sau vòng quay ngày kế tiếp.</p>`;
            }
        })
        .catch(err => console.error("❌ Không thể phân tích cấu trúc history_predictions.json:", err));

    // --- 3. KHỞI TẠO BIỂU ĐỒ HOẠT ĐỘNG (MẶC ĐỊNH LÀ 30 KỲ GẦN NHẤT) ---
    renderAdvanceChart('recent', data);

    // Sự kiện bộ lọc năm
    const cboYear = document.getElementById('cbo-year');
    if (cboYear) {
        cboYear.addEventListener('change', (e) => {
            renderAdvanceChart(e.target.value, data);
        });
    }

    // Sự kiện nút Bỏ chọn tất cả các tỉnh
    const btnDeselect = document.getElementById('btn-deselect-all');
    if (btnDeselect) {
        btnDeselect.addEventListener('click', () => {
            if (!historyChart) return;
            historyChart.data.datasets.forEach((dataset, index) => {
                historyChart.hide(index);
            });
            historyChart.update();
            if (typeof initScrollbarControls === 'function') initScrollbarControls();
        });
    }

    // Sự kiện nút Chọn lại tất cả các tỉnh
    const btnSelect = document.getElementById('btn-select-all');
    if (btnSelect) {
        btnSelect.addEventListener('click', () => {
            if (!historyChart) return;
            historyChart.data.datasets.forEach((dataset, index) => {
                historyChart.show(index);
            });
            historyChart.update();
            if (typeof initScrollbarControls === 'function') initScrollbarControls();
        });
    }
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
            backgroundColor: paletteColors[colorIdx % paletteColors.length] + '20',
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
                    pan: { enabled: true, mode: 'x', onPan: typeof syncSliderWithChart === 'function' ? syncSliderWithChart : null },
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        mode: 'x',
                        speed: 0.04,
                        onZoom: typeof syncSliderWithChart === 'function' ? syncSliderWithChart : null
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

                    if (zoomRatio >= 0.10) { 
                        ctx.save();
                        ctx.font = 'bold 11px Inter, sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';

                        chart.data.datasets.forEach((dataset, dIdx) => {
                            if (chart.isDatasetVisible(dIdx)) {
                                const meta = chart.getDatasetMeta(dIdx);
                                meta.data.forEach((element, pIdx) => {
                                    if (pIdx >= x.min && pIdx <= x.max) {
                                        const value = dataset.data[pIdx];
                                        if (value !== null && value !== undefined) {
                                            ctx.fillStyle = '#ffffff';
                                            ctx.beginPath();
                                            ctx.arc(element.x, element.y, 9, 0, 2 * Math.PI);
                                            ctx.fill();

                                            ctx.strokeStyle = dataset.borderColor;
                                            ctx.lineWidth = 1;
                                            ctx.stroke();
                                            
                                            ctx.fillStyle = dataset.borderColor;
                                            ctx.fillText(String(value).padStart(2, '0'), element.x, element.y);
                                        }
                                    }
                                });
                            }
                        });
                        ctx.restore();
                    }
                } catch (err) {}
            }
        }]
    });

    if (typeof initScrollbarControls === 'function') initScrollbarControls();
}
