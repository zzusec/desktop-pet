// 临时:验证氛围特效(真实时间渲染,让雪花真正飘落后截图)
// 用法: ./node_modules/.bin/electron shot-fx.js
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 600,
    height: 560,
    x: -4000,
    y: 100,
    show: true,
    backgroundColor: '#243049', // 深色夜空背景,雪花/星星更清楚
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  await win.loadFile('index.html')
  await new Promise((r) => setTimeout(r, 500))
  await win.webContents.executeJavaScript('window.__pet && window.__pet.fx && window.__pet.fx()') // none→snow
  await new Promise((r) => setTimeout(r, 2200)) // 真实等待,让雪花铺满
  const img = await win.webContents.capturePage()
  fs.writeFileSync(path.join(__dirname, 'shot_fx.png'), img.toPNG())
  console.log('FX_SHOT_SAVED')
  app.quit()
})
