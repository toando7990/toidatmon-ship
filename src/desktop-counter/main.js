// main.js — tiến trình chính Electron.
//
// App này KHÔNG chứa logic đặt món/thanh toán — chỉ mở đúng trang web
// /counter đã có sẵn (React app, cùng backend canister + VPS như bản web)
// trong 1 cửa sổ desktop riêng, có icon, chạy độc lập không cần mở trình
// duyệt. Mọi tính năng (chọn món, tạo đơn, hiện QR Tingee...) vẫn nằm trong
// web app — sửa/cập nhật tính năng vẫn làm ở src/frontend như bình thường,
// KHÔNG cần build lại app desktop này (trừ khi đổi chính giao diện cửa sổ).
//
// Đổi COUNTER_URL bên dưới nếu domain/đường dẫn đổi.

const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('node:path');

const COUNTER_URL =
  process.env.BBH_COUNTER_URL || 'https://www.bunbohue65.com/counter';

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    title: 'Bún Bò Huế 65 - Quầy',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#FCFAF5',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(COUNTER_URL);

  // Mở link ra ngoài (nếu có) bằng trình duyệt hệ thống thay vì trong cửa
  // sổ app — app quầy chỉ cần ở đúng trang /counter.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Menu tối giản — bỏ các mục không cần thiết cho 1 app quầy (không phải app
// soạn thảo nội dung), giữ lại Cmd+Q / Cmd+R / DevTools để tiện hỗ trợ kỹ
// thuật khi cần.
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'Xem',
      submenu: [
        {
          label: 'Tải lại',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.loadURL(COUNTER_URL),
        },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
