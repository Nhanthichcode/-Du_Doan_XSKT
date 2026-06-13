const express = require('express');
const { spawn, exec } = require('child_process');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto'); // Thư viện mã hóa tiêu chuẩn bảo mật của Node.js
require('dotenv').config();

const app = express();
app.use(cors()); // Cho phép kết nối xuyên suốt từ GitHub Pages
app.use(express.json());

const logPath = path.join(__dirname, 'system_log.txt');

const logAction = (message) => {
    try {
        const timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        // Tự động lọc bỏ các ký tự icon/emoji đặc biệt để tránh lỗi định dạng file trên hệ thống Linux
        const cleanMsg = message.replace(/[⚠️✅❌🚀⚡👉🎉💥⏰🔔🛠️🤖]/g, '').trim();
        const logEntry = `[${timestamp}] ${cleanMsg}\n`;
        fs.appendFileSync(logPath, logEntry, 'utf8');
        console.log(logEntry.trim());
    } catch (err) {
        console.error("❌ Không thể ghi vào file log:", err);
    }
};

// Phục vụ các file tĩnh trong thư mục frontend nếu chạy thử nghiệm cục bộ
app.use(express.static(path.join(__dirname, 'frontend')));

// -------------------------------------------------------------------
// API XÁC THỰC BẰNG PHƯƠNG PHÁP BĂM MẬT KHẨU SHA-256
// -------------------------------------------------------------------
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    
    if (!password) {
        return res.status(400).json({ success: false, message: "Vui lòng cung cấp mật khẩu." });
    }

    // Tiến hành băm mật khẩu đầu vào bằng thuật toán mã hóa SHA-256
    const inputHash = crypto.createHash('sha256').update(password).digest('hex');
    
    // Lấy khóa băm cấu hình an toàn trong Render Environment Variables
    const secureHash = process.env.APP_PASSWORD_HASH;

    if (!secureHash) {
        logAction("[CẢNH BÁO] Hệ thống chưa thiết lập cấu hình APP_PASSWORD_HASH trong biến môi trường!");
        return res.status(500).json({ success: false, message: "Hệ thống chưa được cấu hình bảo mật trên Render!" });
    }

    if (inputHash === secureHash) {
        logAction("Người dùng đăng nhập thành công vào hệ thống.");
        return res.json({ success: true }); // Xác thực đúng, phản hồi đồng ý cho Frontend tải file
    } else {
        logAction("Phát hiện lần nhập mật khẩu không chính xác.");
        return res.status(401).json({ success: false, message: "Mật khẩu quản trị không chính xác!" });
    }
});

// -------------------------------------------------------------------
// API XUẤT NHẬT KÝ HỆ THỐNG CHO FRONTEND TERMINAL MONITOR (THÊM MỚI)
// -------------------------------------------------------------------
app.get('/api/system-log', (req, res) => {
    if (fs.existsSync(logPath)) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.sendFile(logPath);
    }
    res.status(404).send('Chưa có dữ liệu nhật ký hệ thống.');
});

// -------------------------------------------------------------------
// 1. HÀM CHẠY TIẾN TRÌNH PYTHON ĐỒNG BỘ
// -------------------------------------------------------------------
const runPythonScript = (scriptName, args = []) => {
    return new Promise((resolve, reject) => {
        const timestamp = new Date().toLocaleString();
        console.log(`[${timestamp}] 🛠️ MLOps Robot đang tự động đồng bộ môi trường thư viện cho [${scriptName}]...`);
        
        const checkEnvCmd = `python -m pip install -q -r requirements.txt --break-system-packages > /dev/null 2>&1 && python ${scriptName} ${args.join(' ')}`;
        const pythonProcess = spawn('sh', ['-c', checkEnvCmd]);
        let output = '';
        let error = '';

        pythonProcess.stdout.on('data', (data) => { output += data.toString(); });
        pythonProcess.stderr.on('data', (data) => { error += data.toString(); });

        pythonProcess.on('close', (code) => {
            if (code === 0) {
                logAction(`[THÀNH CÔNG] ${scriptName}`);
                resolve(output.trim());
            } else {
                logAction(`[THẤT BẠI] ${scriptName}: ${error}`);
                reject(error);
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
            console.log("⚠️ Thiếu cấu hình GITHUB. Bỏ qua bước đẩy code lên GitHub.");
            return resolve("Bỏ qua Git Push");
        }

        const configCmd = `git config --global user.email "bot-mlops@render.com" && git config --global user.name "MLOps Robot"`;
        const repoUrl = `https://${token}@github.com/${user}/${repo}.git`;
        
        const filesToAdd = `../frontend/js/dashboard_data.js ../frontend/js/history_predictions.json xsmn_tong_hop_20_nam.csv model_xsmn_predict.pkl system_log.txt`;
        const pushCmd = `
            git add ${filesToAdd} && 
            git commit -m "Robot: Cập nhật dữ liệu MLOps - $(date '+%Y-%m-%d %H:%M:%S')" && 
            git pull ${repoUrl} main --rebase --autostash && 
            git push ${repoUrl} HEAD:main
        `;

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
// 3. CHUỒI PIPELINE MLOPS CHẠY TỰ ĐỘNG NGẦM
// -------------------------------------------------------------------
const runDailyMLOpsPipeline = async () => {
    const startTime = Date.now();
    console.log("\n======================================================================");
    console.log(`⚡ [START WORKFLOW] KÍCH HOẠT CHUỖI QUY TRÌNH MLOPS TỰ ĐỘNG`);
    console.log("======================================================================");
    
    try {
        console.log("\n👉 [BƯỚC 1/6] Tiến hành cào dữ liệu xổ số mới từ internet...");
        await runPythonScript('cao_du_lieu_tu_dong.py');
        console.log("✅ Hoàn thành Bước 1.");

        console.log("\n👉 [BƯỚC 2/6] Trích xuất đặc trưng đặc biệt (data_training_ai.csv)...");
        await runPythonScript('chuyen_thanh_du_lieu_huan_luyen.py');
        console.log("✅ Hoàn thành Bước 2.");

        console.log("\n👉 [BƯỚC 3/6] Tái huấn luyện mô hình học máy Random Forest...");
        await runPythonScript('master_ai.py');        
        console.log("✅ Hoàn thành Bước 3.");

        console.log("\n👉 [BƯỚC 4/6] Chạy thuật toán dự đoán xác suất ra số vàng hôm nay...");
        await runPythonScript('du_doan.py'); 
        console.log("✅ Hoàn thành Bước 4.");

        console.log("\n👉 [BƯỚC 5/6] Đóng gói nén dữ liệu 20 năm phục vụ chế độ Offline mượt mà...");
        await runPythonScript('build_js_data.py');
        console.log("✅ Hoàn thành Bước 5.");

        console.log("\n👉 [BƯỚC 6/6] Đồng bộ hóa file dashboard_data.js lên đám mây GitHub...");
        try {
            await autoPushToGitHub();
        } catch (gitErr) {
            console.log("⚠️ Git push thất bại.");
        }
        console.log("✅ Hoàn thành Bước 6.");
        
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

// Lịch chạy Cron Job lúc 9:00 hàng ngày
cron.schedule('0 9 * * *', () => {
    logAction("Điểm mốc 9h00 sáng, kích hoạt chuỗi tự động...");
    runDailyMLOpsPipeline();
}, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh"
});

// API Kích hoạt từ GitHub Actions
app.get('/ping', (req, res) => {
    // Express tự động chuyển toàn bộ tên Header về chữ thường (lowercase)
    // Do đó, X-Secret-Key từ curl sẽ được đọc bằng req.headers['x-secret-key']
    const requestSecretKey = req.headers['x-secret-key'];
    const systemSecretKey = process.env.MLOPS_SECRET_KEY;

    // 1. Kiểm tra máy chủ Render đã được cấu hình Key chưa
    if (!systemSecretKey) {
        logAction("[CẢNH BÁO] Máy chủ Render chưa thiết lập cấu hình MLOPS_SECRET_KEY!");
        return res.status(500).json({
            success: false,
            message: "Lỗi cấu hình máy chủ backend."
        });
    }

    // 2. Đối soát Key gửi từ GitHub Actions lên có khớp không
    if (!requestSecretKey || requestSecretKey !== systemSecretKey) {
        logAction("[CẢNH BÁO] Yêu cầu gọi API /ping bị từ chối do sai hoặc thiếu X-Secret-Key!");
        return res.status(401).json({
            success: false,
            message: "Unauthorized: Khóa xác thực X-Secret-Key không chính xác."
        });
    }

    logAction("[TRIGGER] Xác thực GitHub Actions thành công. Chuỗi Pipeline bắt đầu.");
    
    // Trả phản hồi ngay lập tức cho GitHub Actions để không bị lỗi timeout
    res.json({ 
        success: true, 
        status: "Đã nhận lệnh đánh thức và xác thực thành công!", 
        message: "Hệ thống MLOps Pipeline đang tự động khởi chạy ngầm trên Render."
    });
    
    // Kích hoạt tiến trình chạy ngầm các file Python
    runDailyMLOpsPipeline();
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log("======================================================================");
    console.log(`🚀 [ONLINE] Node MLOps Backend đang kích hoạt tại Port ${PORT}`);
    console.log("======================================================================");
});
