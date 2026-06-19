// 仅用于「验证渲染效果」的临时脚本(不影响正式运行)。
// 在屏幕外开一个带背景色的小窗口加载 index.html,等动画跑起来后截图存成 shot.png。
// 用法: npx electron verify-shot.js
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 640,
    height: 600,
    x: -4000, // 放到屏幕外,不打扰
    y: 100,
    show: true,
    backgroundColor: '#9ec9ef', // 给透明 canvas 一个背景,方便看清
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  await win.loadFile('index.html')
  await new Promise((r) => setTimeout(r, 1600)) // 等呼吸/眨眼/开场气泡

  const img = await win.webContents.capturePage()
  fs.writeFileSync(path.join(__dirname, 'shot.png'), img.toPNG())
  console.log('SHOT_SAVED')
  app.quit()
})
