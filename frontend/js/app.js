// Bảng màu cho các đường Line đồ thị đài
const paletteColors = [
    '#ff4757', '#1e90ff', '#2ed573', '#ffa502', '#9b59b6', '#2bc4ad', '#ff6b81', '#57606f'
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

    // --- 1. HIỂN THỊ BÁO CÁO ĐỐI CHIẾU KẾT QUẢ VĨNH VIỄN ---
    const backtestDiv = document.getElementById('backtest-list');
    let backtestHtml = "";
    if (data.backtest_history.length === 0) {
        backtestHtml = `<p style="color:#747d8c; padding:10px;">Dữ liệu lưu vết sẽ xuất hiện sau vòng quay ngày kế tiếp.</p>`;
    } else {
        data.backtest_history.forEach(item => {
            backtestHtml += `
                <div class="card">
                    <b>Đài: ${item.dai}</b> (${item.date})<br/>
                    Giải 8 thật về: <b style="color:#ff4757; font-size:16px;">${item.real_number}</b><br/>
                    AI đã đoán: [${item.ai_numbers.join(', ')}]<br/>
                    Đánh giá: ${item.success ? `<span style="color:#2ed573; font-weight:bold;">Trúng mục tiêu🎯</span>` : `<span style="color:#a4b0be;">Chưa trúng</span>`}
                </div>
            `;
        });
    }
    backtestDiv.innerHTML = backtestHtml;

    // --- 2. HIỂN THỊ TOP 3 HÔM NAY ---
    const predictDiv = document.getElementById('prediction-list');
    let predictHtml = "";
    data.top_3_today.forEach(item => {
        predictHtml += `
            <div class="card">
                <b style="color:#2ed573;">Đài: ${item.dai}</b><br/>
                1️⃣ Số vàng: <span class="badge">${item.predictions[0].so}</span> (${item.predictions[0].xac_suat}%)<br/>
                2️⃣ Số vàng: <span class="badge" style="background:#ffa502">${item.predictions[1].so}</span> (${item.predictions[1].xac_suat}%)<br/>
                3️⃣ Số vàng: <span class="badge" style="background:#1e90ff">${item.predictions[2].so}</span> (${item.predictions[2].xac_suat}%)
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

    // Sự kiện nút Bỏ chọn tất cả các tỉnh
    document.getElementById('btn-deselect-all').addEventListener('click', () => {
        if (!historyChart) return;
        historyChart.data.datasets.forEach(dataset => { dataset.hidden = true; });
        historyChart.update();
        initScrollbarControls(); // Cập nhật lại thanh kéo slider nếu cần
    });

    // Sự kiện nút Chọn lại tất cả các tỉnh
    document.getElementById('btn-select-all').addEventListener('click', () => {
        if (!historyChart) return;
        historyChart.data.datasets.forEach(dataset => { dataset.hidden = false; });
        historyChart.update();
        initScrollbarControls();
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
            borderWidth: 2,
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
        // SỬA LỖI: PLUGIN ĐÃ ĐƯỢC CẬP NHẬT CHỐNG HIỂN THỊ CHỮ CỦA ĐÀI BỊ ẨN
        plugins: [{
            id: 'inlineZoomLabels',
            afterDatasetsDraw(chart) {
                const { ctx, scales: { x } } = chart;
                const totalPoints = currentTimelineX.length;
                const visiblePoints = x.max - x.min;
                
                const zoomRatio = (totalPoints - visiblePoints) / totalPoints;

                // Khi phóng to vượt ngưỡng 20%
                if (zoomRatio >= 0.20) { 
                    ctx.save();
                    ctx.font = 'bold 11px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    chart.data.datasets.forEach((dataset, dIdx) => {
                        // FIX SỬA LỖI: Dùng hàm chính thống chart.isDatasetVisible để lọc sạch đài bị ẩn
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
                                        ctx.arc(element.x, element.y, 8, 0, 2 * Math.PI);
                                        ctx.fill();
                                        
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

window.addEventListener('DOMContentLoaded', toggleFixLoad);
function toggleFixLoad() {
    initPermanentDashboard();
}