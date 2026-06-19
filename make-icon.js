// 生成应用图标:加载 icon.html,截成 1024×1024 PNG 存到 build/icon.png
// 用法: ./node_modules/.bin/electron make-icon.js
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    x: -3000,
    y: 0,
    show: true,
    transparent: true,
    frame: false,
    useContentSize: true,
    webPreferences: { contextIsolation: true },
  })
  await win.loadFile('icon.html')
  await new Promise((r) => setTimeout(r, 500))
  const img = await win.webContents.capturePage()
  fs.writeFileSync(path.join(__dirname, 'build', 'icon.png'), img.toPNG())
  const sz = img.getSize()
  console.log('ICON_SAVED ' + sz.width + 'x' + sz.height)
  app.quit()
})
