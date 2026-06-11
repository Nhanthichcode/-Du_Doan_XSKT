const express = require('express');
const { spawn, exec } = require('child_process');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// -------------------------------------------------------------------
// 1. HÀM CHẠY TIẾN TRÌNH PYTHON ĐỒNG BỘ
// -------------------------------------------------------------------
const runPythonScript = (scriptName, args = []) => {
    return new Promise((resolve, reject) => {
        const timestamp = new Date().toLocaleString();
        
        // BƯỚC BẢO VỆ TỐI CAO: Ép chính phiên bản Python đang chạy phải tự kiểm tra 
        // và cài đặt các thư viện trong requirements.txt nếu hệ thống làm sót.
        console.log(`[${timestamp}] 🛠️ MLOps Robot đang tự động đồng bộ môi trường thư viện cho [${scriptName}]...`);
        
        // const checkEnvCmd = `python -m pip install -r requirements.txt && python ${scriptName} ${args.join(' ')}`;
        // Thêm cờ --break-system-packages để vượt qua cơ chế chặn PEP 668 của Linux mới
        // Thêm cờ -q (quiet) và điều hướng > /dev/null 2>&1 để giấu nhẹm mọi thông báo rác của pip
        const checkEnvCmd = `python -m pip install -q -r requirements.txt --break-system-packages > /dev/null 2>&1 && python ${scriptName} ${args.join(' ')}`;


        const pythonProcess = spawn('sh', ['-c', checkEnvCmd]);
        let output = '';
        let error = '';

        pythonProcess.stdout.on('data', (data) => { output += data.toString(); });
        pythonProcess.stderr.on('data', (data) => { error += data.toString(); });

        pythonProcess.on('close', (code) => {
            if (code === 0) {
                resolve(output.trim());
            } else {
                console.error(`[${new Date().toLocaleString()}] ❌ Thất bại tại tiến trình ${scriptName}:`, error);
                reject(`Lỗi tại file ${scriptName}: ${error}`);
            }
        });
    });
};

// -------------------------------------------------------------------
// 2. HÀM TỰ ĐỘNG ĐẨY FILE LÊN GITHUB BẰNG TOKEN BẢO MẬT
// -------------------------------------------------------------------
const autoPushToGitHub = () => {
    return new Promise((resolve, reject) => {
        console.log(`[${new Date().toLocaleString()}] 🚀 [GITHUB] Đang chuẩn bị đồng bộ toàn bộ dữ liệu lên GitHub...`);
        
        const token = process.env.GITHUB_TOKEN;
        const user = process.env.GITHUB_USER;
        const repo = process.env.GITHUB_REPO;

        if (!token || !user || !repo) {
            console.log("⚠️ Thiếu cấu hình GITHUB_TOKEN, GITHUB_USER hoặc GITHUB_REPO. Bỏ qua bước đẩy code lên GitHub.");
            return resolve("Bỏ qua Git Push");
        }

        const configCmd = `git config --global user.email "bot-mlops@render.com" && git config --global user.name "MLOps Robot"`;
        const repoUrl = `https://${token}@github.com/${user}/${repo}.git`;
        
        // CHỈ ĐỊNH RÕ 4 FILE CẦN LƯU VÀ DÙNG --AUTOSTASH ĐỂ CHỐNG KẸT LỆNH PULL
        const filesToAdd = `../frontend/js/dashboard_data.js xsmn_tong_hop_20_nam.csv model_xsmn_predict.pkl`;
        const pushCmd = `git add ${filesToAdd} && (git commit -m "Robot: Tự động cập nhật dữ liệu MLOps ngày mới" || true) && git pull ${repoUrl} main --rebase --autostash && git push ${repoUrl} HEAD:main`;
        
        exec(`${configCmd} && ${pushCmd}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`[${new Date().toLocaleString()}] ❌ Lỗi tự động push GitHub:`, stderr || error);
                return reject(error);
            }
            console.log(`[${new Date().toLocaleString()}] ✅ [GITHUB] Đã đẩy thành công toàn bộ dữ liệu mới lên GitHub!`);
            resolve(stdout);
        });
    });
};

// -------------------------------------------------------------------
// 3. CHUỖI PIPELINE MLOPS CHẠY TỰ ĐỘNG NGẦM
// -------------------------------------------------------------------
const runDailyMLOpsPipeline = async () => {
    const startTime = Date.now();
    console.log("\n======================================================================");
    console.log(`⚡ [START WORKFLOW] KÍCH HOẠT CHUỖI QUY TRÌNH MLOPS TỰ ĐỘNG`);
    console.log("======================================================================");
    
    try {
        // Bước 1: Cào dữ liệu
        console.log("\n👉 [BƯỚC 1/6] Tiến hành cào dữ liệu xổ số mới từ internet...");
        await runPythonScript('cao_du_lieu_tu_dong.py');
        console.log("✅ Hoàn thành Bước 1.");

        // Bước 2: Chế biến dữ liệu học máy
        console.log("\n👉 [BƯỚC 2/6] Trích xuất đặc trưng đặc biệt (data_training_ai.csv)...");
        await runPythonScript('chuyen_thanh_du_lieu_huan_luyen.py');
        console.log("✅ Hoàn thành Bước 2.");

        // Bước 3: Huấn luyện AI
        console.log("\n👉 [BƯỚC 3/6] Tái huấn luyện mô hình học máy Random Forest...");
        const trainLog = await runPythonScript('master_ai.py');
        console.log("📊 Nhật ký học máy (Model Metrics):", trainLog);
        console.log("✅ Hoàn thành Bước 3.");

        // Bước 4: Chạy dự đoán hôm nay
        console.log("\n👉 [BƯỚC 4/6] Chạy thuật toán dự đoán xác suất ra số vàng hôm nay...");
        const rawJson = await runPythonScript('du_doan.py'); 
        const data = JSON.parse(rawJson);
        console.log("✅ Hoàn thành Bước 4.");

        // Bước 5: Đóng gói JSON tĩnh
        console.log("\n👉 [BƯỚC 5/6] Đóng gói nén dữ liệu 20 năm phục vụ chế độ Offline mượt mà...");
        await runPythonScript('build_js_data.py');
        console.log("✅ Hoàn thành Bước 5.");

        // Bước 6: Đẩy lên GitHub
        console.log("\n👉 [BƯỚC 6/6] Đồng bộ hóa file dashboard_data.js lên đám mây GitHub...");
        try {
            await autoPushToGitHub();
        } catch (gitErr) {
            console.log("⚠️ Git push thất bại, nhưng hệ thống vẫn tiếp tục gửi Mail.");
        }
        console.log("✅ Hoàn thành Bước 6.");

        // Gửi báo cáo Email
        // console.log("\n✉️ Đang tổng hợp dữ liệu để soạn thư gửi báo cáo MLOps...");
        // await sendMailReport(data);
        
        const durationSec = Math.round((Date.now() - startTime) / 1000);
        console.log("\n======================================================================");
        console.log(`🎉 [HOÀN THÀNH XUẤT SẮC] Toàn bộ hệ thống chạy ngầm mất ${durationSec} giây!`);
        console.log("======================================================================\n");

    } catch (err) {
        console.error("\n💥 [SỰ CỐ NGHIÊM TRỌNG] Chuỗi quy trình tự động bị đứt gãy giữa chừng:");
        console.error(err);
        console.log("======================================================================\n");
    }
};

// -------------------------------------------------------------------
// 4. HÀM GỬI EMAIL BÁO CÁO
// -------------------------------------------------------------------
// const sendMailReport = async (data) => {
//     let transporter = nodemailer.createTransport({
//     host: 'smtp.gmail.com',
//     port: 465,           // Chuyển sang cổng 465 (Bảo mật SSL) thay vì cổng mặc định
//     secure: true,        // Bắt buộc dùng mã hóa
//     auth: { 
//         user: process.env.EMAIL_USER, 
//         pass: process.env.EMAIL_PASS 
//     },
//     tls: {
//         // Giúp vượt qua các rào cản kiểm tra chứng chỉ SSL nội bộ của Render
//         rejectUnauthorized: false
//     },
//     connectionTimeout: 10000 // Thêm 10 giây chờ kết nối để tránh sập app nếu mạng trễ
//     });

//     let htmlBody = `<h2 style="color: #2c3e50;">HỆ THỐNG MLOPS XSMN BÁO CÁO TỰ ĐỘNG</h2>`;
    
//     if (data.success) {
//         htmlBody += `<p><b>Dự đoán lịch quay:</b> Thứ ${data.thu} (Ngày ${data.ngay_du_doan})</p>`;
//         htmlBody += `<p style="color: #27ae60; font-weight: bold;">Hôm nay hệ thống phát hiện có ${data.results.length} đài mở thưởng.</p>`;
//         htmlBody += `<hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;"/>`;

//         data.results.forEach(daiResult => {
//             htmlBody += `<div style="margin-bottom: 25px; background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #3498db;">`;
//             htmlBody += `<h3 style="color: #2980b9; margin-top:0; letter-spacing: 1px;">🔮 ĐÀI: ${daiResult.dai.toUpperCase()}</h3>`;
//             htmlBody += `<p style="font-size: 12px; color: #7f8c8d; margin-bottom: 10px;">Dữ liệu lịch sử cập nhật: ${daiResult.ngay_cap_nhat_cu}</p>`;
//             htmlBody += `<ul style="list-style-type: none; padding-left: 0;">`;
            
//             daiResult.predictions.forEach(p => {
//                 htmlBody += `<li style="padding: 6px 0; border-bottom: 1px dashed #eee;">`;
//                 htmlBody += `Cặp số vàng: <b style="font-size:18px; color: #2c3e50;">${p.so}</b> — Xác suất nổ: <span style="color:#e74c3c; font-weight:bold; font-size:16px;">${p.xac_suat}%</span>`;
//                 htmlBody += `</li>`;
//             });
            
//             htmlBody += `</ul></div>`;
//         });
//     } else {
//         htmlBody += `<p style="color: red; font-weight: bold;">Lỗi mô hình: ${data.error}</p>`;
//     }

//     await transporter.sendMail({
//         from: process.env.EMAIL_USER,
//         to: process.env.EMAIL_RECEIVER,
//         subject: `[AI BOT] Dự Đoán XSMN Ngày Mới - Thứ ${data.thu} (${data.ngay_du_doan})`,
//         html: htmlBody
//     });
//     console.log("✈️ Thư báo cáo đã được gửi tới hòm thư Gmail của bạn thành công.");
// };

// -------------------------------------------------------------------
// 5. CÁC ĐIỂM KẾT NỐI API & LỊCH CHẠY
// -------------------------------------------------------------------

// Dự phòng 1: Cron Job nội bộ đề phòng GitHub Actions bị lỗi
cron.schedule('0 9 * * *', () => {
    console.log("⏰ [ĐỒNG HỒ NỘI BỘ] Điểm mốc 9h00 sáng, kích hoạt chuỗi tự động...");
    runDailyMLOpsPipeline();
}, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh"
});

// API Chính: Bắt tín hiệu đánh thức từ GitHub Actions
app.get('/ping', (req, res) => {
    const requestTime = new Date().toLocaleString();
    console.log(`\n[${requestTime}] 🔔 -> NHẬN LỆNH KÍCH HOẠT TỪ WATCHDOG (GITHUB ACTIONS)!`);
    
    // Trả kết quả ngay lập tức để GitHub không bị Timeout
    res.json({ 
        success: true, 
        status: "Đã nhận lệnh đánh thức thành công!", 
        message: "Hệ thống MLOps Pipeline đang tự động khởi chạy ngầm trên Render. Vui lòng theo dõi tab Logs."
    });

    // Chạy ngầm quy trình sau khi đã trả phản hồi
    runDailyMLOpsPipeline();
});

// API Phụ: Xem dự đoán trực tiếp nếu cần
app.get('/api/predictions', async (req, res) => {
    const requestTime = new Date().toLocaleString();
    try {
        console.log(`[${requestTime}] -> 📥 Đã nhận yêu cầu gọi API /api/predictions từ Client.`);
        const rawJson = await runPythonScript('du_doan.py');
        
        if (!rawJson || rawJson.trim() === "") {
            throw new Error("File Python 'du_doan.py' chạy nhưng không xuất ra dữ liệu JSON.");
        }

        const data = JSON.parse(rawJson);
        res.json(data);
    } catch (err) {
        console.error(`[${new Date().toLocaleString()}] ❌ LỖI API /api/predictions:`, err.message || err);
        res.status(500).json({ 
            success: false, 
            error: 'Lỗi máy chủ khi lấy dữ liệu dự đoán.',
            details: err.message || String(err)
        });
    }
});

// app.get('/test/mail', async (req, res) => {
//     try {
//         console.log("🛠️ [TEST] Đang gửi thử Email báo cáo mẫu...");
//         // Bơm một data giả để test format Email
//         const mockData = {
//             success: true,
//             thu: 5,
//             ngay_du_doan: "10/06/2026",
//             results: [{
//                 dai: "tây ninh",
//                 ngay_cap_nhat_cu: "03/06/2026",
//                 predictions: [
//                     { so: "68", xac_suat: 75.5 },
//                     { so: "39", xac_suat: 60.2 },
//                     { so: "79", xac_suat: 55.1 }
//                 ]
//             }]
//         };
//         await sendMailReport(mockData);
//         res.json({ success: true, message: "Đã gửi mail test thành công!" });
//     } catch (err) {
//         res.status(500).json({ success: false, error: err.message || err });
//     }
// });
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log("======================================================================");
    console.log(`🚀 [ONLINE] Node MLOps Backend đang kích hoạt tại Port ${PORT}`);
    console.log("======================================================================");
    runDailyMLOpsPipeline();
});
