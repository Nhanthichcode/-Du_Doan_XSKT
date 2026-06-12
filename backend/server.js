const express = require('express');
const { spawn, exec } = require('child_process');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const fs = require('fs');
const path = require('path');

const logPath = path.join(__dirname, 'system_log.txt');

const logAction = (message) => {
    try {
        const timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        const logEntry = `[${timestamp}] [NODE] ${message}\n`;

        fs.appendFileSync(logPath, logEntry, 'utf8');
        console.log(logEntry.trim());
    } catch (err) {
        console.error("❌ Không thể ghi vào file log:", err);
    }
};

const runPythonScript = (scriptName, args = []) => {
    return new Promise((resolve, reject) => {
        logAction(`🛠️ Robot đang đồng bộ môi trường & chạy [${scriptName}]...`);

        const checkEnvCmd = `python -m pip install -q -r requirements.txt --break-system-packages > /dev/null 2>&1 && python ${scriptName} ${args.join(' ')}`;
        const pythonProcess = spawn('sh', ['-c', checkEnvCmd]);

        let output = '';
        let error = '';

        pythonProcess.stdout.on('data', (data) => { output += data.toString(); });
        pythonProcess.stderr.on('data', (data) => { error += data.toString(); });

        pythonProcess.on('close', (code) => {
            if (code === 0) {
                logAction(`✅ [THÀNH CÔNG] ${scriptName}`);
                resolve(output.trim());
            } else {
                logAction(`❌ [THẤT BẠI] ${scriptName}: ${error}`);
                reject(error);
            }
        });
    });
};


const autoPushToGitHub = () => {
    return new Promise((resolve, reject) => {
        logAction(`🚀 [GITHUB] Đang chuẩn bị đồng bộ toàn bộ dữ liệu lên GitHub...`);

        const token = process.env.GITHUB_TOKEN;
        const user = process.env.GITHUB_USER;
        const repo = process.env.GITHUB_REPO;

        if (!token || !user || !repo) {
            logAction("⚠️ Thiếu cấu hình GITHUB. Bỏ qua bước đẩy code.");
            return resolve("Bỏ qua Git Push");
        }

        const configCmd = `git config --global user.email "bot-mlops@render.com" && git config --global user.name "MLOps Robot"`;
        const repoUrl = `https://${token}@github.com/${user}/${repo}.git`;

        // Thêm --ignore-errors để không chết chuỗi nếu có 1 file bị thiếu
        const filesToAdd = `../frontend/js/dashboard_data.js ../frontend/js/history_predictions.json xsmn_tong_hop_20_nam.csv model_xsmn_predict.pkl system_log.txt`;

        const pushCmd = `
            git add ${filesToAdd} --ignore-errors && 
            git commit -m "Robot: Cập nhật dữ liệu MLOps - $(date '+%Y-%m-%d %H:%M:%S')" && 
            git pull ${repoUrl} main --rebase --autostash && 
            git push ${repoUrl} HEAD:main
        `;

        exec(`${configCmd} && ${pushCmd}`, (error, stdout, stderr) => {
            if (error) {
                logAction(`❌ Lỗi tự động push GitHub: ${stderr || error}`);
                return reject(error);
            }
            logAction(`✅ [GITHUB] Đã đẩy thành công dữ liệu mới lên Git!`);
            resolve(stdout);
        });
    });
};

const runDailyMLOpsPipeline = async () => {
    const startTime = Date.now();
    logAction("======================================================================");
    logAction(`⚡ [START WORKFLOW] KÍCH HOẠT CHUỖI QUY TRÌNH MLOPS TỰ ĐỘNG`);
    logAction("======================================================================");

    try {
        logAction("👉 [BƯỚC 1/6] Tiến hành cào dữ liệu xổ số mới...");
        await runPythonScript('cao_du_lieu_tu_dong.py');

        logAction("👉 [BƯỚC 2/6] Trích xuất đặc trưng (data_training_ai.csv)...");
        await runPythonScript('chuyen_thanh_du_lieu_huan_luyen.py');

        logAction("👉 [BƯỚC 3/6] Tái huấn luyện mô hình học máy...");
        await runPythonScript('master_ai.py');

        logAction("👉 [BƯỚC 4/6] Dự đoán xác suất ra số vàng hôm nay...");
        await runPythonScript('du_doan.py');

        logAction("👉 [BƯỚC 5/6] Đóng gói JSON & JS tĩnh...");
        await runPythonScript('build_js_data.py');

        logAction("👉 [BƯỚC 6/6] Đồng bộ lên đám mây GitHub...");
        try {
            await autoPushToGitHub();
        } catch (gitErr) {
            logAction("⚠️ Git push thất bại, nhưng pipeline không dừng.");
        }

        const durationSec = Math.round((Date.now() - startTime) / 1000);
        logAction("======================================================================");
        logAction(`🎉 [HOÀN THÀNH XUẤT SẮC] Toàn bộ hệ thống chạy ngầm mất ${durationSec} giây!`);
        logAction("======================================================================\n");

    } catch (err) {
        logAction(`💥 [SỰ CỐ NGHIÊM TRỌNG] Chuỗi quy trình bị đứt gãy: ${err}`);
        logAction("======================================================================\n");
    }
};

cron.schedule('0 9 * * *', () => {
    logAction("⏰ [ĐỒNG HỒ NỘI BỘ] Điểm mốc 9h00 sáng, kích hoạt tự động...");
    runDailyMLOpsPipeline();
}, { scheduled: true, timezone: "Asia/Ho_Chi_Minh" });

app.get('/ping', (req, res) => {
    logAction(`🔔 -> NHẬN LỆNH KÍCH HOẠT TỪ WATCHDOG (GITHUB ACTIONS)!`);
    res.json({ success: true, status: "Đã nhận lệnh đánh thức!" });
    runDailyMLOpsPipeline();
});

app.get('/logs', (req, res) => {
    const logFilePath = path.join(__dirname, 'system_log.txt');
    
    // Kiểm tra xem file có tồn tại không
    if (fs.existsSync(logFilePath)) {
        // Trả file text về trình duyệt với định dạng UTF-8
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.sendFile(logFilePath);
    } else {
        res.status(404).send("❌ Chưa có file log nào được tạo trên hệ thống.");
    }
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    logAction("======================================================================");
    logAction(`🚀 [ONLINE] Node MLOps Backend đang kích hoạt tại Port ${PORT}`);
    logAction("======================================================================");
});